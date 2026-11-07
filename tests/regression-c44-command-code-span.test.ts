/**
 * C-44 (batch4 v0.18.2. Design final docs/reviews/batch4-design/design-final.md §3.1, ADR-0028 addendum v0.18.2, B4-D-Q5 and B4-D-Q6 = A):
 * latest.md shows a check's command (the Checks table's Command column and Failure Details' `- Command:`) and its working directory
 * (`cwd:`) as one code span each, made like the Summary line's (codeSpan: a backtick string one longer than the longest run inside; a space
 * at each end when the text starts or ends with a backtick, or starts and ends with a space without being only spaces; empty text stays
 * empty). Up to v0.18.1 they were wrapped in one backtick, so a backtick inside closed the span there (ADR-0028's known limit).
 *
 * What each span shows is read back with the CommonMark 0.31.2 §6.1 rule. In a table cell, GFM reads `\|` as `|` before the inline
 * parse, so the cell shows the command itself; outside the table the backslash of `\|` stays (the known limit, B4-D-Q6). A value without a
 * backtick that does not start and end with a space keeps the bytes of v0.18.1 (only the empty working directory changes: it was two
 * backticks with nothing between, which shows the two backticks; it is empty now).
 */
import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { escapeRawChars } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult } from "../src/types.ts";
import { checkResult } from "./helpers.ts";

const t = (n: number): string => "`".repeat(n);
const RLO = String.fromCodePoint(0x202e);

/** latest.md of one FAIL check (one table row and one Failure Details section). */
function md(check: Partial<CheckResult>): string {
  return renderMarkdown(
    buildReport({
      config: { projectRoot: "/p", configPath: "/p/aiqh.config.jsonc", project: { name: "p" }, outputDir: "/p/a", security: DEFAULT_SECURITY, checks: [] },
      results: [checkResult({ name: "unit", kind: "unit", status: "FAIL", exitCode: 1, errorSummary: "exit code 1", ...check })],
      git: null,
      startedAt: new Date(0),
      finishedAt: new Date(1000),
      toolVersion: "t",
      runId: "00000000-0000-4000-8000-000000000000",
    }),
  );
}

/**
 * The code span that starts at `at` (CommonMark 6.1): a backtick string of length n, then the text up to the next backtick string of
 * exactly length n; one space comes off each end when both ends are spaces and the content is not only spaces. No backtick at `at`, or
 * no closing string: null.
 */
function spanAt(text: string, at: number): { shown: string; end: number } | null {
  const n = /^`+/.exec(text.slice(at))?.[0].length ?? 0;
  if (n === 0) return null;
  const re = /`+/g;
  re.lastIndex = at + n;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[0].length !== n) continue;
    const inner = text.slice(at + n, m.index);
    const shown = inner.startsWith(" ") && inner.endsWith(" ") && !/^ +$/.test(inner) ? inner.slice(1, -1) : inner;
    return { shown, end: m.index + n };
  }
  return null;
}

/** The cells of a GFM table row: split at each `|` without a backslash before it, the outer two dropped, each trimmed. */
function cells(row: string): string[] {
  const parts = row.split(/(?<!\\)\|/);
  return parts.slice(1, -1).map((c) => c.trim());
}

const lines = (text: string): string[] => text.split("\n");
const row = (text: string): string => lines(text).find((l) => l.startsWith("| 1 | unit |")) ?? "";
const commandLine = (text: string): string => lines(text).find((l) => l.startsWith("- Command: ")) ?? "";

/** What the Checks table's Command cell shows (GFM: `\|` is `|` first), or null when the cell is not exactly one code span. */
function tableShows(text: string): string | null {
  const c = cells(row(text));
  if (c.length !== 8) return null;
  const cell = (c[7] ?? "").replace(/\\\|/g, "|");
  if (cell === "") return "";
  const s = spanAt(cell, 0);
  return s !== null && s.end === cell.length ? s.shown : null;
}

