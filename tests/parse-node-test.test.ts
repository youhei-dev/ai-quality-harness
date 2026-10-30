/**
 * v0.18.0 (ADR-0028 decision 14; the batch3 design, final, §3): the node:test parser. It reads the summary block of Node's spec
 * reporter (the default, `<U+2139> <word> <value>`) or TAP reporter (`# <word> <value>`) — 8 lines: tests, suites, pass, fail, cancelled,
 * skipped, todo, duration_ms — from a whole stdout only, in two steps: the shape of the 8 lines (one mark, the words in order, values of
 * digits and dots), then the values (1-15 digits, a duration, tests = pass + fail + cancelled + skipped + todo, the exit code is 1 exactly
 * when fail + cancelled > 0). A cut stdout is output-truncated, no block no-summary, two blocks or one that fails the values
 * unexpected-summary. Names come from the spec reporter's failing list (`test at <location>` then the marked name; TODO left out).
 * The fixtures are outputs of Node v24.13.1 for made-up tests, the work directory replaced by /work (the colored one keeps ESC as {ESC}).
 * Written to run on the commit before the change too (no new imports; `node-test` is cast as pytest's tests do).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { consoleLines, statusText, summaryText } from "../src/parse/describe.ts";
import { parseOutputAs, type OutputFacts } from "../src/parse/read.ts";
import { PARSE_INPUT_MAX, PARSE_LINE_MAX, PARSED_ITEMS_MAX } from "../src/parse/text.ts";
import type { ParsedOutput, ParserTool } from "../src/types.ts";
import { fake } from "./helpers.ts";

const NODE_TEST = "node-test" as ParserTool;
const FIXTURES = path.join(import.meta.dirname, "fixtures", "parse");
const ESC = String.fromCharCode(27);
const fx = (form: string): string => readFileSync(path.join(FIXTURES, `node-test-${form}.stdout.txt`), "utf8").replaceAll("{ESC}", ESC);
const INFO = String.fromCodePoint(0x2139);
const CROSS = String.fromCodePoint(0x2716);
const CHECK = String.fromCodePoint(0x2714);
const SPEC = `${INFO} `;
const TAP = "# ";

function parse(stdout: string, exitCode: number | null, stdoutTruncated = false): ParsedOutput {
  const exec: OutputFacts = { stdout, stderr: "", exitCode, stdoutTruncated, stderrTruncated: false };
  return parseOutputAs(NODE_TEST, exec);
}
const counts = (tests: number, suites: number, pass: number, fail: number, cancelled: number, skipped: number, todo: number): Record<string, number> => ({ tests, suites, pass, fail, cancelled, skipped, todo });
const parsed = (c: Record<string, number>, items: Array<{ kind: string; name: string }> = [], itemsOmitted = 0): ParsedOutput => ({ tool: NODE_TEST, status: "parsed", reason: null, truncated: false, counts: c, items, itemsOmitted });
const unparsed = (reason: string, truncated = false): ParsedOutput => ({ tool: NODE_TEST, status: "unparsed", reason, truncated, counts: {}, items: [], itemsOmitted: 0 } as ParsedOutput);
const failed = (name: string): { kind: string; name: string } => ({ kind: "failed-test", name });

const WORDS = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"] as const;
type Word = (typeof WORDS)[number];
/** The 8 lines of a block: the values of the spec-fail example unless given (tests 6, suites 1, pass 2, fail 3, todo 1). */
function block(mark: string, values: Partial<Record<Word, string>> = {}): string[] {
  const base: Record<Word, string> = { tests: "6", suites: "1", pass: "2", fail: "3", cancelled: "0", skipped: "0", todo: "1", duration_ms: "50.632666" };
  return WORDS.map((w) => `${mark}${w} ${values[w] ?? base[w]}`);
}
const text = (lines: readonly string[]): string => `${lines.join("\n")}\n`;
const SPEC_FAIL_COUNTS = counts(6, 1, 2, 3, 0, 0, 1);
/** The run of the §3.12 table: test lines, the run's block, the failing list with one entry. */
const RUN_LINES = [`${CHECK} ok one (0.3ms)`, `${CROSS} fails assert (0.4ms)`, ...block(SPEC), "", `${CROSS} failing tests:`, "", "test at b.test.mjs:5:1", `${CROSS} fails assert (0.4ms)`, "  AssertionError: 1 !== 2"];
const FORGED = block(SPEC, { tests: "99", pass: "99", fail: "0", todo: "0" });
/** Filler lines of 64 UTF-16 units (63 and a newline) that are no block. */
const filler = (units: number): string => {
  const line = `${"y".repeat(63)}\n`;
  return line.repeat(Math.floor(units / 64)) + "z".repeat(units % 64);
};

