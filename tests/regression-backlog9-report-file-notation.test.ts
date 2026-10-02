/**
 * Backlog 9 (ADR-0020): the report files and the generated config never hold a forbidden character raw. The terminal has had one
 * exit since v0.5.2 (ADR-0016); the files did not: `latest.md` kept all of them (ESC and CR of a check's output included), and
 * `latest.json` / `history/*.json` kept DEL, C1, U+2028 / U+2029, the bidi controls and U+FEFF (JSON.stringify escapes only the C0
 * controls). The writer now converts the text just before it writes: JSON as `\uXXXX` (the parsed data is the same), Markdown as
 * `\u{HEX}` (the notation of the terminal). Markdown also kept two ways to change its structure: a check's output with ``` (a
 * heading outside the fence) and an LF in a one-line field such as the project name (a heading of its own).
 * The forbidden characters are built from the code points at run time: this file holds none of them raw. The functions are imported
 * as namespaces so that this file also runs against v0.5.23, where the tests that expect the new behavior fail on their own.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import * as write from "../src/report/write.ts";
import * as raw from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

/** Every forbidden code point (the set of raw-chars.ts: 75 of them). */
const FORBIDDEN: number[] = raw.FORBIDDEN_RANGES.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
const chr = (cp: number): string => String.fromCodePoint(cp);
const hex = (cp: number): string => cp.toString(16).toUpperCase();
const label = (cp: number): string => `U+${hex(cp).padStart(4, "0")}`;

type EscapeAsJson = (text: string) => string;
const escapeAsJson: EscapeAsJson = (text) => {
  const f = (raw as { escapeRawCharsAsJson?: EscapeAsJson }).escapeRawCharsAsJson;
  if (f === undefined) throw new Error("escapeRawCharsAsJson does not exist");
  return f(text);
};

