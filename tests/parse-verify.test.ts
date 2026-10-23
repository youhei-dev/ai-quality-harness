/**
 * v0.8.0 (ADR-0028): what the parsers add to a verify run. P1: the verdict, the exit code, the summary, the categories and every
 * check's status are the same whether a parser reads the output or not (the same output under a name no parser takes). P2: a parser
 * that throws does not stop verify. P4: names in the terminal, latest.json and latest.md are masked and their raw characters are
 * notation. P9: the report keeps its top-level keys and schemaVersion 1, `parsed` is the last key of a check, a report without a
 * parsed check renders the same Markdown as before, and review-packet still renders the Verification section of such a report.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { runVerify } from "../src/commands/verify.ts";
import { VITEST_PARSER } from "../src/parse/vitest.ts";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { writeReports } from "../src/report/write.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult, ParsedOutput, VerificationReport } from "../src/types.ts";
import { checkResult, fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) cleanups.pop()?.();
});

const FIXTURES = path.join(import.meta.dirname, "fixtures", "parse");
const fx = (name: string): string => readFileSync(path.join(FIXTURES, name), "utf8");
const SECRET = fake("AKIA", "ABCDEFGHIJKLMNOP");
const RLO = String.fromCodePoint(0x202e);
const LS = String.fromCodePoint(0x2028);
/** A tool that prints the files next to it and exits with argv[2]; copied under several names (the name decides the parser). */
const PRINTER = [
  'import { readFileSync } from "node:fs";',
  'process.stdout.write(readFileSync(new URL("./out.txt", import.meta.url), "utf8"));',
  'process.stderr.write(readFileSync(new URL("./err.txt", import.meta.url), "utf8"));',
  "process.exitCode = Number(process.argv[2] ?? 0);",
  "",
].join("\n");

const VITEST_ERR = `${fx("vitest-agent.stderr.txt")}\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  tests/leak.test.ts > uses ${SECRET} in its name\n FAIL  tests/raw.test.ts > a${RLO}b and c${LS}d\n`;

function project(names: { unit: string; lint: string }): string {
  const t = makeTempDir("aiqh-parse-verify-");
  cleanups.push(t.cleanup);
  for (const [dir, out, err] of [
    ["unit", fx("vitest-agent.stdout.txt"), VITEST_ERR],
    ["lint", fx("eslint-sample.stdout.txt"), ""],
  ] as const) {
    mkdirSync(path.join(t.dir, dir), { recursive: true });
    writeFileSync(path.join(t.dir, dir, "out.txt"), out);
    writeFileSync(path.join(t.dir, dir, "err.txt"), err);
    writeFileSync(path.join(t.dir, dir, dir === "unit" ? names.unit : names.lint), PRINTER);
  }
  const checks = [
    { name: "unit", kind: "unit", command: `node unit/${names.unit} 1` },
    { name: "lint", kind: "lint", command: `node lint/${names.lint} 1`, required: false },
    { name: "after", kind: "custom", command: "node -e 0" },
  ];
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks }));
  return t.dir;
}

