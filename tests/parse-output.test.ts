/**
 * v0.8.0 (ADR-0028, Q1): the output parsers read a check's captured output for display only. These tests pin what each parser reads
 * from real outputs (copies of vitest, eslint and npm audit outputs with the home path replaced by /work/...), what it refuses
 * (malformed, empty, huge numbers, a summary whose numbers do not add up), the limits (input, line, items, name length, time), that a
 * name is masked before it is cut, and that the worst inputs take linear time (P3). The verdict side is in parse-verify.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PARSERS, parseOutputAs, type ReadDeps } from "../src/parse/read.ts";
import type { ToolParser } from "../src/parse/tool.ts";
import { CLOCK_EVERY, PARSED_ITEMS_MAX, PARSED_NAME_MAX, PARSE_INPUT_MAX, PARSE_LINE_MAX, PARSE_TIME_LIMIT_MS } from "../src/parse/text.ts";
import type { ParserTool } from "../src/types.ts";
import { fake } from "./helpers.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "parse");
const fx = (name: string): string => readFileSync(path.join(FIXTURES, name), "utf8");

interface Out {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}
function parse(tool: ParserTool, out: Out, deps?: ReadDeps) {
  return parseOutputAs(
    tool,
    { stdout: out.stdout ?? "", stderr: out.stderr ?? "", exitCode: out.exitCode === undefined ? 0 : out.exitCode, stdoutTruncated: out.stdoutTruncated ?? false, stderrTruncated: out.stderrTruncated ?? false },
    deps,
  );
}
const VITEST_ZERO = { testFilesExpectedFail: 0, testFilesFailed: 0, testFilesPassed: 0, testFilesSkipped: 0, testFilesTodo: 0, testsExpectedFail: 0, testsFailed: 0, testsPassed: 0, testsSkipped: 0, testsTodo: 0, errors: 0 };

describe("vitest: the summary lines and the names in the Failed Tests / Failed Suites sections", () => {
  it("the self verify's unit output (agent reporter): 156 files and 2036 tests passed, nothing named", () => {
    const r = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt") });
    expect(r).toEqual({ tool: "vitest", status: "parsed", reason: null, truncated: false, counts: { ...VITEST_ZERO, testFiles: 156, testFilesPassed: 156, tests: 2036, testsPassed: 2036 }, items: [], itemsOmitted: 0 });
  });
  it("the self verify's unit-minpath output (default reporter, 769 lines): skipped files and tests are counted", () => {
    const r = parse("vitest", { stdout: fx("vitest-self-minpath.stdout.txt") });
    expect(r.status).toBe("parsed");
    expect(r.counts).toEqual({ ...VITEST_ZERO, testFiles: 156, testFilesPassed: 155, testFilesSkipped: 1, tests: 2036, testsPassed: 2034, testsSkipped: 2 });
    expect(r.items).toEqual([]);
  });
  it.each(["agent", "plain", "ci"])("a failing run (%s reporter): counts from stdout, failed tests and suites named from stderr", (reporter) => {
    const r = parse("vitest", { stdout: fx(`vitest-${reporter}.stdout.txt`), stderr: fx("vitest-agent.stderr.txt"), exitCode: 1 });
    expect(r.status).toBe("parsed");
    expect(r.counts).toEqual({ ...VITEST_ZERO, testFiles: 3, testFilesFailed: 2, testFilesPassed: 1, tests: 6, testsFailed: 2, testsPassed: 2, testsSkipped: 1, testsTodo: 1 });
    expect(r.items).toEqual([
      { kind: "failed-suite", name: "tests/broken.test.ts [ tests/broken.test.ts ]" },
      { kind: "failed-test", name: "tests/math.test.ts > math > subtracts wrongly" },
      { kind: "failed-test", name: "tests/math.test.ts > top level fails" },
    ]);
  });
  it("the Errors line, expected fail and an empty run ('no tests') are read", () => {
    const stdout = [" Test Files  1 failed | 2 passed | 1 expected fail (4)", "      Tests  3 passed | 1 expected fail (4)", "     Errors  2 errors", "   Start at  10:00:00", ""].join("\n");
    expect(parse("vitest", { stdout }).counts).toEqual({ ...VITEST_ZERO, testFiles: 4, testFilesFailed: 1, testFilesPassed: 2, testFilesExpectedFail: 1, tests: 4, testsPassed: 3, testsExpectedFail: 1, errors: 2 });
    expect(parse("vitest", { stdout: " Test Files  no tests\n      Tests  no tests\n" }).counts).toEqual({ ...VITEST_ZERO, testFiles: 0, tests: 0 });
  });
  it("the last summary counts (a summary printed by a test before it is not the run's)", () => {
    const stdout = `${" Test Files  9 passed (9)\n      Tests  9 passed (9)\n"}${fx("vitest-self-unit.stdout.txt")}`;
    expect(parse("vitest", { stdout }).counts.tests).toBe(2036);
  });
  it("a FAIL line outside a Failed Tests / Failed Suites section is not a name (a test's own output)", () => {
    const stderr = " FAIL  printed by a test\n⎯⎯⎯ Unhandled Errors 1 ⎯⎯⎯\n FAIL  not a failed test either\n";
    expect(parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr }).items).toEqual([]);
  });
  it.each([
    ["no summary", "just some output\n", "no-summary"],
    ["empty output", "", "no-summary"],
    ["Test Files without a Tests line", " Test Files  1 passed (1)\n   Start at  10:00\n", "unexpected-summary"],
    ["an unknown word", " Test Files  1 passed (1)\n      Tests  1 flaky (1)\n", "unexpected-summary"],
    ["a word twice", " Test Files  1 passed (1)\n      Tests  1 passed | 1 passed (2)\n", "unexpected-summary"],
    ["more than the total", " Test Files  1 passed (1)\n      Tests  3 passed (2)\n", "unexpected-summary"],
    ["no total", " Test Files  1 passed\n      Tests  1 passed\n", "unexpected-summary"],
    ["a number of 16 digits", " Test Files  1 passed (1)\n      Tests  1234567890123456 passed (1234567890123456)\n", "unexpected-summary"],
    ["a number of 400 digits", ` Test Files  1 passed (1)\n      Tests  ${"9".repeat(400)} passed (${"9".repeat(400)})\n`, "unexpected-summary"],
  ])("%s: unparsed (%s)", (_name, stdout, reason) => {
    const r = parse("vitest", { stdout });
    expect(r).toEqual({ tool: "vitest", status: "unparsed", reason, truncated: false, counts: {}, items: [], itemsOmitted: 0 });
  });
});

describe("eslint: the stylish summary and the errors", () => {
  it("the sample: 6 problems (3 errors, 3 warnings); the errors are named file:line:column rule", () => {
    const r = parse("eslint", { stdout: fx("eslint-sample.stdout.txt"), exitCode: 1 });
    expect(r).toEqual({
      tool: "eslint",
      status: "parsed",
      reason: null,
      truncated: false,
      counts: { problems: 6, errors: 3, warnings: 3 },
      items: [
        { kind: "error", name: "/work/sample-eslint/src/a.js:1:7 no-unused-vars" },
        { kind: "error", name: "/work/sample-eslint/src/a.js:3:7 eqeqeq" },
        { kind: "error", name: "/work/sample-eslint/src/d.js:1:11 (no rule)" },
      ],
      itemsOmitted: 0,
    });
  });
  it("eslint prints nothing without problems: npm's header only (or nothing) with exit 0 is 0 problems", () => {
    expect(parse("eslint", { stdout: fx("eslint-self.stdout.txt") }).counts).toEqual({ problems: 0, errors: 0, warnings: 0 });
    expect(parse("eslint", { stdout: "" }).counts).toEqual({ problems: 0, errors: 0, warnings: 0 });
  });
  it("no summary with exit 1, or other output: unparsed (no-summary), not 0 problems", () => {
    expect(parse("eslint", { stdout: fx("eslint-self.stdout.txt"), exitCode: 1 }).reason).toBe("no-summary");
    expect(parse("eslint", { stdout: "[]\n" }).reason).toBe("no-summary");
    expect(parse("eslint", { stdout: "", stderr: "Oops! Something went wrong!\n", exitCode: 2 }).reason).toBe("no-summary");
  });
  it("singular forms; errors and warnings that do not add up to the problems are unexpected", () => {
    expect(parse("eslint", { stdout: "\n/w/a.js\n  1:1  error  m  r\n\n✖ 1 problem (1 error, 0 warnings)\n", exitCode: 1 }).counts).toEqual({ problems: 1, errors: 1, warnings: 0 });
    expect(parse("eslint", { stdout: "✖ 3 problems (1 error, 1 warning)\n", exitCode: 1 }).reason).toBe("unexpected-summary");
  });
});

describe("npm audit: the three summary forms and the packages with a Severity line", () => {
  it("two severities: 2 vulnerabilities (1 high, 1 critical), the packages named with their ranges", () => {
    const r = parse("npm-audit", { stdout: fx("npm-audit-two.stdout.txt"), exitCode: 1 });
    expect(r.status).toBe("parsed");
    expect(r.counts).toEqual({ vulnerabilities: 2, low: 0, moderate: 0, high: 1, critical: 1 });
    expect(r.items).toEqual([
      { kind: "high", name: "lodash <=4.17.23" },
      { kind: "critical", name: "minimist 1.0.0 - 1.2.5" },
    ]);
  });
  it("one severity ('1 critical severity vulnerability') and none ('found 0 vulnerabilities')", () => {
    expect(parse("npm-audit", { stdout: fx("npm-audit-one.stdout.txt"), exitCode: 1 }).counts).toEqual({ vulnerabilities: 1, low: 0, moderate: 0, high: 0, critical: 1 });
    expect(parse("npm-audit", { stdout: fx("npm-audit-self.stdout.txt") }).counts).toEqual({ vulnerabilities: 0, low: 0, moderate: 0, high: 0, critical: 0 });
    expect(parse("npm-audit", { stdout: "3 moderate severity vulnerabilities\n" }).counts).toEqual({ vulnerabilities: 3, low: 0, moderate: 3, high: 0, critical: 0 });
  });
  it("the JSON output, an unknown severity or more than the total: unparsed", () => {
    expect(parse("npm-audit", { stdout: '{ "vulnerabilities": {} }\n' }).reason).toBe("no-summary");
    expect(parse("npm-audit", { stdout: "2 vulnerabilities (1 high, 1 severe)\n" }).reason).toBe("unexpected-summary");
    expect(parse("npm-audit", { stdout: "2 vulnerabilities (2 high, 1 critical)\n" }).reason).toBe("unexpected-summary");
  });
});

describe("the limits (P3): input, lines, items, names", () => {
  it("only the end of a stream longer than PARSE_INPUT_MAX is read, without its first partial line; truncated is recorded", () => {
    const filler = `${"x".repeat(99)}\n`.repeat(Math.ceil((PARSE_INPUT_MAX * 2) / 100));
    const r = parse("vitest", { stdout: filler + fx("vitest-self-unit.stdout.txt") });
    expect(r.status).toBe("parsed");
    expect(r.truncated).toBe(true);
    expect(r.counts.tests).toBe(2036);
    const summaryFirst = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt") + filler });
    expect(summaryFirst).toMatchObject({ status: "unparsed", reason: "no-summary", truncated: true });
  });
  it("output the runner already cut (10 MiB) is recorded as truncated", () => {
    expect(parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stdoutTruncated: true }).truncated).toBe(true);
    expect(parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderrTruncated: true }).truncated).toBe(true);
  });
  it("a line longer than PARSE_LINE_MAX is not read: not a summary, not a name", () => {
    const longSummary = ` Test Files  1 passed (1)${" ".repeat(PARSE_LINE_MAX)}\n      Tests  1 passed (1)\n`;
    expect(parse("vitest", { stdout: longSummary }).reason).toBe("no-summary");
    const stderr = `⎯⎯⎯ Failed Tests 2 ⎯⎯⎯\n FAIL  ${"n".repeat(PARSE_LINE_MAX)}\n FAIL  short one\n`;
    expect(parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr }).items).toEqual([{ kind: "failed-test", name: "short one" }]);
  });
  it("at most PARSED_ITEMS_MAX names; the rest are counted in itemsOmitted; a name is cut to PARSED_NAME_MAX", () => {
    const fails = Array.from({ length: PARSED_ITEMS_MAX + 70 }, (_, i) => ` FAIL  t${i}.test.ts > case ${i}`).join("\n");
    const r = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr: `⎯⎯⎯ Failed Tests 120 ⎯⎯⎯\n${fails}\n` });
    expect(r.items.length).toBe(PARSED_ITEMS_MAX);
    expect(r.itemsOmitted).toBe(70);
    expect(r.items[0]).toEqual({ kind: "failed-test", name: "t0.test.ts > case 0" });
    const long = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr: `⎯⎯⎯ Failed Tests 1 ⎯⎯⎯\n FAIL  ${"y".repeat(PARSED_NAME_MAX * 2)}\n` });
    expect(long.items[0]?.name).toBe(`${"y".repeat(PARSED_NAME_MAX - 1)}…`);
  });
  it("control sequences (colors) are removed before a line is read", () => {
    const esc = String.fromCharCode(27);
    const stdout = ` ${esc}[2mTest Files${esc}[22m  ${esc}[1m${esc}[32m1 passed${esc}[39m${esc}[22m${esc}[90m (1)${esc}[39m\n${esc}[2m      Tests ${esc}[22m ${esc}[1m${esc}[32m1 passed${esc}[39m${esc}[22m${esc}[90m (1)${esc}[39m\n`;
    expect(parse("vitest", { stdout }).counts).toMatchObject({ testFiles: 1, tests: 1 });
  });
});

describe("P4: a name is masked before it is cut; the fixed words are the only text from aiqh", () => {
  const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
  it("a secret in a failed test's name is redacted", () => {
    const r = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr: `⎯⎯⎯ Failed Tests 1 ⎯⎯⎯\n FAIL  tests/a.test.ts > uses ${secret} here\n` });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.items[0]?.name).toContain("[REDACTED:");
  });
  it("a secret across the cut: masked as the whole line first, so no part of it is left", () => {
    const name = `${"p".repeat(PARSED_NAME_MAX - 8)} ${secret} tail`;
    const r = parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt"), stderr: `⎯⎯⎯ Failed Tests 1 ⎯⎯⎯\n FAIL  ${name}\n` });
    expect(r.items[0]?.name.length).toBe(PARSED_NAME_MAX);
    expect(r.items[0]?.name).not.toContain("AKIA");
  });
  it("a secret in an eslint file name and an npm audit package line is redacted", () => {
    const eslint = parse("eslint", { stdout: `\n/w/${secret}.js\n  1:1  error  m  r\n\n✖ 1 problem (1 error, 0 warnings)\n`, exitCode: 1 });
    expect(JSON.stringify(eslint)).not.toContain(secret);
    const audit = parse("npm-audit", { stdout: `# npm audit report\n\n${secret}  1.0.0\nSeverity: high\n\n1 high severity vulnerability\n`, exitCode: 1 });
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect(audit.items).toHaveLength(1);
  });
});

describe("P2: a parser that throws or runs out of time is unparsed, with the reason as a fixed word", () => {
  it("a parser that throws: parser-error, tool kept, nothing from the error", () => {
    const deps: ReadDeps = { parsers: { vitest: { tool: "vitest", parse: () => { throw new Error(`boom ${fake("AKIA", "ABCDEFGHIJKLMNOP")}`); } } } };
    expect(parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt") }, deps)).toEqual({ tool: "vitest", status: "unparsed", reason: "parser-error", truncated: false, counts: {}, items: [], itemsOmitted: 0 });
  });
  it("a parser that returns a count that is not a safe integer: parser-error (the report stays JSON data)", () => {
    const deps: ReadDeps = { parsers: { eslint: { tool: "eslint", parse: () => ({ status: "parsed", counts: { problems: Number.POSITIVE_INFINITY }, items: [], itemsOmitted: 0 }) } } };
    expect(parse("eslint", { stdout: "" }, deps).reason).toBe("parser-error");
  });
  it("pytest (v0.14.0): a parser that throws is parser-error, reading past the limit is time-limit", () => {
    const deps: ReadDeps = { parsers: { pytest: { tool: "pytest", parse: () => { throw new Error("boom"); } } } };
    expect(parse("pytest", { stdout: fx("pytest-q-passed.stdout.txt") }, deps)).toEqual({ tool: "pytest", status: "unparsed", reason: "parser-error", truncated: false, counts: {}, items: [], itemsOmitted: 0 });
    let t = 0;
    const slow: ReadDeps = { now: () => (t += PARSE_TIME_LIMIT_MS + 1) };
    expect(parse("pytest", { stdout: `${"line\n".repeat(50_000)}${fx("pytest-q-passed.stdout.txt")}` }, slow)).toMatchObject({ tool: "pytest", status: "unparsed", reason: "time-limit" });
  });
  it("reading past PARSE_TIME_LIMIT_MS: time-limit (the clock is checked while lines are read)", () => {
    let t = 0;
    const deps: ReadDeps = { now: () => (t += PARSE_TIME_LIMIT_MS + 1) };
    const stdout = `${"line\n".repeat(50_000)}${fx("vitest-self-unit.stdout.txt")}`;
    expect(parse("vitest", { stdout }, deps)).toMatchObject({ tool: "vitest", status: "unparsed", reason: "time-limit" });
  });
});

describe("P3: the worst inputs take linear time (64 KiB to 1 MiB, with an upper bound)", () => {
  const KIB = 1024;
  const fill = (unit: string, size: number): string => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  // node:test (v0.18.0): the spec reporter's marks (U+2139, U+2716) and a block of 8 lines (all zero: exit 0 agrees, so the names are read)
  const INFO = String.fromCodePoint(0x2139);
  const CROSS = String.fromCodePoint(0x2716);
  const nodeTestBlock = (n: number): string => ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"].map((w) => `${INFO} ${w} ${n}\n`).join("") + `${INFO} duration_ms 1.5\n`;
  const shapes: Record<string, (size: number) => Out> = {
    "one line without a newline": (n) => ({ stdout: fill("Test Files  1 passed | ", n), stderr: fill(" FAIL  x", n) }),
    "only newlines": (n) => ({ stdout: "\n".repeat(n), stderr: "\r\n".repeat(n / 2) }),
    "summary lines again and again": (n) => ({ stdout: fill(" Test Files  1 passed (1)\n      Tests  1 passed (1)\n", n) }),
    "a long state string just under the line limit": (n) => ({ stdout: fill(` Test Files  ${"1 passed | ".repeat(370)}(1)\n`, n) }),
    "FAIL lines in a section": (n) => ({ stdout: fx("vitest-self-unit.stdout.txt"), stderr: `⎯⎯⎯ Failed Tests 9 ⎯⎯⎯\n${fill(" FAIL  a > b > c\n", n)}` }),
    "section headers": (n) => ({ stderr: fill("⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯\n", n) }),
    "control sequences": (n) => ({ stdout: fill(`${String.fromCharCode(27)}[`, n) }),
    "control sequences in lines": (n) => ({ stdout: fill(`${`${String.fromCharCode(27)}[1;2`.repeat(500)}\n`, n), stderr: fill(`${`${String.fromCharCode(27)}[`.repeat(1500)}\n`, n) }),
    "eslint message lines": (n) => ({ stdout: fill("/w/a.js\n  1:1  error  m  r\n", n) }),
    "eslint spaces": (n) => ({ stdout: fill(`  1:1  error${" ".repeat(200)}x\n`, n) }),
    "npm audit packages": (n) => ({ stdout: `# npm audit report\n\n${fill("a  1\nSeverity: high\n", n)}` }),
    "digits": (n) => ({ stdout: fill(`Tests  ${"1".repeat(1000)} passed (1)\n`, n) }),
    // pytest (v0.14.0, item 39)
    "pytest summary lines again and again": (n) => ({ stdout: fill("1 failed, 2 passed, 3 skipped in 0.12s\n", n) }),
    "pytest rows of = only": (n) => ({ stdout: fill(`${"=".repeat(4000)}\n`, n) }),
    "pytest FAILED lines after the heading": (n) => ({ stdout: `=== short test summary info ===\n${fill("FAILED t.py::a - x\n", n)}1 failed in 0.10s\n` }),
    "pytest a summary of many words": (n) => ({ stdout: fill(`${"1 passed, ".repeat(400)}in 0.1s\n`, n) }),
    "pytest headings without a summary": (n) => ({ stdout: fill("=== short test summary info ===\n", n) }),
    // node:test (v0.18.0, ADR-0028 decision 14)
    "node-test summary blocks again and again": (n) => ({ stdout: fill(nodeTestBlock(1), n) }),
    "node-test info lines": (n) => ({ stdout: fill(`${INFO} tests 1\n`, n) }),
    "node-test TAP comment lines": (n) => ({ stdout: fill("# tests 1\n# suites 0\n# pass 1\n", n) }),
    "node-test a failing list after the block": (n) => ({ stdout: `${nodeTestBlock(0)}\n${CROSS} failing tests:\n\n${fill(`test at a.test.mjs:1:1\n${CROSS} x (1ms)\n`, n)}` }),
    "node-test values just under the line limit": (n) => ({ stdout: fill(`${INFO} tests ${"1".repeat(4000)}\n`, n) }),
  };
  const tools: ParserTool[] = ["vitest", "eslint", "npm-audit", "aiqh-security-scan", "pytest", "node-test" as ParserTool];
  const linesOf = (s: string): number => {
    let n = 1;
    for (let i = s.indexOf("\n"); i !== -1; i = s.indexOf("\n", i + 1)) n += 1;
    return n;
  };
  // The time limit is a backstop that linear code never reaches. This clock moves only when the parser looks at it (once per
  // CLOCK_EVERY lines it reads), so here the limit stands for WORK_PER_LINE lines read per input line, whatever the load of the machine:
  // the parsers read at most about 1.3 per input line, a quadratic path far more. (With the real clock, a parallel full run once took
  // over 1,000 ms for a linear 1 MiB read.)
  const WORK_PER_LINE = 8;
  const workClock = (out: Out): (() => number) => {
    const looksAllowed = Math.ceil((WORK_PER_LINE * (linesOf(out.stdout ?? "") + linesOf(out.stderr ?? ""))) / CLOCK_EVERY) + 1;
    let looks = 0;
    return () => (looks++ * PARSE_TIME_LIMIT_MS) / looksAllowed;
  };
  // Item 53 (v0.15.1; batch2 design, final, §4.6, 53-F): the time of a read is the CPU time of this thread, not the wall clock, so a
  // thread that waits for the CPU on a loaded machine is not counted (waiting is left to the limit of the test, T3). Besides the limit of
  // one read, the growth from 256 KiB to 1 MiB is checked on the least of RUNS reads: linear code takes about 4 times, a quadratic path
  // about 16 times, and the work clock does not see the splitting into lines (it starts after it).
  const RUNS = 3;
  // Item 41 (v0.13.2), time budget T3 (docs/ops/ci-and-branch-protection.md): one limit for every shape, the largest of their T3 = 70 s
  // (v0.15.1, item 53: 7 reads per tool instead of 3; only newlines took 2.78 s to 5.50 s in 4 quiet full runs, 12 × 5.50 s = 66.0 s,
  // up to a multiple of 10 s; was 40 s from 12 × 3.14 s. Every other shape was under 0.6 s quietly)
  it.each(Object.keys(shapes))("%s", (shape) => {
    const make = shapes[shape];
    if (make === undefined) throw new Error(shape);
    const small = make(256 * KIB);
    const big = make(1024 * KIB);
    let evaluated = 0;
    for (const tool of tools) {
      const read = (out: Out, size: number): number => {
        const answer: { r: ReturnType<typeof parse> | null } = { r: null };
        const ms = cpuMs(() => {
          answer.r = parse(tool, out, { now: workClock(out) });
        });
        expect(["parsed", "unparsed"]).toContain(answer.r?.status);
        // reaching the time limit here means more than WORK_PER_LINE lines read per input line: a slow path
        expect(answer.r?.reason, `${tool} ${shape} ${size / KIB} KiB`).not.toBe("time-limit");
        return ms;
      };
      const least = (out: Out, size: number): number => Math.min(...Array.from({ length: RUNS }, () => read(out, size)));
      // Linear code reads 1 MiB in tens of milliseconds of CPU; a quadratic path over 1 MiB would take minutes.
      const t64 = read(make(64 * KIB), 64 * KIB);
      expect(t64, `${tool} ${shape} 64 KiB took ${t64.toFixed(0)} ms of CPU`).toBeLessThan(1500);
      const t256 = least(small, 256 * KIB);
      expect(t256, `${tool} ${shape} 256 KiB took ${t256.toFixed(0)} ms of CPU`).toBeLessThan(1500);
      const t1024 = least(big, 1024 * KIB);
      expect(t1024, `${tool} ${shape} 1 MiB took ${t1024.toFixed(0)} ms of CPU`).toBeLessThan(3000);
      expect(grewLinearly(t256, t1024), `${tool} ${shape}: 256 KiB ${t256.toFixed(1)} ms, 1 MiB ${t1024.toFixed(1)} ms of CPU`).toBe(true);
      evaluated += 1;
    }
    // every tool of the shape was evaluated by the three checks (the limit, the growth and the work clock)
    expect(evaluated).toBe(tools.length);
  }, 70_000);
  it("an input of 4 MiB is cut to PARSE_INPUT_MAX before anything is read", () => {
    const answer: { r: ReturnType<typeof parse> | null } = { r: null };
    const ms = cpuMs(() => {
      answer.r = parse("vitest", { stdout: "x".repeat(4 * PARSE_INPUT_MAX) });
    });
    expect(answer.r).toMatchObject({ status: "unparsed", reason: "no-summary", truncated: true });
    expect(ms).toBeLessThan(3000);
  });
  // T53-1 waits (its time hardly grows under load, so T3 leaves it at the default limit); T53-2 computes for 3.5 s of CPU, and its limit
  // is T3: max(30 s, 12 × 5.54 s, the longest in 4 quiet full runs = 66.5 s, up to a multiple of 10 s) = 70 s
  it("T53-1: a pause of the reading thread is not counted (3.5 s of Atomics.wait inside one read stays under the 3,000 ms limit)", () => {
    const real = PARSERS.vitest;
    const pausing: ToolParser = {
      tool: "vitest",
      parse: (input, budget) => {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3500);
        return real.parse(input, budget);
      },
    };
    const wall0 = performance.now();
    const ms = cpuMs(() => {
      parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt") }, { parsers: { vitest: pausing }, now: () => 0 });
    });
    expect(performance.now() - wall0, "the wall clock saw the pause").toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThan(3000);
  });
  it("T53-2: CPU used inside a read is counted (3.5 s of computation inside one read goes over the 3,000 ms limit)", () => {
    const real = PARSERS.vitest;
    const burning: ToolParser = {
      tool: "vitest",
      parse: (input, budget) => {
        const start = process.threadCpuUsage();
        for (let used = process.threadCpuUsage(start); (used.user + used.system) / 1000 < 3500; used = process.threadCpuUsage(start)) {
          // computing, not waiting
        }
        return real.parse(input, budget);
      },
    };
    const ms = cpuMs(() => {
      parse("vitest", { stdout: fx("vitest-self-unit.stdout.txt") }, { parsers: { vitest: burning }, now: () => 0 });
    });
    // the limit check of P3 (`toBeLessThan(3000)`) fails on this read
    expect(ms).toBeGreaterThanOrEqual(3000);
  }, 70_000);
  it("T53-3: the growth check passes linear growth and very short reads, and fails quadratic growth", () => {
    expect(grewLinearly(10, 40)).toBe(true);
    expect(grewLinearly(15.6, 66.9)).toBe(true);
    expect(grewLinearly(0.01, 0.05)).toBe(true);
    expect(grewLinearly(2, 13)).toBe(true);
    expect(grewLinearly(10, 160)).toBe(false);
    expect(grewLinearly(56, 913)).toBe(false);
    expect(grewLinearly(2.6, 41.6)).toBe(false);
  });
});

/** The CPU time of this thread while `fn` runs, in milliseconds (a wait for the CPU or a pause is not counted). Node 23.9 and later. */
function cpuMs(fn: () => void): number {
  const start = process.threadCpuUsage();
  fn();
  const used = process.threadCpuUsage(start);
  return (used.user + used.system) / 1000;
}

