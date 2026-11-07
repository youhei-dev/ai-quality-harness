/**
 * The fixed inputs of the report golden fixture (C-02, ADR-0003 addendum v0.18.1; batch4 design §2.4). Two sets:
 * - plain: no backtick in any command, working directory or name, and no value that starts and ends with a space. It still has the
 *   Checks table, the failure details' "- Command:" and "cwd:" lines, a "|" in a command, a working directory other than ".", the four
 *   parsers' parsed outputs, a timed-out, a SKIPPED and an optional check, a secret shape and raw characters in a check's output.
 * - edge: the eight forms E1–E8 of design §2.4.3 (backticks in commands and a working directory, values with a space at both ends).
 * Every value is fixed (times, run id, commit, config hash, paths, tool version). Raw characters and the secret shape are built at run
 * time: this file holds none of them. tests/report-golden.test.ts checks these inputs with fixed numbers, apart from the expected files.
 */
import type { BuildReportInput } from "../src/report/build-report.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult, ParsedOutput } from "../src/types.ts";
import { checkResult, fake } from "./helpers.ts";

const ESC = String.fromCharCode(0x1b);
const RLO = String.fromCharCode(0x202e);
const FENCE3 = "`".repeat(3);

/** A check's error output with raw characters (ESC of a color, U+202E): the written latest.md holds them as notation. */
const RAW_STDERR = `boom ${ESC}[31mred${ESC}[0m and ${RLO}x`;

function parsed(tool: ParsedOutput["tool"], counts: Record<string, number>, items: ParsedOutput["items"] = []): ParsedOutput {
  return { tool, status: "parsed", reason: null, truncated: false, counts, items, itemsOmitted: 0 };
}

const NO_PARSER: ParsedOutput = { tool: null, status: "not-applicable", reason: "no-parser", truncated: false, counts: {}, items: [], itemsOmitted: 0 };
const NOT_RUN: ParsedOutput = { tool: null, status: "not-applicable", reason: "not-run", truncated: false, counts: {}, items: [], itemsOmitted: 0 };

function check(o: Partial<CheckResult>): CheckResult {
  return checkResult({ timeoutSec: 600, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1_200, parsed: NO_PARSER, ...o });
}

function fail(o: Partial<CheckResult>): CheckResult {
  return check({ status: "FAIL", exitCode: 1, errorSummary: "exit code 1", stderrTail: RAW_STDERR, ...o });
}

function input(results: CheckResult[]): BuildReportInput {
  return {
    config: {
      projectRoot: "/proj",
      configPath: "/proj/aiqh.config.jsonc",
      configSha256: "7f3c2a9e5b1d4f8a6c0e2b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a",
      project: { name: "demo" },
      outputDir: "/proj/artifacts/verification",
      security: DEFAULT_SECURITY,
      checks: [],
    },
    results,
    git: { commit: "0123456789abcdef0123456789abcdef01234567", branch: "main", dirty: false },
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: new Date("2026-01-01T00:01:10.000Z"),
    toolVersion: "0.0.0-golden",
    runId: "54545454-5454-4545-8545-545454545454",
  };
}

/** The plain set (8 checks). */
export function plainInput(): BuildReportInput {
  return input([
    check({ name: "lint", kind: "lint", command: "npm run lint", parsed: parsed("eslint", { problems: 0, errors: 0, warnings: 0 }) }),
    check({ name: "typecheck", kind: "typecheck", command: "npm run typecheck" }),
    fail({
      name: "unit",
      kind: "unit",
      command: "npm test | tee log",
      cwd: "pkg",
      errorSummary: "exit code 1: 2 tests failed",
      stderrTail: `${RAW_STDERR}\n${FENCE3}\nnot a fence of the report`,
      stdoutTail: `RUN tests\nkey ${fake("AKIA", "ABCDEFGHIJKLMNOP")}\n2 failed`,
      outputTruncated: true,
      parsed: parsed("vitest", { testFiles: 3, testFilesFailed: 1, testFilesPassed: 2, tests: 10, testsFailed: 2, testsPassed: 8 }, [
        { kind: "failed", name: "tests/a.test.ts > adds" },
        { kind: "failed", name: "tests/b.test.ts > subtracts" },
      ]),
    }),
    check({ name: "unit-node", kind: "unit", command: "node --test", parsed: parsed("node-test", { tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0, suites: 1 }) }),
    check({ name: "unit-py", kind: "unit", command: "python -m pytest -q tests/", parsed: parsed("pytest", { passed: 4, warnings: 1 }) }),
    check({ name: "build", kind: "build", command: "npm run build", status: "FAIL", exitCode: null, signal: "SIGTERM", timedOut: true, timeoutSec: 5, durationMs: 5_000, errorSummary: "timed out after 5s" }),
    check({ name: "security", kind: "security", command: "aiqh security-scan", status: "SKIPPED", exitCode: null, startedAt: null, durationMs: 0, errorSummary: "skipped: a required check failed before it", parsed: NOT_RUN }),
    check({ name: "docs", kind: "custom", command: "npm run docs:check", required: false }),
  ]);
}

/** The edge set: E1–E8 of design §2.4.3, in this order. */
export function edgeInput(): BuildReportInput {
  return input([
    check({ name: "e1", command: "echo `date`" }),
    check({ name: "e2", command: "echo ``x``" }),
    fail({ name: "e3", command: "`npm` test" }),
    fail({ name: "e4", command: "npm test | grep `x`" }),
    fail({ name: "e5", command: "npm test", cwd: "dir`x" }),
    check({ name: "e6", command: " npm test " }),
    fail({ name: "e7", command: " npm run lint " }),
    check({ name: "e8", command: "npm test", parsed: parsed("vitest", { testFiles: 1, testFilesPassed: 1, tests: 2, testsPassed: 2 }) }),
  ]);
}

/** Whether C-44 (v0.18.2) changes the written form of a value: it has a backtick, or starts and ends with a space and is not only spaces. */
export function changedByC44(value: string): boolean {
  return value.includes("`") || (value.startsWith(" ") && value.endsWith(" ") && !/^ +$/.test(value));
}
