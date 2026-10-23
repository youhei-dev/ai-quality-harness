/**
 * Item 39 (v0.14.0, batch1 design final §3.5 and §3.7): the pytest parser. It reads the last summary-shaped line of stdout
 * (`<n> <word>, … in <s>s`, with or without the `=` rows around it, `(h:mm:ss)`, the old ` seconds`, `no tests ran`) and the FAILED /
 * ERROR lines after the `short test summary info` heading. Only pytest's 8 words; an unknown word, a word twice or a 16-digit count is
 * unexpected-summary. It is chosen only when one simple command runs pytest at its command position (pytest / py.test, python -m
 * pytest, or a known wrapper's run), with no other simple command before or after it but a leading `cd <one word>` (B1-Q7 B-1,
 * B1-D-R1-002). Display only: the verdict never looks at it (ADR-0028). Written to run on the base commit too (no new imports).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summaryText } from "../src/parse/describe.ts";
import { parseOutputAs, type OutputFacts } from "../src/parse/read.ts";
import { selectParser, type ScriptsRead } from "../src/parse/select.ts";
import { PARSE_INPUT_MAX, PARSED_ITEMS_MAX } from "../src/parse/text.ts";
import type { ParsedOutput, ParserTool } from "../src/types.ts";
import { fake } from "./helpers.ts";

const PYTEST = "pytest" as ParserTool;
const FIXTURES = path.join(import.meta.dirname, "fixtures", "parse");
const fx = (name: string): string => readFileSync(path.join(FIXTURES, name), "utf8");
const parse = (stdout: string, stderr = "", exitCode = 1): ParsedOutput => {
  const exec: OutputFacts = { stdout, stderr, exitCode, stdoutTruncated: false, stderrTruncated: false };
  return parseOutputAs(PYTEST, exec);
};
const zero = { passed: 0, failed: 0, skipped: 0, deselected: 0, xfailed: 0, xpassed: 0, errors: 0, warnings: 0 };

describe("item 39: the pytest summary (Y1-Y10)", () => {
  it("Y1: -q, all passed", () => {
    expect(parse(fx("pytest-q-passed.stdout.txt"), "", 0)).toEqual({ tool: "pytest", status: "parsed", reason: null, truncated: false, counts: { ...zero, passed: 100 }, items: [], itemsOmitted: 0 });
  });
  it("Y1b: -q, passed and skipped after progress lines (the shape seen in the real run of design §3.4)", () => {
    expect(parse(fx("pytest-q-skipped.stdout.txt"), "", 0)).toMatchObject({ status: "parsed", counts: { ...zero, passed: 443, skipped: 1 }, items: [] });
  });
  it("Y2: -q with failures, an error and a warning: counts and the names after short test summary info", () => {
    const p = parse(fx("pytest-q-failures.stdout.txt"));
    expect(p).toMatchObject({ status: "parsed", counts: { ...zero, passed: 7, failed: 2, skipped: 1, errors: 1, warnings: 1 }, itemsOmitted: 0 });
    expect(p.items).toEqual([
      { kind: "failed-test", name: "tests/test_alpha.py::test_alpha_sum" },
      { kind: "failed-test", name: "tests/test_beta.py::test_beta_name[case-1]" },
      { kind: "error", name: "tests/test_widget.py::test_widget_assembles" },
    ]);
    expect(Object.keys(p.counts)).toEqual(["passed", "failed", "skipped", "deselected", "xfailed", "xpassed", "errors", "warnings"]);
  });
  it("Y3: the default form (= rows around the summary) gives the same counts and names as Y2", () => {
    const q = parse(fx("pytest-q-failures.stdout.txt"));
    const d = parse(fx("pytest-default-failures.stdout.txt"));
    expect(d.status).toBe("parsed");
    expect(d.counts).toEqual(q.counts);
    expect(d.items).toEqual(q.items);
  });
  it.each([
    ["Y4 (h:mm:ss)", "3 passed in 75.20s (0:01:15)", { passed: 3 }],
    ["Y4 with = rows", "===== 1 failed, 2 passed in 3725.01s (1:02:05) =====", { failed: 1, passed: 2 }],
    ["old seconds", "3 passed in 0.12 seconds", { passed: 3 }],
    ["old seconds with = rows", "=== 1 failed in 1 seconds ===", { failed: 1 }],
    ["Y5 no tests ran", "no tests ran in 0.01s", {}],
    ["Y5 with = rows", "============================ no tests ran in 0.01s =============================", {}],
    ["every word, singular and plural", "1 failed, 2 passed, 3 skipped, 4 deselected, 5 xfailed, 6 xpassed, 7 warnings, 8 errors in 1.00s", { failed: 1, passed: 2, skipped: 3, deselected: 4, xfailed: 5, xpassed: 6, warnings: 7, errors: 8 }],
    ["warning and error", "1 warning, 1 error in 0.10s", { warnings: 1, errors: 1 }],
    ["only deselected", "2 deselected in 0.05s", { deselected: 2 }],
    ["an integer time", "1 passed in 2s", { passed: 1 }],
  ])("%s", (_name, line, counts) => {
    expect(parse(`collected 3 items\n\n${line}\n`)).toMatchObject({ status: "parsed", counts: { ...zero, ...counts }, items: [] });
  });
  it.each([
    ["Y6 an unknown word", "1 failed, 2 rerun in 0.10s"],
    ["Y6 a word twice", "1 passed, 2 passed in 0.10s"],
    ["Y6 warning and warnings", "1 warning, 2 warnings in 0.10s"],
    ["Y6 a 16-digit count", "1234567890123456 passed in 0.10s"],
    ["a capitalised word", "1 Passed in 0.10s"],
  ])("%s: unexpected-summary", (_name, line) => {
    expect(parse(`${line}\n`)).toMatchObject({ tool: "pytest", status: "unparsed", reason: "unexpected-summary", counts: {}, items: [] });
  });
  it.each([
    ["Y7 stopped before collecting", "ERROR: file or directory not found: tests/missing\n"],
    ["Y7 nothing", ""],
    ["a time without its unit", "3 passed in 0.10\n"],
    ["two spaces", "3  passed in 0.10s\n"],
    ["no time", "3 passed\n"],
    ["= rows on one side only", "===== 3 passed in 0.10s\n"],
    ["a broken (h:mm:ss)", "3 passed in 75.20s (1:15)\n"],
    ["the summary on stderr only", ""],
  ])("%s: no-summary", (name, stdout) => {
    const stderr = name.includes("stderr") ? "3 passed in 0.10s\n" : "";
    expect(parse(stdout, stderr)).toMatchObject({ tool: "pytest", status: "unparsed", reason: "no-summary" });
  });
  it("Y8: summary-shaped lines printed earlier (by a test) do not count; the last one does", () => {
    const stdout = "9 passed in 0.01s\n.s.                                                                      [100%]\n2 passed, 1 skipped in 0.30s\n";
    expect(parse(stdout)).toMatchObject({ status: "parsed", counts: { ...zero, passed: 2, skipped: 1 } });
  });
  it("Y9: a FAILED name with a secret-shaped part is masked (the whole line before the cut)", () => {
    const hidden = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const p = parse(`=== short test summary info ===\nFAILED tests/test_k.py::test_key[${hidden}] - assert False\n1 failed in 0.10s\n`);
    expect(p.status).toBe("parsed");
    expect(JSON.stringify(p)).not.toContain(hidden);
    expect(p.items).toHaveLength(1);
    expect(p.items[0]?.name).toContain("tests/test_k.py::test_key[");
  });
  it("Y10: CRLF and color sequences are read", () => {
    const esc = String.fromCharCode(27);
    const stdout = `${esc}[31m=== short test summary info ===${esc}[0m\r\nFAILED t.py::a - x\r\n${esc}[31m${esc}[1m1 failed${esc}[0m, ${esc}[32m2 passed${esc}[0m in 0.10s\r\n`;
    expect(parse(stdout)).toMatchObject({ status: "parsed", counts: { ...zero, failed: 1, passed: 2 }, items: [{ kind: "failed-test", name: "t.py::a" }] });
  });
});

describe("item 39: the names (FAILED / ERROR after short test summary info)", () => {
  it("a name without ' - ' is the rest of the line; FAILED lines before the heading are not names", () => {
    const stdout = "FAILED early.py::not_a_name\n=========================== short test summary info ============================\nFAILED t.py::only\nERROR t.py::setup - E\n1 failed, 1 error in 0.10s\n";
    expect(parse(stdout).items).toEqual([{ kind: "failed-test", name: "t.py::only" }, { kind: "error", name: "t.py::setup" }]);
  });
  it("the heading of the last section before the summary counts; lines after the summary are not names", () => {
    const stdout = "=== short test summary info ===\nFAILED old.py::a\n1 failed in 0.10s\n=== short test summary info ===\nFAILED new.py::b\n1 failed in 0.20s\nFAILED after.py::c\n";
    const p = parse(stdout);
    expect(p.items).toEqual([{ kind: "failed-test", name: "new.py::b" }]);
  });
  it("more names than PARSED_ITEMS_MAX: the rest are counted in itemsOmitted", () => {
    const lines = Array.from({ length: PARSED_ITEMS_MAX + 7 }, (_, i) => `FAILED t.py::case_${i} - x`);
    const p = parse(`=== short test summary info ===\n${lines.join("\n")}\n${PARSED_ITEMS_MAX + 7} failed in 1.00s\n`);
    expect(p.items).toHaveLength(PARSED_ITEMS_MAX);
    expect(p.itemsOmitted).toBe(7);
    expect(p.counts.failed).toBe(PARSED_ITEMS_MAX + 7);
  });
  it("the heading fell out of the last PARSE_INPUT_MAX: no names, the counts are read (truncated)", () => {
    const filler = "x".repeat(99) + "\n";
    const stdout = `=== short test summary info ===\n${filler.repeat(Math.ceil(PARSE_INPUT_MAX / filler.length) + 10)}FAILED t.py::a - x\n1 failed in 1.00s\n`;
    expect(parse(stdout)).toMatchObject({ status: "parsed", truncated: true, counts: { ...zero, failed: 1 }, items: [] });
  });
});

describe("item 39: the summary text (terminal and latest.md)", () => {
  it("the counts in pytest's words, zero counts left out", () => {
    expect(summaryText(parse(fx("pytest-q-failures.stdout.txt")))).toBe("7 passed, 2 failed, 1 skipped, 1 error, 1 warning");
    expect(summaryText(parse("3 passed, 2 errors, 4 warnings in 0.1s\n"))).toBe("3 passed, 2 errors, 4 warnings");
    expect(summaryText(parse("no tests ran in 0.01s\n"))).toBe("no tests ran");
  });
});

const dir = "/nonexistent-aiqh-pytest";
const noScripts = (): ScriptsRead => ({ kind: "absent" });
const select = (command: string, readScripts: (d: string) => ScriptsRead = noScripts) => selectParser(command, dir, readScripts);

describe("item 39: which commands choose pytest (B1-Q7 B-1, B1-D-R1-002)", () => {
  it.each([
    ["Y11", "pytest -q"],
    ["Y11", ".venv/bin/pytest"],
    ["Y11", "py.test"],
    ["Y11", "python -m pytest"],
    ["Y11", ".venv/bin/python -m pytest -q tests/"],
    ["Y11", "python3 -B -m pytest"],
    ["Y11", "python3.12 -u -I -m pytest -x"],
    ["Y11", "PYTHONPATH=. pytest -q"],
    ["Y11", "uv run pytest"],
    ["Y11", "uv run --frozen python -m pytest"],
    ["Y11", "uv run --python=3.12 -q pytest"],
    ["Y11", "poetry run pytest"],
    ["Y11", "pipenv run pytest"],
    ["Y11", "pdm run pytest"],
    ["Y11", "hatch run pytest"],
    ["Y11", "rye run --locked --no-sync --offline --quiet pytest"],
    ["Y11", "cd backend && pytest -q"],
    ["Y11", "cd backend; .venv/bin/python -m pytest -q tests/"],
    ["Y11", 'pytest -q -k "not slow" tests/'],
    ["Y11", "pytest -q 2>&1"],
  ])("%s %j -> pytest", (_id, command) => {
    expect(select(command)).toEqual({ kind: "tool", tool: "pytest" });
  });
  it("Y11: npm run <script> whose script runs pytest", () => {
    const scripts = (): ScriptsRead => ({ kind: "read", scripts: { test: ".venv/bin/python -m pytest -q tests/", lint: "ruff check ." } });
    expect(select("npm run test", scripts)).toEqual({ kind: "tool", tool: "pytest" });
    expect(select("npm test", scripts)).toEqual({ kind: "tool", tool: "pytest" });
  });
  it.each([
    ["Y12", 'echo "1 passed in 0.10s" pytest'],
    ["Y12", `printf '%s\\n' "1 passed in 0.10s" pytest`],
    ["Y12", "pip install pytest"],
    ["Y12", '"pytest" -q'],
    ["Y12", "\\pytest -q"],
    ["Y12", 'python -c "import pytest"'],
    ["Y12", "python -mpytest"],
    ["Y12", "python -X dev -m pytest"],
    ["Y12", "python -W error -m pytest"],
    ["Y12", 'python -m "pytest"'],
    ["Y12", "python -m pytest_cov"],
    ["Y12", "uv run --with x pytest"],
    ["Y12", "uv run --isolated pytest"],
    ["Y12", "python -x -m pytest"],
    ["Y12", "python3 -R -m pytest"],
    ["Y12", 'uv "run" pytest'],
    ["Y12", "uv pip install pytest"],
    ["Y12", "coverage run -m pytest"],
    ["Y12", "env pytest"],
    ["Y12", "tox"],
    ["Y12", "nox"],
    ["Y12", "make test"],
    ["Y12", "$(which pytest) -q"],
    ["Y12", "pytest -q 'tests"],
    ["Y13", 'pytest -q && echo "9 passed in 0.10s"'],
    ["Y13", "python gen.py && pytest -q"],
    ["Y13", "pytest -q | tee out.txt"],
    ["Y13", "pytest -q; echo done"],
    ["Y13", "cd a b && pytest -q"],
    ["Y13", "cd backend && cd tests && pytest -q"],
    ["Y13", "(cd backend && pytest -q)"],
    ["Y13", "pytest -q && pytest -q"],
  ])("%s %j -> no-parser", (_id, command) => {
    expect(select(command)).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
  it("Y13: npm run <script> whose script has pytest with another simple command after it", () => {
    const scripts = (): ScriptsRead => ({ kind: "read", scripts: { test: 'pytest -q && echo "9 passed in 0.10s"' } });
    expect(select("npm run test", scripts)).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
  it("the other tools are chosen as before (their words anywhere; pytest not chosen next to them)", () => {
    expect(select("eslint . && pytest -q")).toEqual({ kind: "tool", tool: "eslint" });
    expect(select("vitest run")).toEqual({ kind: "tool", tool: "vitest" });
  });
  it("pytest chosen and another tool's name among its words (the old reading): several-tools, nothing is read", () => {
    expect(select("pytest -q tests/eslint")).toEqual({ kind: "none", status: "not-applicable", reason: "several-tools" });
  });
});