async function verify(dir: string, failFast = false): Promise<{ code: number; lines: string[]; report: VerificationReport; json: string; md: string }> {
  const lines: string[] = [];
  const code = await runVerify({ cwd: dir, toolVersion: "0.0.0-test", failFast, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  const json = readFileSync(path.join(dir, "artifacts", "verification", "latest.json"), "utf8");
  const md = readFileSync(path.join(dir, "artifacts", "verification", "latest.md"), "utf8");
  return { code, lines, report: JSON.parse(json) as VerificationReport, json, md };
}

const CHECK_KEYS = ["name", "kind", "command", "cwd", "required", "timeoutSec", "description", "status", "exitCode", "signal", "timedOut", "startedAt", "durationMs", "errorSummary", "stdoutTail", "stderrTail", "outputTruncated"];
const REPORT_KEYS = ["schemaVersion", "tool", "project", "configPath", "configSha256", "startedAt", "finishedAt", "durationMs", "git", "verdict", "exitCode", "interruptedBy", "summary", "categories", "checks"];

describe("P1: the parsers change nothing that decides the result", () => {
  it("the same output read by a parser and not read: same exit code, verdict, summary, categories and check results", async () => {
    const read = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }));
    const unread = await verify(project({ unit: "printer.mjs", lint: "printer.js" }));
    expect(read.code).toBe(1);
    expect(unread.code).toBe(read.code);
    for (const key of ["verdict", "exitCode", "summary", "categories", "interruptedBy", "schemaVersion"] as const) expect(read.report[key]).toEqual(unread.report[key]);
    const facts = (r: VerificationReport) => r.checks.map((c) => [c.name, c.status, c.exitCode, c.errorSummary, c.timedOut, c.stdoutTail, c.stderrTail, c.outputTruncated]);
    expect(facts(read.report)).toEqual(facts(unread.report));
    expect(read.report.checks.map((c) => [c.parsed?.tool, c.parsed?.status])).toEqual([["vitest", "parsed"], ["eslint", "parsed"], [null, "not-applicable"]]);
    expect(unread.report.checks.map((c) => [c.parsed?.tool, c.parsed?.status, c.parsed?.reason])).toEqual([[null, "not-applicable", "no-parser"], [null, "not-applicable", "no-parser"], [null, "not-applicable", "no-parser"]]);
    expect(read.report.checks[1]?.parsed?.counts).toEqual({ problems: 6, errors: 3, warnings: 3 });
  });
  it("the last terminal line is the same; the parsed lines come after a check's status line and before its tails", async () => {
    const read = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }));
    const unread = await verify(project({ unit: "printer.mjs", lint: "printer.js" }));
    const last = (lines: string[]) => lines.filter((l) => l.startsWith("VERIFY "));
    expect(last(read.lines).map((l) => l.replace(/duration: .*$/, ""))).toEqual(last(unread.lines).map((l) => l.replace(/duration: .*$/, "")));
    const status = read.lines.findIndex((l) => /^ {6}FAIL {2}/.test(l));
    expect(read.lines[status + 1]).toBe("      parsed: vitest — test files 2 failed | 1 passed (3); tests 2 failed | 2 passed | 1 skipped | 1 todo (6)");
    expect(read.lines[status + 2]).toBe("        failed-suite: tests/broken.test.ts [ tests/broken.test.ts ]");
    expect(read.lines.indexOf("      --- stderr (last 20 lines; use --verbose for more) ---")).toBeGreaterThan(status + 2);
    expect(unread.lines.some((l) => l.includes("parsed:"))).toBe(false);
  });
  it("a check that never started (--fail-fast) is not-applicable (not-run)", async () => {
    const r = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }), true);
    expect(r.report.checks.map((c) => [c.status, c.parsed?.status, c.parsed?.reason])).toEqual([["FAIL", "parsed", null], ["SKIPPED", "not-applicable", "not-run"], ["SKIPPED", "not-applicable", "not-run"]]);
  });
});

describe("P2: a parser that throws does not stop verify", () => {
  it("unparsed (parser-error) for that check; the exit code, the verdict and the other checks as without it", async () => {
    vi.spyOn(VITEST_PARSER, "parse").mockImplementation(() => {
      throw new Error(`parser bug ${SECRET}`);
    });
    const r = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }));
    const unread = await verify(project({ unit: "printer.mjs", lint: "printer.js" }));
    expect(r.code).toBe(unread.code);
    expect(r.report.verdict).toBe(unread.report.verdict);
    expect(r.report.checks[0]?.parsed).toEqual({ tool: "vitest", status: "unparsed", reason: "parser-error", truncated: false, counts: {}, items: [], itemsOmitted: 0 });
    expect(r.report.checks[1]?.parsed?.status).toBe("parsed");
    expect(r.lines).toContain("      parsed: vitest — not read (parser-error)");
    expect(`${r.lines.join("\n")}${r.json}${r.md}`).not.toContain(SECRET);
  });
});

describe("P4: names reach the terminal and the files masked, raw characters as notation", () => {
  it("a secret in a test name is redacted everywhere; U+202E and U+2028 never reach a file or the terminal raw", async () => {
    const r = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }));
    const names = r.report.checks[0]?.parsed?.items.map((i) => i.name) ?? [];
    expect(names.some((n) => n.includes("[REDACTED:"))).toBe(true);
    for (const text of [r.lines.join("\n"), r.json, r.md]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(RLO);
      expect(text).not.toContain(LS);
    }
    expect(r.lines).toContain("        failed-test: tests/raw.test.ts > a\\u{202E}b and c\\u{2028}d");
    expect(r.md).toContain("tests/raw.test.ts > a\\u{202E}b and c\\u{2028}d");
    expect(r.json).toContain("a\\u202eb and c\\u2028d");
  });
});