describe("node-test: the forms of Node v24.13.1 (fixtures), with the exit code of each run", () => {
  it.each([
    ["spec-pass", 0, counts(8, 2, 6, 0, 0, 1, 1), []],
    ["spec-fail", 1, SPEC_FAIL_COUNTS, ["b.test.mjs:5:1 fails assert", "b.test.mjs:6:1 throws", "b.test.mjs:8:3 nested fail"]],
    ["spec-fail-color", 1, SPEC_FAIL_COUNTS, ["b.test.mjs:5:1 fails assert", "b.test.mjs:6:1 throws", "b.test.mjs:8:3 nested fail"]],
    ["spec-skip", 0, counts(2, 0, 0, 0, 0, 2, 0), []],
    ["spec-multi", 0, counts(9, 2, 7, 0, 0, 1, 1), []],
    ["spec-empty", 0, counts(0, 0, 0, 0, 0, 0, 0), []],
    ["spec-coverage", 0, counts(1, 0, 1, 0, 0, 0, 0), []],
    ["spec-loaderr", 1, counts(2, 0, 1, 1, 0, 0, 0), ["f.test.mjs:1:1 f.test.mjs"]],
    ["spec-cancelled", 1, counts(2, 0, 1, 0, 1, 0, 0), ["h.test.mjs:2:1 slow"]],
    ["spec-todo-fail", 0, counts(2, 0, 1, 0, 0, 0, 1), []],
    ["spec-forged", 1, counts(2, 0, 1, 1, 0, 0, 0), ["e.test.mjs:7:1 fails"]],
    ["npm-pass", 0, counts(8, 2, 6, 0, 0, 1, 1), []],
    ["npm-fail", 1, SPEC_FAIL_COUNTS, ["b.test.mjs:5:1 fails assert", "b.test.mjs:6:1 throws", "b.test.mjs:8:3 nested fail"]],
    ["tap-pass", 0, counts(8, 2, 6, 0, 0, 1, 1), []],
    ["tap-fail", 1, SPEC_FAIL_COUNTS, []],
    ["tap-forged", 1, counts(2, 0, 1, 1, 0, 0, 0), []],
    ["tap-escaped", 0, counts(2, 0, 2, 0, 0, 0, 0), []],
  ] as const)("%s (exit %i): parsed", (form, exitCode, c, names) => {
    expect(parse(fx(form), exitCode)).toEqual(parsed(c, names.map(failed)));
  });
  it.each([
    ["dot-fail", 1],
    ["junit-fail", 1],
    ["two-reporters", 1],
  ] as const)("%s (exit %i): no block of 8 lines, no-summary", (form, exitCode) => {
    expect(parse(fx(form), exitCode)).toEqual(unparsed("no-summary"));
  });
  it("an empty stdout (the reporter wrote to a file): no-summary", () => {
    expect(parse("", 0)).toEqual(unparsed("no-summary"));
  });
  it("the forged single lines of a test (a spec line and a TAP comment) are not a block: the run's block is read", () => {
    expect(fx("spec-forged").split("\n").slice(0, 2)).toEqual([`${INFO} tests 99`, "# tests 99"]);
    expect(parse(fx("spec-forged"), 1).counts.tests).toBe(2);
  });
});