/**
 * Item 53 (batch2 design, final, §4.6): four times the input takes at most 8 times the CPU time plus 20 ms. Linear growth is about 4
 * times, a quadratic one about 16 times; the 20 ms keep very short reads (their jitter) out of the comparison. Measured on the least of
 * three reads: quiet and under load the 85 pairs of shape and tool stayed at or under 6.44 times.
 */
function grewLinearly(small: number, big: number): boolean {
  return big <= 8 * small + 20;
}

// v0.18.0 (ADR-0028 decision 14, B3-D-R1-001; batch3 design, final, §3.11): the parser input carries stdoutTruncated, true when the
// runner kept only the end of stdout or the window of PARSE_INPUT_MAX cut its start. Only the node:test parser reads it; the other five
// read the same output the same way with and without it (written to run on the commit before the change too).
describe("v0.18.0: stdoutTruncated in the parser input (B3-D-R1-001)", () => {
  const FILES: Record<string, string> = {
    vitest: "vitest-agent.stdout.txt",
    eslint: "eslint-sample.stdout.txt",
    "npm-audit": "npm-audit-two.stdout.txt",
    "aiqh-security-scan": "security-self.stdout.txt",
    pytest: "pytest-q-failures.stdout.txt",
  };
  it.each(Object.keys(FILES))("%s: the same output with and without the runner's cut is read the same (only truncated differs)", (name) => {
    const tool = name as ParserTool;
    const stdout = fx(FILES[name] ?? "");
    const whole = parse(tool, { stdout, exitCode: 1 });
    const cut = parse(tool, { stdout, exitCode: 1, stdoutTruncated: true });
    expect(whole.status).toBe("parsed");
    expect(whole.truncated).toBe(false);
    expect(cut).toEqual({ ...whole, truncated: true });
  });
  it("parseOutputAs passes true when the runner cut stdout or the window cut it, false otherwise (a cut stderr does not count)", () => {
    const seen: unknown[] = [];
    const recorder: ToolParser = {
      tool: "vitest",
      parse: (input, budget) => {
        seen.push((input as { stdoutTruncated?: unknown }).stdoutTruncated);
        return PARSERS.vitest.parse(input, budget);
      },
    };
    const deps: ReadDeps = { parsers: { vitest: recorder } };
    parse("vitest", { stdout: "a\n" }, deps);
    parse("vitest", { stdout: "a\n", stdoutTruncated: true }, deps);
    parse("vitest", { stdout: "x".repeat(PARSE_INPUT_MAX + 1) }, deps);
    parse("vitest", { stdout: "a\n", stderr: "x".repeat(PARSE_INPUT_MAX + 1), stderrTruncated: true }, deps);
    parse("vitest", { stdout: "x".repeat(PARSE_INPUT_MAX) }, deps);
    expect(seen).toEqual([false, true, true, false, false]);
  });
  it("a parser's answer output-truncated stays the reason (not parser-error); truncated is recorded", () => {
    const truncatedAnswer = { status: "unparsed", reason: "output-truncated" } as unknown as ReturnType<ToolParser["parse"]>;
    const deps: ReadDeps = { parsers: { vitest: { tool: "vitest", parse: () => truncatedAnswer } } };
    expect(parse("vitest", { stdout: "a\n", stdoutTruncated: true }, deps)).toEqual({ tool: "vitest", status: "unparsed", reason: "output-truncated", truncated: true, counts: {}, items: [], itemsOmitted: 0 });
  });
});