/** Lines of `md` that start with `prefix` outside every code fence (a fence closes with a run of at least the same length). */
function outsideFence(md: string, prefix: string): number {
  let fence: number | null = null;
  let n = 0;
  for (const l of md.split("\n")) {
    const m = /^(`{3,})(.*)$/.exec(l);
    if (m !== null) {
      const run = (m[1] ?? "").length;
      if (fence === null) {
        fence = run;
        continue;
      }
      if (run >= fence && (m[2] ?? "").trim() === "") {
        fence = null;
        continue;
      }
    }
    if (fence === null && l.startsWith(prefix)) n += 1;
  }
  return n;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function reportWith(over: { name?: string; root?: string; configPath?: string; branch?: string; stdout?: string; stderr?: string; summary?: string | null; command?: string; cwd?: string }): VerificationReport {
  return buildReport({
    config: {
      projectRoot: over.root ?? "/proj",
      configPath: over.configPath ?? "/proj/aiqh.config.jsonc",
      project: { name: over.name ?? "demo" },
      outputDir: "/proj/artifacts/verification",
      security: DEFAULT_SECURITY,
      checks: [],
    },
    results: [checkResult({ name: "unit", kind: "unit", status: "FAIL", exitCode: 1, cwd: over.cwd ?? ".", command: over.command ?? "npm test", errorSummary: over.summary ?? "exit code 1", stdoutTail: over.stdout ?? "", stderrTail: over.stderr ?? "" })],
    git: { commit: "0123456789abcdef", branch: over.branch ?? "main", dirty: false },
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: new Date("2026-01-01T00:00:01.000Z"),
    toolVersion: "0.5.24",
  });
}

function written(report: VerificationReport): { json: string; md: string; history: string } {
  const tmp = makeTempDir();
  cleanups.push(tmp.cleanup);
  const out = path.join(tmp.dir, "out");
  mkdirSync(out, { recursive: true });
  const paths = write.writeReports(report, out);
  return { json: readFileSync(paths.latestJson, "utf8"), md: readFileSync(paths.latestMd, "utf8"), history: readFileSync(paths.history, "utf8") };
}

describe("backlog 9: the set of forbidden characters is the one of raw-chars.ts", () => {
  it("has 75 code points (a change of the set is a decision of ADR-0014, not of this file)", () => {
    expect(FORBIDDEN.length).toBe(75);
  });
});

describe("backlog 9: escapeRawCharsAsJson writes every forbidden character as a JSON escape", () => {
  for (const cp of FORBIDDEN) {
    it(`${label(cp)}: no raw character is left, and JSON.parse gives the character back`, () => {
      const out = escapeAsJson(`a${chr(cp)}b`);
      expect(raw.findRawChars(out)).toEqual([]);
      expect(JSON.parse(`"${out}"`)).toBe(`a${chr(cp)}b`);
    });
  }
  it("leaves TAB, LF, ordinary text and characters outside the set unchanged", () => {
    for (const s of ["a\tb\nc", "日本語 abc é", chr(0x200b), chr(0xfffd), chr(0xa0), chr(0x1f600), '{"k": "v"}\n']) expect(escapeAsJson(s)).toBe(s);
  });
  it("is the same for a whole JSON document: the parsed data does not change", () => {
    const data = { name: `x${chr(0x202e)}y${chr(0x7f)}${chr(0x85)}${chr(0x2028)}z${chr(0xfeff)}w`, list: [chr(0x2066), chr(0x9b)] };
    const out = escapeAsJson(JSON.stringify(data, null, 2));
    expect(raw.findRawChars(out)).toEqual([]);
    expect(JSON.parse(out)).toEqual(data);
  });
});

describe("backlog 9: writeReports never writes a forbidden character raw", () => {
  const all = FORBIDDEN.map(chr).join("");
  const places: Array<[string, (v: string) => Parameters<typeof reportWith>[0]]> = [
    ["project.name", (v) => ({ name: `n${v}` })],
    ["root", (v) => ({ root: `/r${v}` })],
    ["configPath", (v) => ({ configPath: `/c${v}/aiqh.config.jsonc` })],
    ["git.branch", (v) => ({ branch: `b${v}` })],
    ["stdout tail", (v) => ({ stdout: `out ${v} end` })],
    ["stderr tail", (v) => ({ stderr: `err ${v} end` })],
    ["errorSummary", (v) => ({ summary: `exit code 1: ${v}` })],
    ["command", (v) => ({ command: `echo ${v}` })],
  ];
  for (const [where, make] of places) {
    it(`${where}: all 75 characters, in the three files`, () => {
      const report = reportWith(make(all));
      const w = written(report);
      for (const [file, text] of Object.entries(w)) expect(raw.findRawChars(text), `${file} has a raw forbidden character`).toEqual([]);
      // the JSON is the same data as the report
      expect(JSON.parse(w.json)).toEqual(JSON.parse(JSON.stringify(report)));
      expect(JSON.parse(w.history)).toEqual(JSON.parse(JSON.stringify(report)));
    });
  }
  it("Markdown shows the character as the notation of the terminal", () => {
    const md = written(reportWith({ stdout: `a${chr(0x1b)}[31mred${chr(0x1b)}[0m${chr(0x0d)}b${chr(0x202e)}c` })).md;
    expect(md).toContain("\\u{1B}[31mred\\u{1B}[0m\\u{D}b\\u{202E}c");
  });
  it("a TAB in a tail stays (it cannot change the structure)", () => {
    expect(written(reportWith({ stdout: "col1\tcol2" })).md).toContain("col1\tcol2");
  });
});

describe("backlog 9: Markdown keeps its structure", () => {
  it("a check's output with ``` and a heading does not leave a heading outside the fence", () => {
    const md = renderMarkdown(reportWith({ stdout: "x\n```\n\n# Injected heading\n\n```text\ny" }));
    expect(outsideFence(md, "# Injected heading")).toBe(0);
  });
  it("the fence is one longer than the longest run of backticks in the output (at least 3)", () => {
    const md = renderMarkdown(reportWith({ stdout: "a `````` b", stderr: "plain" }));
    expect(md).toContain("```````text\n");
    expect(md).toContain("```text\nplain\n```\n");
  });
  it("an LF in a one-line field (the project name, the working directory, the summary, the branch) does not start a line of its own", () => {
    const md = renderMarkdown(reportWith({ name: "ok\n## INJECTED-SECTION\n| a | b |", branch: "x\n## INJECTED-BRANCH", summary: "exit code 1: s\n## INJECTED-SUMMARY", cwd: "/w\n## INJECTED-CWD" }));
    for (const p of ["## INJECTED-SECTION", "| a | b |", "## INJECTED-BRANCH", "## INJECTED-SUMMARY", "## INJECTED-CWD"]) expect(md.split("\n").filter((l) => l.startsWith(p)), p).toEqual([]);
    expect(md).toContain("ok\\u{A}## INJECTED-SECTION");
  });
  it("a `|` in a branch name stays inside its table cell", () => {
    expect(renderMarkdown(reportWith({ branch: "feat|x" }))).toContain("| Git branch | feat\\|x |");
  });
});

describe("backlog 9: an ordinary report is written as it was", () => {
  it("no forbidden character, no LF in a one-line field, no backticks: the files are the report as JSON and as Markdown, without any notation", () => {
    const report = reportWith({ name: "demo", stdout: "line 1\nline 2", stderr: "an error: x" });
    const w = written(report);
    expect(w.json).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(w.md).toBe(renderMarkdown(report));
    expect(w.md).not.toContain("\\u{");
    expect(w.md).toContain("```text\nan error: x\n```\n");
  });
});