/** What `- Command: <span> (cwd: <span>)` shows, or null when the line is not exactly that shape. An empty span is empty text. */
function listShows(text: string): { command: string; cwd: string } | null {
  const l = commandLine(text);
  const head = "- Command: ";
  if (!l.startsWith(head)) return null;
  const c = spanAt(l, head.length);
  if (c === null || !l.startsWith(" (cwd: ", c.end)) return null;
  const at = c.end + " (cwd: ".length;
  const w = l[at] === ")" ? { shown: "", end: at } : spanAt(l, at);
  if (w === null || l.slice(w.end) !== ")") return null;
  return { command: c.shown, cwd: w.shown };
}

/** The value as it stands between the backticks (one line; a `|` is `\|` so it stays in its cell). */
const cellOf = (s: string): string => escapeRawChars(s).replace(/\|/g, "\\|");

const COMMANDS: Array<[string, string]> = [
  ["one backtick", `echo ${t(1)}date${t(1)}`],
  ["a run of two", `echo ${t(2)}x${t(2)}`],
  ["a run of three", `a ${t(3)}b${t(3)} c`],
  ["a backtick first", `${t(1)}npm${t(1)} test`],
  ["a backtick last", `npm ${t(1)}test${t(1)}`],
  ["backticks at both ends", `${t(1)}x${t(1)}`],
  ["one backtick only", t(1)],
  ["spaces at both ends", " npm test "],
  ["a backtick and |", `npm test | grep ${t(1)}x${t(1)}`],
  ["backticks just before and after |", `a${t(1)}|${t(1)}b`],
  ["a run of three and |", `${t(3)}|${t(3)}`],
  ["spaces at both ends and |", " npm test | tee log "],
  ["a backtick first and a space last", `${t(1)}x${t(1)} `],
  ["a space first and a backtick last", ` x${t(1)}`],
  ["a raw character and a backtick (shown as notation)", `echo ${RLO}${t(1)}`],
];

describe("C-44: the Checks table's Command cell is one code span that shows the command", () => {
  it.each(COMMANDS)("%s", (_title, command) => {
    const text = md({ command });
    expect(cells(row(text))).toHaveLength(8);
    expect(tableShows(text)).toBe(escapeRawChars(command));
  });
});

describe("C-44: Failure Details' `- Command:` and `cwd:` are one code span each", () => {
  it.each(COMMANDS)("command: %s (the `\\|` stays outside the table: the known limit)", (_title, command) => {
    expect(listShows(md({ command }))).toEqual({ command: cellOf(command), cwd: "." });
  });
  it.each([
    ["a backtick inside", `dir${t(1)}x`],
    ["backticks at both ends", `${t(1)}d${t(1)}`],
    ["a run of two", `a${t(2)}b`],
    ["spaces at both ends", " d "],
    ["empty (the schema allows it; it was two backticks with nothing between)", ""],
  ])("cwd: %s", (_title, cwd) => {
    expect(listShows(md({ command: "npm test", cwd }))).toEqual({ command: "npm test", cwd: escapeRawChars(cwd) });
  });
  it("the backtick string is one longer than the longest run inside (a run of six: seven), as on the Summary line", () => {
    const text = md({ command: `six ${t(6)}x${t(6)} y`, cwd: `d${t(6)}` });
    expect(commandLine(text)).toBe(`- Command: ${t(7)}six ${t(6)}x${t(6)} y${t(7)} (cwd: ${t(7)} d${t(6)} ${t(7)})`);
    expect(row(text).endsWith(` | ${t(7)}six ${t(6)}x${t(6)} y${t(7)} |`)).toBe(true);
  });
});

describe("C-44: a value without a backtick that does not start and end with a space keeps the bytes of v0.18.1", () => {
  it.each([
    ["plain", "npm test", "."],
    ["a | and a working directory", "npm test | tee log", "pkg"],
    ["a space first only", " npm test", "."],
    ["a space last only, a space inside the working directory", "npm test ", "a b"],
    ["a working directory of spaces only", "npm run lint -- --max-warnings=0", "  "],
    ["a raw character (shown as notation)", `node -e "x${RLO}"`, "dir"],
  ])("%s", (_title, command, cwd) => {
    const text = md({ command, cwd });
    expect(row(text).endsWith(` | ${t(1)}${cellOf(command)}${t(1)} |`)).toBe(true);
    expect(commandLine(text)).toBe(`- Command: ${t(1)}${cellOf(command)}${t(1)} (cwd: ${t(1)}${escapeRawChars(cwd)}${t(1)})`);
  });
});
