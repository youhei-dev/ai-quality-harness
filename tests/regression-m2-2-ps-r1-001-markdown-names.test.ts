/**
 * M2-2-PS-R1-001 (v0.8.1, ADR-0028 addendum): text read from a tool's output reaches latest.md as text, never as Markdown syntax.
 * The names of a check's `parsed` list are lines of one code block whose fence comes from fenceFor (as the output tails), and the
 * Summary line of Failure Details (errorSummary: the first line of the tool's output) is one code span whose backtick string is one
 * longer than any run inside. CommonMark 0.31.2 reads no link, image, HTML, character reference, emphasis or autolink inside either
 * (4.5 fenced code blocks, 6.1 code spans), and no name or summary can close them. latest.json and the terminal keep the values as
 * before. No Markdown renderer is added (P8): the structure is checked against the rules of those two sections. This file holds no
 * forbidden character raw (U+202E is built from its code point).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { escapeRawChars } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult, ParsedOutput, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const RLO = String.fromCodePoint(0x202e);
const ticks = (n: number): string => "`".repeat(n);

/** Text that Markdown would read as a link, an image, HTML, a character reference, emphasis or an autolink. */
const HOSTILE = [
  "link [details](https://example.invalid/path)",
  "image ![x](https://example.invalid/i.png)",
  'html <img src="https://example.invalid/i.png">',
  "comment a <!-- hidden --> b",
  "named &amp; &hyphen; &lt;b&gt;",
  "numeric &#x202E;abc &#8238;",
  "emphasis **bold** _it_",
  "strike ~~gone~~",
  `one ${ticks(1)}x${ticks(1)} y`,
  `three ${ticks(3)}x${ticks(3)} y`,
  `six ${ticks(6)}x${ticks(6)} y`,
  "autolink <https://example.invalid/auto>",
  "bare https://example.invalid/bare www.example.invalid",
  `${ticks(3)}text starts like a fence`,
  `raw ${RLO} notation`,
];
/** Text whose ends matter to a code span: spaces at both ends or one end, a backtick at one end, backticks inside spaces, spaces only. */
const EDGES = ["  padded  ", " left", "right ", `${ticks(1)}starts`, `ends${ticks(1)}`, ` ${ticks(2)} both ${ticks(2)} `, "   "];
/** Signs of the syntax above: none may stand on a line of latest.md outside a code block or the Summary's code span. */
const MARKERS = ["example.invalid", "<img", "<!--", "&#", "&amp;", "&hyphen;", "**bold**", "~~gone~~"];

const longestRun = (text: string): number => Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));

/** The code block right after `heading` (a blank line between), by CommonMark 4.5: it closes at a line of at least as many backticks. */
function blockAfter(md: string, heading: string): { fence: number; info: string; body: string[]; closed: boolean } | null {
  const lines = md.split("\n");
  const at = lines.indexOf(heading);
  if (at === -1 || lines[at + 1] !== "") return null;
  const open = /^ {0,3}(`{3,})([^`]*)$/.exec(lines[at + 2] ?? "");
  if (open === null) return null;
  const fence = (open[1] ?? "").length;
  const body: string[] = [];
  for (const line of lines.slice(at + 3)) {
    const close = /^ {0,3}(`{3,}) *$/.exec(line);
    if (close !== null && (close[1] ?? "").length >= fence) return { fence, info: (open[2] ?? "").trim(), body, closed: true };
    body.push(line);
  }
  return { fence, info: (open[2] ?? "").trim(), body, closed: false };
}

/** The lines of `md` outside every code block (CommonMark 4.5, backtick fences). */
function outsideBlocks(md: string): string[] {
  const out: string[] = [];
  let fence: number | null = null;
  for (const line of md.split("\n")) {
    if (fence === null) {
      const open = /^ {0,3}(`{3,})[^`]*$/.exec(line);
      if (open !== null) fence = (open[1] ?? "").length;
      else out.push(line);
      continue;
    }
    const close = /^ {0,3}(`{3,}) *$/.exec(line);
    if (close !== null && (close[1] ?? "").length >= fence) fence = null;
  }
  return out;
}

/**
 * What `text` shows when it is one code span and nothing else (CommonMark 6.1), or null: it opens and closes with backtick strings of
 * the same length, no backtick string of that length is inside (the first one would close it), and one space comes off each end when
 * both ends are spaces and the content is not spaces only.
 */