describe("P9: the report's shape for the readers that exist", () => {
  it("top-level keys (configSha256 added in v0.10.0) and schemaVersion unchanged; parsed is the last key of every check", async () => {
    const r = await verify(project({ unit: "vitest.mjs", lint: "eslint.js" }));
    expect(Object.keys(r.report)).toEqual(REPORT_KEYS);
    expect(r.report.schemaVersion).toBe(1);
    for (const c of r.report.checks) expect(Object.keys(c)).toEqual([...CHECK_KEYS, "parsed"]);
  });
  it("Markdown: no Parsed Output section unless a check was read; with one, a table and the names", () => {
    const base = (checks: CheckResult[]): VerificationReport =>
      buildReport({ config: { projectRoot: "/p", configPath: "/p/aiqh.config.jsonc", project: { name: "p" }, outputDir: "/p/a", security: DEFAULT_SECURITY, checks: [] }, results: checks, git: null, startedAt: new Date(0), finishedAt: new Date(1000), toolVersion: "t" });
    const plain = checkResult({ name: "unit", kind: "unit" });
    const none: ParsedOutput = { tool: null, status: "not-applicable", reason: "no-parser", truncated: false, counts: {}, items: [], itemsOmitted: 0 };
    expect(renderMarkdown(base([{ ...plain, parsed: none }]))).toBe(renderMarkdown(base([plain])));
    const md = renderMarkdown(base([{ ...plain, parsed: { tool: "vitest", status: "parsed", reason: null, truncated: true, counts: { testFiles: 1, testFilesFailed: 1, testFilesPassed: 0, testFilesSkipped: 0, testFilesTodo: 0, testFilesExpectedFail: 0, tests: 2, testsFailed: 1, testsPassed: 1, testsSkipped: 0, testsTodo: 0, testsExpectedFail: 0, errors: 0 }, items: [{ kind: "failed-test", name: "a | b" }], itemsOmitted: 3 } }, { ...plain, name: "lint", parsed: none }]));
    expect(md).toContain("## Parsed Output");
    expect(md).toContain("| 1 | unit | vitest | parsed (truncated) | test files 1 failed (1); tests 1 failed \\| 1 passed (2) |");
    expect(md).toContain("| 2 | lint | - | not-applicable (no-parser) | - |");
    expect(md).toContain("- failed-test: a | b");
    expect(md).toContain("- … 3 more (not listed)");
  });
  it("review-packet renders the Verification section of a report with parsed checks", async () => {
    const t = makeTempDir("aiqh-parse-p9-");
    cleanups.push(t.cleanup);
    const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: t.dir, encoding: "utf8" });
    git("init", "-q");
    writeFileSync(path.join(t.dir, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD").trim();
    writeFileSync(path.join(t.dir, "a.txt"), "b\n");
    git("commit", "-q", "-am", "change");
    const head = git("rev-parse", "HEAD").trim();
    const results: CheckResult[] = [
      { ...checkResult({ name: "unit", kind: "unit", durationMs: 12 }), parsed: { tool: "vitest", status: "parsed", reason: null, truncated: false, counts: { tests: 2 }, items: [{ kind: "failed-test", name: `x ${SECRET} y${RLO}` }], itemsOmitted: 0 } },
    ];
    const report = buildReport({ config: { projectRoot: t.dir, configPath: path.join(t.dir, "aiqh.config.jsonc"), project: { name: "p" }, outputDir: "", security: DEFAULT_SECURITY, checks: [] }, results, git: { commit: head, branch: "main", dirty: false }, startedAt: new Date(0), finishedAt: new Date(1000), toolVersion: "9.9.9" });
    writeReports(report, path.join(t.dir, "artifacts", "verification"));
    const out: string[] = [];
    const err: string[] = [];
    const code = await runReviewPacket({ cwd: t.dir, range: `${base}..HEAD`, label: "p9", toolVersion: "0.0.0-test", today: "2026-10-14", log: (l) => out.push(l), logError: (l) => err.push(l) });
    expect(code, err.join("\n")).toBe(0);
    const md = readFileSync(path.join(t.dir, "artifacts", "ai-review", "review-packet-p9.md"), "utf8");
    expect(md).toContain("- Verdict: `PASSED`; exit code `0`; tool `ai-quality-harness 9.9.9`");
    expect(md).toContain("| `unit` | `unit` | `true` | `PASS` | `0` | `12` |");
  });
});