describe("node-test: the names of the spec reporter's failing list", () => {
  it("<location> <name> without the time; a TODO is left out; TAP's not ok lines are not read", () => {
    const r = parse(fx("spec-fail"), 1);
    expect(r.items.map((i) => i.name)).toEqual(["b.test.mjs:5:1 fails assert", "b.test.mjs:6:1 throws", "b.test.mjs:8:3 nested fail"]);
    expect(parse(fx("spec-todo-fail"), 0).items).toEqual([]);
    expect(parse(fx("tap-fail"), 1).items).toEqual([]);
  });
  it("at most PARSED_ITEMS_MAX names; the rest are counted in itemsOmitted", () => {
    const n = PARSED_ITEMS_MAX + 10;
    const list = Array.from({ length: n }, (_, k) => [`test at t.test.mjs:${k + 1}:1`, `${CROSS} case ${k + 1} (0.1ms)`]).flat();
    const r = parse(text([...block(SPEC, { tests: String(n), suites: "0", pass: "0", fail: String(n), todo: "0" }), "", `${CROSS} failing tests:`, "", ...list]), 1);
    expect(r.status).toBe("parsed");
    expect(r.items).toHaveLength(PARSED_ITEMS_MAX);
    expect(r.items[0]).toEqual(failed("t.test.mjs:1:1 case 1"));
    expect(r.itemsOmitted).toBe(10);
  });
  it("a secret in a test name is masked", () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const r = parse(text([...block(SPEC, { tests: "1", suites: "0", pass: "0", fail: "1", todo: "0" }), "", `${CROSS} failing tests:`, "", "test at s.test.mjs:1:1", `${CROSS} uses ${secret} (0.1ms)`]), 1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.name).not.toContain(secret);
    expect(r.items[0]?.name).toContain("[REDACTED");
  });
  it("a name line without a `test at` line just before it is not a name", () => {
    const r = parse(text([...block(SPEC, { tests: "1", suites: "0", pass: "0", fail: "1", todo: "0" }), "", `${CROSS} failing tests:`, "", `${CROSS} orphan (0.1ms)`, "test at o.test.mjs:2:1", `${CROSS} real (0.1ms)`]), 1);
    expect(r.items).toEqual([failed("o.test.mjs:2:1 real")]);
  });
});

describe("node-test: the display", () => {
  it("tests <n> (pass <n>, fail <n>[, cancelled][, skipped][, todo]); suites <n>; names under the check", () => {
    const r = parse(fx("spec-fail"), 1);
    expect(summaryText(r)).toBe("tests 6 (pass 2, fail 3, todo 1); suites 1");
    expect(summaryText(parse(fx("spec-pass"), 0))).toBe("tests 8 (pass 6, fail 0, skipped 1, todo 1); suites 2");
    expect(summaryText(parse(fx("spec-cancelled"), 1))).toBe("tests 2 (pass 1, fail 0, cancelled 1); suites 0");
    expect(summaryText(parse(fx("spec-empty"), 0))).toBe("tests 0 (pass 0, fail 0); suites 0");
    expect(consoleLines(r)).toEqual(["parsed: node-test — tests 6 (pass 2, fail 3, todo 1); suites 1", "  failed-test: b.test.mjs:5:1 fails assert", "  failed-test: b.test.mjs:6:1 throws", "  failed-test: b.test.mjs:8:3 nested fail"]);
  });
  it("not read: the reason words, output-truncated among them", () => {
    const r = parse(text(RUN_LINES), 1, true);
    expect(consoleLines(r)).toEqual(["parsed: node-test — not read (output-truncated)"]);
    expect(statusText(r)).toBe("unparsed (output-truncated)");
  });
});