function codeSpanShows(text: string): string | null {
  const open = /^`+/.exec(text)?.[0].length ?? 0;
  const close = /`+$/.exec(text)?.[0].length ?? 0;
  if (open === 0 || close !== open || text.length <= 2 * open) return null;
  const inner = text.slice(open, text.length - close);
  if ([...inner.matchAll(/`+/g)].some((m) => m[0].length === open)) return null;
  return inner.startsWith(" ") && inner.endsWith(" ") && !/^ +$/.test(inner) ? inner.slice(1, -1) : inner;
}

/** The Summary lines of latest.md, each as what it shows (null when it is not one code span). */
function summariesShown(md: string): Array<string | null> {
  return md
    .split("\n")
    .filter((l) => l.startsWith("- Summary: "))
    .map((l) => codeSpanShows(l.slice("- Summary: ".length)));
}

/** Lines outside the code blocks (the Summary's code span left out) that still carry a sign of Markdown syntax from the input. */
function syntaxOutside(md: string): string[] {
  return outsideBlocks(md)
    .map((l) => (l.startsWith("- Summary: ") && codeSpanShows(l.slice("- Summary: ".length)) !== null ? "- Summary: " : l))
    .filter((l) => MARKERS.some((m) => l.includes(m)));
}

function report(check: Partial<CheckResult>): VerificationReport {
  return buildReport({
    config: { projectRoot: "/p", configPath: "/p/aiqh.config.jsonc", project: { name: "p" }, outputDir: "/p/a", security: DEFAULT_SECURITY, checks: [] },
    results: [checkResult({ name: "unit", kind: "unit", status: "FAIL", exitCode: 1, errorSummary: "exit code 1", ...check })],
    git: null,
    startedAt: new Date(0),
    finishedAt: new Date(1000),
    toolVersion: "t",
    runId: "00000000-0000-4000-8000-000000000000",
  });
}

function parsed(names: readonly string[], itemsOmitted = 0): ParsedOutput {
  const n = names.length + itemsOmitted;
  return {
    tool: "vitest",
    status: "parsed",
    reason: null,
    truncated: false,
    counts: { testFiles: 1, testFilesFailed: 1, tests: n, testsFailed: n, errors: 0 },
    items: names.map((name) => ({ kind: "failed-test", name })),
    itemsOmitted,
  };
}

describe("M2-2-PS-R1-001: the names of a parsed check are lines of one code block", () => {
  const names = [...HOSTILE, ...EDGES];
  const md = renderMarkdown(report({ parsed: parsed(names, 3) }));

  it("every name (Markdown syntax, edge spaces) and the line of the names not listed are the lines of one closed code block, info text", () => {
    const block = blockAfter(md, "### unit — vitest");
    expect(block).not.toBeNull();
    expect(block?.info).toBe("text");
    expect(block?.closed).toBe(true);
    expect(block?.body).toEqual([...names.map((n) => `- failed-test: ${escapeRawChars(n)}`), "- … 3 more (not listed)"]);
  });
  it("no line of the list can close the block, and the fence is longer than any run of backticks in it (as fenceFor gives the tails)", () => {
    const block = blockAfter(md, "### unit — vitest");
    const body = block?.body ?? [];
    expect(body.filter((l) => /^ {0,3}`{3,}/.test(l))).toEqual([]);
    expect(block?.fence ?? 0).toBeGreaterThan(Math.max(2, longestRun(body.join("\n"))));
  });
  it("no sign of the names' syntax stands outside the code blocks", () => {
    expect(syntaxOutside(md)).toEqual([]);
  });
});

describe("M2-2-PS-R1-001 (S2): the Summary line of Failure Details is one code span that shows the summary as it is", () => {
  // The title holds the summary as notation (a raw U+202E would reach the test output).
  it.each([...HOSTILE, ...EDGES].map((summary) => ({ summary, title: JSON.stringify(escapeRawChars(summary)) })))("summary $title", ({ summary }) => {
    const md = renderMarkdown(report({ errorSummary: summary }));
    expect(summariesShown(md)).toEqual([escapeRawChars(summary)]);
    expect(syntaxOutside(md)).toEqual([]);
  });
  it("the backtick string is one longer than the longest run inside (six backticks inside: seven)", () => {
    const md = renderMarkdown(report({ errorSummary: `six ${ticks(6)}x${ticks(6)} y` }));
    expect(md).toContain(`- Summary: ${ticks(7)}six ${ticks(6)}x${ticks(6)} y${ticks(7)}`);
  });
  it("a check without a summary still shows -", () => {
    expect(renderMarkdown(report({ errorSummary: null })).split("\n")).toContain("- Summary: -");
  });
});