describe("item 39 (v0.14.0): pytest through verify, for display only", () => {
  /** An executable named `pytest` that prints out.txt next to it and exits with argv[2] (CommonJS: its directory says so). */
  const PYTEST_PRINTER = ["#!/usr/bin/env node", 'const { readFileSync } = require("node:fs");', 'process.stdout.write(readFileSync(require("node:path").join(__dirname, "out.txt"), "utf8"));', "process.exitCode = Number(process.argv[2] ?? 0);", ""].join("\n");
  function pytestProject(command: string, out: string): string {
    const t = makeTempDir("aiqh-parse-pytest-");
    cleanups.push(t.cleanup);
    mkdirSync(path.join(t.dir, "unit"));
    writeFileSync(path.join(t.dir, "unit", "package.json"), '{ "type": "commonjs" }\n');
    writeFileSync(path.join(t.dir, "unit", "out.txt"), out);
    for (const name of ["pytest", "printer"]) {
      writeFileSync(path.join(t.dir, "unit", name), PYTEST_PRINTER);
      chmodSync(path.join(t.dir, "unit", name), 0o755);
    }
    writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "unit", kind: "unit", command }] }));
    return t.dir;
  }
  it("a PASS check run by pytest: parsed in latest.json, a parsed: line after its PASS line, a Parsed Output row; P1 holds", async () => {
    const read = await verify(pytestProject("unit/pytest 0", fx("pytest-q-passed.stdout.txt")));
    const unread = await verify(pytestProject("unit/printer 0", fx("pytest-q-passed.stdout.txt")));
    expect(read.code).toBe(0);
    expect(unread.code).toBe(read.code);
    for (const key of ["verdict", "exitCode", "summary", "categories"] as const) expect(read.report[key]).toEqual(unread.report[key]);
    expect(read.report.checks[0]?.status).toBe("PASS");
    expect(read.report.checks[0]?.parsed).toEqual({ tool: "pytest", status: "parsed", reason: null, truncated: false, counts: { passed: 100, failed: 0, skipped: 0, deselected: 0, xfailed: 0, xpassed: 0, errors: 0, warnings: 0 }, items: [], itemsOmitted: 0 });
    expect(unread.report.checks[0]?.parsed?.reason).toBe("no-parser");
    const status = read.lines.findIndex((l) => /^ {6}PASS {2}/.test(l));
    expect(read.lines[status + 1]).toBe("      parsed: pytest — 100 passed");
    expect(read.md).toContain("## Parsed Output");
    expect(read.md).toContain("| 1 | unit | pytest | parsed | 100 passed |");
    expect(unread.lines.some((l) => l.includes("parsed:"))).toBe(false);
  });
  it("a FAIL check: the counts and the FAILED / ERROR names; the exit code and the verdict as without the parser", async () => {
    const read = await verify(pytestProject("unit/pytest 1", fx("pytest-q-failures.stdout.txt")));
    const unread = await verify(pytestProject("unit/printer 1", fx("pytest-q-failures.stdout.txt")));
    expect(read.code).toBe(1);
    expect(unread.code).toBe(1);
    expect(read.report.verdict).toBe(unread.report.verdict);
    expect(read.report.checks[0]?.parsed?.counts).toEqual({ passed: 7, failed: 2, skipped: 1, deselected: 0, xfailed: 0, xpassed: 0, errors: 1, warnings: 1 });
    const status = read.lines.findIndex((l) => /^ {6}FAIL {2}/.test(l));
    expect(read.lines.slice(status + 1, status + 5)).toEqual([
      "      parsed: pytest — 7 passed, 2 failed, 1 skipped, 1 error, 1 warning",
      "        failed-test: tests/test_alpha.py::test_alpha_sum",
      "        failed-test: tests/test_beta.py::test_beta_name[case-1]",
      "        error: tests/test_widget.py::test_widget_assembles",
    ]);
  });
  it("Y14: a command that only names pytest (echo … pytest) is not read: not-applicable, no parsed: line, the check passes", async () => {
    const r = await verify(pytestProject('echo "1 passed in 0.10s" pytest', ""));
    expect(r.code).toBe(0);
    expect(r.report.checks[0]?.status).toBe("PASS");
    expect(r.report.checks[0]?.parsed).toEqual({ tool: null, status: "not-applicable", reason: "no-parser", truncated: false, counts: {}, items: [], itemsOmitted: 0 });
    expect(r.lines.some((l) => l.includes("parsed:"))).toBe(false);
  });
});