// The table of the batch3 design, final, §3.12 (B3-D-R1-001, B3-D-R1-002): rows a-d and e01-e21.
describe("node-test: the boundary table (§3.12)", () => {
  const SIZE_OVER = PARSE_INPUT_MAX + 4096;
  it("a: not cut, only the run's block: parsed with its name", () => {
    expect(parse(text(RUN_LINES), 1)).toEqual(parsed(SPEC_FAIL_COUNTS, [failed("b.test.mjs:5:1 fails assert")]));
  });
  it("b: not cut, a forged block printed by a test before the run's: unexpected-summary", () => {
    expect(parse(text([...FORGED, ...RUN_LINES]), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("c1: the runner cut stdout and only the forged block is in view: output-truncated", () => {
    expect(parse(text(FORGED), 0, true)).toEqual(unparsed("output-truncated", true));
  });
  it("c2: the window cut stdout, the run's block outside it and the forged one last: output-truncated", () => {
    const out = text(RUN_LINES) + filler(SIZE_OVER) + text(FORGED);
    expect(out.length).toBeGreaterThan(PARSE_INPUT_MAX);
    expect(parse(out, 1)).toEqual(unparsed("output-truncated", true));
  });
  it("d1: the runner cut stdout and only the run's block is in view: output-truncated (the rule)", () => {
    expect(parse(text(RUN_LINES), 1, true)).toEqual(unparsed("output-truncated", true));
  });
  it("d2: the window cut stdout and the run's block is last: output-truncated (the rule)", () => {
    expect(parse(filler(SIZE_OVER) + text(RUN_LINES), 1)).toEqual(unparsed("output-truncated", true));
  });
  it("e01: 8 lines of the right shape and values: parsed", () => {
    expect(parse(text(block(SPEC)), 1)).toEqual(parsed(SPEC_FAIL_COUNTS));
  });
  it("e02: one count of 16 digits, the other 7 lines right: unexpected-summary", () => {
    expect(parse(text(block(SPEC, { suites: "1234567890123456" })), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e03: a block with a 16-digit count and a right block: two blocks, unexpected-summary", () => {
    expect(parse(text([...block(SPEC, { suites: "1234567890123456" }), ...block(SPEC)]), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e04: 15 digits exactly (the sum holds): parsed", () => {
    const n = "999999999999999";
    expect(parse(text(block(SPEC, { tests: n, suites: "0", pass: n, fail: "0", todo: "0" })), 0)).toEqual(parsed(counts(999999999999999, 0, 999999999999999, 0, 0, 0, 0)));
  });
  it("e05: one word differs (passed): no-summary", () => {
    const lines = block(SPEC);
    lines[2] = `${SPEC}passed 2`;
    expect(parse(text(lines), 1)).toEqual(unparsed("no-summary"));
  });
  it("e06: the order differs (fail before pass): no-summary", () => {
    const lines = block(SPEC);
    [lines[2], lines[3]] = [lines[3] ?? "", lines[2] ?? ""];
    expect(parse(text(lines), 1)).toEqual(unparsed("no-summary"));
  });
  it("e07: the marks are mixed (spec and TAP): no-summary", () => {
    const lines = block(SPEC);
    lines[4] = `${TAP}cancelled 0`;
    expect(parse(text(lines), 1)).toEqual(unparsed("no-summary"));
  });
  it("e08: duration_ms of 1.2.3 (the shape, not a value): unexpected-summary", () => {
    expect(parse(text(block(SPEC, { duration_ms: "1.2.3" })), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e09: a count of 1.5: unexpected-summary", () => {
    expect(parse(text(block(SPEC, { skipped: "1.5" })), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e10: the sum does not hold (tests 7): unexpected-summary", () => {
    expect(parse(text(block(SPEC, { tests: "7" })), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e11: the exit code does not agree (fail 3, exit 0): unexpected-summary", () => {
    expect(parse(text(block(SPEC)), 0)).toEqual(unparsed("unexpected-summary"));
  });
  it("e12: no exit code (the run was stopped): unexpected-summary", () => {
    expect(parse(text(block(SPEC)), null)).toEqual(unparsed("unexpected-summary"));
  });
  it("e13: the 8 lines indented by 2 spaces: no-summary", () => {
    expect(parse(text(block(SPEC).map((l) => `  ${l}`)), 1)).toEqual(unparsed("no-summary"));
  });
  it("e14: 7 lines (no suites line): no-summary", () => {
    expect(parse(text(block(SPEC).filter((l) => !l.startsWith(`${SPEC}suites `))), 1)).toEqual(unparsed("no-summary"));
  });
  it("e15: a TAP block: parsed", () => {
    expect(parse(text(block(TAP)), 1)).toEqual(parsed(SPEC_FAIL_COUNTS));
  });
  it("e16: an empty value (only spaces after duration_ms): no-summary", () => {
    expect(parse(text(block(SPEC, { duration_ms: " " })), 1)).toEqual(unparsed("no-summary"));
  });
  it("e17: leading zeros (007) are read as 7: parsed", () => {
    expect(parse(text(block(SPEC, { tests: "007", suites: "0", pass: "007", fail: "0", todo: "0" })), 0)).toEqual(parsed(counts(7, 0, 7, 0, 0, 0, 0)));
  });
  it("e18: cut and no block: output-truncated", () => {
    expect(parse("no block here\n", 0, true)).toEqual(unparsed("output-truncated", true));
  });
  it("e19: an extra summary-like line before the block (9 lines): parsed", () => {
    expect(parse(text([`${SPEC}tests 6`, ...block(SPEC)]), 1)).toEqual(parsed(SPEC_FAIL_COUNTS));
  });
  it("e20: two right blocks (spec and TAP): unexpected-summary", () => {
    expect(parse(text([...block(SPEC), ...block(TAP)]), 1)).toEqual(unparsed("unexpected-summary"));
  });
  it("e21: the window starts inside the block (its first lines cut, the rest in view): output-truncated", () => {
    const head = text(block(SPEC));
    const out = head + filler(PARSE_INPUT_MAX - head.length + 3 * 16);
    expect(out.length).toBeGreaterThan(PARSE_INPUT_MAX);
    expect(out.length - PARSE_INPUT_MAX).toBeLessThan(head.length);
    expect(parse(out, 1)).toEqual(unparsed("output-truncated", true));
  });
});

// The batch3 design, final, §3.13 (B3-D-R2-001): where the counts stop being shown. The rule is unchanged (a cut stdout is never read);
// these pin the edge: the window of PARSE_INPUT_MAX UTF-16 units, the runner's cut, a large synthetic run.
describe("node-test: where the counts stop being shown (§3.13)", () => {
  const run = text(RUN_LINES);
  it("a stdout of exactly PARSE_INPUT_MAX (1,048,576) UTF-16 units with the run's block last: parsed", () => {
    expect(PARSE_INPUT_MAX).toBe(1_048_576);
    const out = filler(PARSE_INPUT_MAX - run.length) + run;
    expect(out.length).toBe(PARSE_INPUT_MAX);
    expect(parse(out, 1)).toEqual(parsed(SPEC_FAIL_COUNTS, [failed("b.test.mjs:5:1 fails assert")]));
  });
  it("one unit more: output-truncated", () => {
    const out = `x${filler(PARSE_INPUT_MAX - run.length)}${run}`;
    expect(out.length).toBe(PARSE_INPUT_MAX + 1);
    expect(parse(out, 1)).toEqual(unparsed("output-truncated", true));
  });
  it("the runner's cut alone (a small stdout): output-truncated", () => {
    expect(parse(run, 1, true)).toEqual(unparsed("output-truncated", true));
  });
  it("UTF-16 units, not bytes: a stdout of multibyte characters under the window in units is read", () => {
    const line = `${"あ".repeat(63)}\n`;
    const body = line.repeat(Math.floor((PARSE_INPUT_MAX - run.length) / 64));
    const out = body + run;
    expect(out.length).toBeLessThanOrEqual(PARSE_INPUT_MAX);
    expect(Buffer.byteLength(out, "utf8")).toBeGreaterThan(PARSE_INPUT_MAX);
    expect(parse(out, 1).status).toBe("parsed");
  });
  it("a synthetic run of 20,000 passing tests (about 61 units a test): over the window, output-truncated; 10,000: parsed", () => {
    const tests = (n: number): string => {
      const lines: string[] = [];
      for (let k = 1; k <= n; k += 1) lines.push(`${CHECK} test ${String(k).padStart(5, "0")} checks one behaviour of the module (0.1ms)`);
      return text([...lines, ...block(SPEC, { tests: String(n), suites: "0", pass: String(n), fail: "0", todo: "0" })]);
    };
    const big = tests(20_000);
    expect(big.length).toBeGreaterThan(PARSE_INPUT_MAX);
    expect(parse(big, 0)).toEqual(unparsed("output-truncated", true));
    const small = tests(10_000);
    expect(small.length).toBeLessThan(PARSE_INPUT_MAX);
    expect(parse(small, 0)).toEqual(parsed(counts(10_000, 0, 10_000, 0, 0, 0, 0)));
  });
  it("a line longer than PARSE_LINE_MAX is not read (a block line that long is no block line)", () => {
    const lines = block(SPEC);
    lines[7] = `${SPEC}duration_ms ${"1".repeat(PARSE_LINE_MAX)}`;
    expect(parse(text(lines), 1)).toEqual(unparsed("no-summary"));
  });
});