/** A fake vitest (its file name chooses the vitest parser) that prints a summary, a first stderr line with syntax, and failed tests. */
const FIRST_LINE = `see [here](https://example.invalid/s) <img src="https://example.invalid/i.png"> &#x202E; **bold** ${ticks(2)}x${ticks(2)} end${ticks(1)}`;
const NAMES = HOSTILE.slice(0, 13);

function project(): string {
  const t = makeTempDir("aiqh-ps-r1-001-");
  cleanups.push(t.cleanup);
  const out = ` Test Files  1 failed (1)\n      Tests  ${NAMES.length} failed (${NAMES.length})\n`;
  const err = [FIRST_LINE, "", `⎯⎯⎯⎯⎯⎯⎯ Failed Tests ${NAMES.length} ⎯⎯⎯⎯⎯⎯⎯`, "", ...NAMES.map((n) => ` FAIL  tests/a.test.ts > ${n}`), ""].join("\n");
  mkdirSync(path.join(t.dir, "unit"));
  writeFileSync(path.join(t.dir, "unit", "out.txt"), out);
  writeFileSync(path.join(t.dir, "unit", "err.txt"), err);
  writeFileSync(
    path.join(t.dir, "unit", "vitest.mjs"),
    [
      'import { readFileSync } from "node:fs";',
      'process.stdout.write(readFileSync(new URL("./out.txt", import.meta.url), "utf8"));',
      'process.stderr.write(readFileSync(new URL("./err.txt", import.meta.url), "utf8"));',
      "process.exitCode = 1;",
      "",
    ].join("\n"),
  );
  const checks = [{ name: "unit", kind: "unit", command: "node unit/vitest.mjs" }];
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks }));
  return t.dir;
}

async function verify(dir: string): Promise<{ code: number; lines: string[]; report: VerificationReport; md: string }> {
  const lines: string[] = [];
  const code = await runVerify({ cwd: dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  const report = JSON.parse(readFileSync(path.join(dir, "artifacts", "verification", "latest.json"), "utf8")) as VerificationReport;
  const md = readFileSync(path.join(dir, "artifacts", "verification", "latest.md"), "utf8");
  return { code, lines, report, md };
}

describe("M2-2-PS-R1-001: through verify", () => {
  const expectedNames = NAMES.map((n) => `tests/a.test.ts > ${n}`);
  const expectedSummary = `exit code 1: ${FIRST_LINE}`;

  it("control: latest.json and the terminal hold the names and the summary as they were read (the fix is in latest.md only)", async () => {
    const r = await verify(project());
    expect(r.code).toBe(1);
    const check = r.report.checks[0];
    expect(check?.errorSummary).toBe(expectedSummary);
    expect(check?.parsed?.items).toEqual(expectedNames.map((name) => ({ kind: "failed-test", name })));
    expect(r.lines.filter((l) => /^ {6}FAIL {2}/.test(l)).map((l) => l.slice(l.indexOf(" — ") + 3))).toEqual([escapeRawChars(expectedSummary)]);
    for (const n of expectedNames.slice(0, 10)) expect(r.lines).toContain(`        failed-test: ${escapeRawChars(n)}`);
    expect(r.lines).toContain(`        … ${expectedNames.length - 10} more`);
  });
  it("latest.md: the names are the lines of one closed code block, the summary one code span, and no syntax stands outside them", async () => {
    const r = await verify(project());
    const block = blockAfter(r.md, "### unit — vitest");
    expect(block?.closed).toBe(true);
    expect(block?.body).toEqual(expectedNames.map((n) => `- failed-test: ${escapeRawChars(n)}`));
    expect(summariesShown(r.md)).toEqual([escapeRawChars(expectedSummary)]);
    expect(syntaxOutside(r.md)).toEqual([]);
  });
});
