/**
 * C-02 (batch4 v0.18.1, ADR-0003 addendum v0.18.1): an ordinary report is pinned as bytes. writeReports writes the report of a fixed
 * input in a temporary directory of its own; the latest.md and latest.json it wrote are read back and compared with the committed files
 * under tests/fixtures/report-golden/ as Buffers (the files, after the writer's notation of the forbidden characters: ADR-0020), and the
 * history file it wrote with latest.json. The inputs (tests/report-golden-input.ts) are checked with fixed numbers apart from the expected
 * files, and the expected files are checked for the sections and marks they are meant to hold.
 * Change an expected file only in the commit that changes the output on purpose, with the changed lines and the reason in the commit
 * message and CHANGELOG, and a record that a person, or an independent review whose result a person checked, read the diff (ADR-0003
 * addendum, decision 5 and its note). There is no tool that writes them. v0.18.2's C-44 changed 10 lines of edge/latest.md (6 rows of the
 * Checks table and 4 "- Command:" lines: one code span each); plain/ and edge/latest.json did not change. v0.18.4 (batch5's C-44 rest)
 * changed 2 lines, plain/latest.md:73 and edge/latest.md:79 (the "- Command:" line writes a | without the backslash); the two latest.json
 * did not change.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, type BuildReportInput } from "../src/report/build-report.ts";
import { writeReports } from "../src/report/write.ts";
import { FORBIDDEN_RANGES } from "../src/security/raw-chars.ts";
import type { CheckResult } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";
import { changedByC44, edgeInput, plainInput } from "./report-golden-input.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "report-golden");
const BS = String.fromCharCode(92);
const ESC = String.fromCharCode(0x1b);
const RLO = String.fromCharCode(0x202e);

interface Written { md: Buffer; json: Buffer; history: Buffer }

/** writeReports in a directory of its own (removed afterwards); the files read back from the paths it returned. */
function written(input: BuildReportInput): Written {
  const tmp = makeTempDir("aiqh-golden-");
  try {
    const w = writeReports(buildReport(input), tmp.dir);
    return { md: readFileSync(w.latestMd), json: readFileSync(w.latestJson), history: readFileSync(w.history) };
  } finally {
    tmp.cleanup();
  }
}

const forbidden = (cp: number): boolean => FORBIDDEN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);

/** A line for the failure message: a forbidden character as U+XXXX, so that the message itself holds none raw. */
const shown = (line: string | undefined): string =>
  line === undefined ? "(no line)" : [...line].map((ch) => (forbidden(ch.codePointAt(0) ?? 0) ? `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}` : ch)).join("");

/** The first line where two texts differ, for the failure message. */
function firstDifference(actual: string, expected: string): string {
  const a = actual.split("\n");
  const e = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, e.length); i += 1) {
    if (a[i] !== e[i]) return `line ${i + 1}: written [${shown(a[i])}], expected [${shown(e[i])}]`;
  }
  return "same lines, different bytes";
}

function expectBytes(actual: Buffer, file: string): void {
  const expected = readFileSync(path.join(FIXTURES, file));
  const same = actual.equals(expected);
  expect(same, same ? "" : `${file} differs from what writeReports wrote: ${firstDifference(actual.toString("utf8"), expected.toString("utf8"))}`).toBe(true);
}

const count = (results: CheckResult[], test: (r: CheckResult) => boolean): number => results.filter(test).length;
const hasRaw = (s: string): boolean => s.includes(ESC) || s.includes(RLO);

describe("report golden (C-02): the files writeReports writes are the committed bytes", () => {
  for (const [name, make] of [["plain", plainInput], ["edge", edgeInput]] as const) {
    it(`${name}: latest.md and latest.json as written, and the history file the same as latest.json`, () => {
      const w = written(make());
      expectBytes(w.md, `${name}/latest.md`);
      expectBytes(w.json, `${name}/latest.json`);
      expect(w.history.equals(w.json)).toBe(true);
    });
  }
});

describe("report golden: the inputs keep their cases (fixed numbers, apart from the expected files)", () => {
  it("plain: 8 checks (PASS 5, FAIL 2, SKIPPED 1), the four parsers, a | in a command, a FAIL outside \".\", raw characters, no C-44 value", () => {
    const r = plainInput().results;
    expect(r.length).toBe(8);
    expect([count(r, (c) => c.status === "PASS"), count(r, (c) => c.status === "FAIL"), count(r, (c) => c.status === "SKIPPED")]).toEqual([5, 2, 1]);
    expect(count(r, (c) => c.timedOut)).toBe(1);
    expect(count(r, (c) => !c.required)).toBe(1);
    expect(count(r, (c) => c.outputTruncated)).toBe(1);
    expect(r.filter((c) => c.parsed?.status === "parsed").map((c) => c.parsed?.tool).sort()).toEqual(["eslint", "node-test", "pytest", "vitest"]);
    expect(count(r, (c) => c.command.includes("|"))).toBe(1);
    expect(count(r, (c) => c.status === "FAIL" && c.cwd !== ".")).toBe(1);
    expect(count(r, (c) => hasRaw(c.stderrTail))).toBe(1);
    expect(count(r, (c) => c.stderrTail.includes("`".repeat(3)))).toBe(1);
    expect(count(r, (c) => /AKIA[A-Z]{16}/.test(c.stdoutTail))).toBe(1);
    // plain is the set that v0.18.2's C-44 must leave as it is: none of its commands, working directories or names is a C-44 value
    expect(count(r, (c) => changedByC44(c.command) || changedByC44(c.cwd) || changedByC44(c.name))).toBe(0);
  });

  it("edge: the eight forms E1–E8 (PASS 4, FAIL 4) and the 10 lines v0.18.2's C-44 changes (6 table rows, 4 \"- Command:\" lines)", () => {
    const r = edgeInput().results;
    expect(r.map((c) => c.name)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]);
    expect([count(r, (c) => c.status === "PASS"), count(r, (c) => c.status === "FAIL")]).toEqual([4, 4]);
    expect(count(r, (c) => c.command.includes("`"))).toBe(4);
    expect(count(r, (c) => c.command.startsWith("`"))).toBe(1);
    expect(count(r, (c) => c.command.includes("``"))).toBe(1);
    expect(count(r, (c) => c.command.includes("|") && c.command.includes("`"))).toBe(1);
    expect(count(r, (c) => c.cwd.includes("`"))).toBe(1);
    expect(count(r, (c) => c.command.startsWith(" ") && c.command.endsWith(" "))).toBe(2);
    expect(count(r, (c) => !changedByC44(c.command) && !changedByC44(c.cwd))).toBe(1);
    expect(count(r, (c) => c.status === "FAIL" && hasRaw(c.stderrTail))).toBe(4);
    expect(count(r, (c) => c.parsed?.status === "parsed")).toBe(1);
    const rows = count(r, (c) => changedByC44(c.command));
    const commandLines = count(r, (c) => c.status !== "PASS" && (changedByC44(c.command) || changedByC44(c.cwd)));
    expect([rows, commandLines]).toEqual([6, 4]);
  });
});

describe("report golden: the expected files hold what they are meant to (and no raw character)", () => {
  const read = (file: string): string => readFileSync(path.join(FIXTURES, file), "utf8");

  it("plain/latest.md: the sections, a 4-backtick fence, the mask, the notation of ESC and U+202E, \\| in a cell and | outside (v0.18.4)", () => {
    const md = read("plain/latest.md");
    for (const s of ["## Summary", "## Categories", "## Checks", "## Parsed Output", "## Failure Details", "<details><summary>stderr (tail)</summary>", "<details><summary>stdout (tail)</summary>", "[REDACTED:"]) expect(md).toContain(s);
    expect(md.split("\n")).toContain(`${"`".repeat(4)}text`);
    expect(md).toContain(`${BS}u{1B}`);
    expect(md).toContain(`${BS}u{202E}`);
    expect(md).toContain(`| \`npm test ${BS}| tee log\` |`);
    expect(md).toContain(`- Command: \`npm test | tee log\` (cwd: \`pkg\`)`);
    expect(md).not.toContain(`- Command: \`npm test ${BS}| tee log\``);
    expect(md).not.toContain("AKIA");
  });

  it("edge/latest.md: the commands with backticks and the working directory with one, as C-44 writes them (one code span each)", () => {
    const md = read("edge/latest.md");
    for (const s of ["| `` echo `date` `` |", "| ``` echo ``x`` ``` |", "| `` `npm` test `` |", "| `  npm test  ` |", "(cwd: ``dir`x``)"]) expect(md).toContain(s);
    // the forms of v0.18.1 (one backtick around the value) are gone
    for (const s of ["| `echo `date`` |", "| ``npm` test` |", "| ` npm test ` |", "(cwd: `dir`x`)"]) expect(md).not.toContain(s);
  });

  it("the JSON files hold the raw characters as JSON escapes; no expected file holds a forbidden character raw", () => {
    expect(read("plain/latest.json")).toContain(`${BS}u001b`);
    expect(read("plain/latest.json")).toContain(`${BS}u202e`);
    for (const file of ["plain/latest.md", "plain/latest.json", "edge/latest.md", "edge/latest.json"]) {
      const raw = [...read(file)].filter((ch) => forbidden(ch.codePointAt(0) ?? 0) && ch !== "\n");
      expect(raw, file).toEqual([]);
    }
  });
});
