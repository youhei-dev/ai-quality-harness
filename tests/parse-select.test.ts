/**
 * v0.8.0 (ADR-0028, P5): which parser reads a check's output is decided by aiqh from the command, and for `npm run <script>` /
 * `npm test` from that script in the check's package.json. There is no config field for it. A command that names no tool aiqh reads,
 * or more than one, is not-applicable; a package.json that cannot be read is unparsed, not "absent" (ADR-0022). The command of the
 * config is never changed.
 */
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { simpleCommands } from "../src/command-words.ts";
import { runsNodeTest } from "../src/node-command.ts";
import { readCheckOutput } from "../src/parse/read.ts";
import { PACKAGE_JSON_MAX, selectParser } from "../src/parse/select.ts";
import type { ExecutionResult, ResolvedCheck } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function dirWith(scripts: Record<string, string> | null, raw?: string): string {
  const t = makeTempDir("aiqh-parse-select-");
  cleanups.push(t.cleanup);
  if (raw !== undefined) writeFileSync(path.join(t.dir, "package.json"), raw);
  else if (scripts !== null) writeFileSync(path.join(t.dir, "package.json"), JSON.stringify({ name: "x", scripts }));
  return t.dir;
}

describe("the command names the tool", () => {
  const dir = (): string => dirWith(null);
  it.each([
    ["vitest run", "vitest"],
    ["npx vitest run --coverage", "vitest"],
    ["node node_modules/vitest/vitest.mjs run", "vitest"],
    ["./node_modules/.bin/vitest", "vitest"],
    ["eslint .", "eslint"],
    ["npx eslint src --max-warnings 0", "eslint"],
    ["node node_modules/eslint/bin/eslint.js .", "eslint"],
    ["npm audit --audit-level=high", "npm-audit"],
    ["npm --loglevel=error audit", "npm-audit"],
    ["npx aiqh security-scan", "aiqh-security-scan"],
    ["aiqh security-scan --config aiqh.config.jsonc", "aiqh-security-scan"],
    ["node src/cli.ts security-scan", "aiqh-security-scan"],
    ["node dist/cli.js security-scan", "aiqh-security-scan"],
    ['"vitest" run', "vitest"],
    ["pytest -q", "pytest"],
  ])("%s -> %s", (command, tool) => {
    expect(selectParser(command, dir())).toEqual({ kind: "tool", tool });
  });
  it.each([
    ["tsc --noEmit", "no-parser"],
    ["true", "no-parser"],
    ["pnpm audit", "no-parser"],
    ["yarn audit", "no-parser"],
    ["security-scan", "no-parser"],
    ["echo vitest-results", "no-parser"],
    ["eslint . && vitest run", "several-tools"],
    ["vitest run; npm audit", "several-tools"],
  ])("%s -> not-applicable (%s)", (command, reason) => {
    expect(selectParser(command, dir())).toEqual({ kind: "none", status: "not-applicable", reason });
  });
});

// Item 55 (v0.15.1; ADR-0028, decision 13): vitest, eslint, npm audit and security-scan are chosen by any word of a simple command (only
// pytest by the position of the word), so a wrapper that is in no list of launch forms still reads the counts. These forms read correct
// counts today, so a change of the choosing shows here. The known limit (a command that only names a tool, such as `echo vitest …`,
// also chooses it) is recorded in ADR-0028 and ROADMAP item 55, and deliberately not pinned by a test.
describe("item 55: the four tools other than pytest are chosen behind a wrapper", () => {
  const dir = (): string => dirWith(null);
  it.each([
    ["cross-env CI=1 vitest run", "vitest"],
    ["pnpm exec vitest run", "vitest"],
    ["npm exec vitest", "vitest"],
    ["timeout 600 vitest run", "vitest"],
    ["npm --prefix web audit", "npm-audit"],
  ])("%s -> %s", (command, tool) => {
    expect(selectParser(command, dir())).toEqual({ kind: "tool", tool });
  });
});

describe("npm run <script> / npm test: the script in the check's package.json", () => {
  const scripts = { lint: "eslint .", test: "vitest run", "test:minpath": "node scripts/test-minimal-path.ts", security: "node src/cli.ts security-scan", build: "tsc -p tsconfig.build.json", dependency: "npm audit --audit-level=high", both: "eslint . && vitest run" };
  it.each([
    ["npm run lint", { kind: "tool", tool: "eslint" }],
    ["npm run-script lint", { kind: "tool", tool: "eslint" }],
    ["npm test", { kind: "tool", tool: "vitest" }],
    ["npm t", { kind: "tool", tool: "vitest" }],
    ["npm run test -- --bail 1", { kind: "tool", tool: "vitest" }],
    ["npm run security", { kind: "tool", tool: "aiqh-security-scan" }],
    ["npm run dependency", { kind: "tool", tool: "npm-audit" }],
    ["npm run test:minpath", { kind: "none", status: "not-applicable", reason: "no-parser" }],
    ["npm run build", { kind: "none", status: "not-applicable", reason: "no-parser" }],
    ["npm run both", { kind: "none", status: "not-applicable", reason: "several-tools" }],
    ["npm run missing", { kind: "none", status: "not-applicable", reason: "no-parser" }],
  ])("%s", (command, expected) => {
    expect(selectParser(command, dirWith(scripts))).toEqual(expected);
  });
  it("no package.json (ENOENT): not-applicable; package.json without scripts: not-applicable", () => {
    expect(selectParser("npm run lint", dirWith(null))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
    expect(selectParser("npm run lint", dirWith(null, '{ "name": "x" }'))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
  it("a package.json that cannot be read is not absent (ADR-0022): unparsed, script-unreadable", () => {
    const unreadable = { kind: "none", status: "unparsed", reason: "script-unreadable" };
    expect(selectParser("npm run lint", dirWith(null, "{ not json"))).toEqual(unreadable);
    const asDir = dirWith(null);
    mkdirSync(path.join(asDir, "package.json"));
    expect(selectParser("npm run lint", asDir)).toEqual(unreadable);
    const linked = dirWith(null);
    writeFileSync(path.join(linked, "real.json"), JSON.stringify({ scripts: { lint: "eslint ." } }));
    symlinkSync(path.join(linked, "real.json"), path.join(linked, "package.json"));
    expect(selectParser("npm run lint", linked)).toEqual(unreadable);
    expect(selectParser("npm run lint", dirWith(null, `{ "scripts": { "lint": "eslint ." }, "pad": "${"p".repeat(PACKAGE_JSON_MAX)}" }`))).toEqual(unreadable);
    expect(selectParser("npm run lint", path.join(dirWith(null), "missing-dir"))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
  it.skipIf(process.getuid?.() === 0)("a package.json that cannot even be looked at (EACCES on its directory) is unreadable, not absent", () => {
    const dir = dirWith({ lint: "eslint ." });
    chmodSync(dir, 0o000);
    cleanups.push(() => chmodSync(dir, 0o700));
    expect(selectParser("npm run lint", dir)).toEqual({ kind: "none", status: "unparsed", reason: "script-unreadable" });
  });
  it("a script that is not a string, or scripts that are not an object, are not a tool", () => {
    expect(selectParser("npm run lint", dirWith(null, '{ "scripts": { "lint": 1 } }'))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
    expect(selectParser("npm run lint", dirWith(null, '{ "scripts": ["eslint ."] }'))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
  it("only the command itself is resolved: npm run inside a compound command is not followed", () => {
    expect(selectParser("npm run lint && npm run test", dirWith(scripts))).toEqual({ kind: "none", status: "not-applicable", reason: "no-parser" });
  });
});

describe("the config's command is never changed", () => {
  it("readCheckOutput reads the check and the execution and leaves both as they were", () => {
    const dir = dirWith({ test: "vitest run" });
    const check: ResolvedCheck = { name: "unit", kind: "unit", command: "npm run test", cwd: ".", cwdAbsolute: dir, required: true, timeoutSec: 10 };
    const exec: ExecutionResult = { exitCode: 0, signal: null, timedOut: false, interruptedBy: null, spawnError: null, stdout: " Test Files  1 passed (1)\n      Tests  1 passed (1)\n", stderr: "", stdoutTruncated: false, stderrTruncated: false, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1 };
    const before = JSON.stringify({ check, exec });
    const parsed = readCheckOutput(check, exec);
    expect(parsed).toMatchObject({ tool: "vitest", status: "parsed", counts: { tests: 1 } });
    expect(JSON.stringify({ check, exec })).toBe(before);
  });
  it("a check that names no tool is not-applicable and nothing is read", () => {
    const dir = dirWith(null);
    const check: ResolvedCheck = { name: "c", kind: "custom", command: "true", cwd: ".", cwdAbsolute: dir, required: true, timeoutSec: 10 };
    const exec: ExecutionResult = { exitCode: 0, signal: null, timedOut: false, interruptedBy: null, spawnError: null, stdout: " Test Files  1 passed (1)\n      Tests  1 passed (1)\n", stderr: "", stdoutTruncated: true, stderrTruncated: false, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1 };
    expect(readCheckOutput(check, exec)).toEqual({ tool: null, status: "not-applicable", reason: "no-parser", truncated: false, counts: {}, items: [], itemsOmitted: 0 });
  });
});

// v0.18.0 (ADR-0028 decision 14; the batch3 design, final, §3.2, B3-D-Q1 A and B3-D-Q5 A): node-test is chosen by the position of its
// words like pytest's B-1 — one simple command (after at most `cd <one word>`) that the node:test rules of `aiqh init` accept
// (src/node-command.ts), with no --test-reporter or one of spec / tap, and no --test-reporter-destination or one of stdout. The last
// column is whether the init rules accept the same text (the parser is narrower: init accepts a script when any simple command passes).
describe("v0.18.0: node-test is chosen by the words' position, the rules of aiqh init and a readable reporter", () => {
  const initAccepts = (text: string): boolean => simpleCommands(text)?.some(runsNodeTest) ?? false;
  type Expected = { kind: "tool"; tool: string } | { kind: "none"; status: "not-applicable"; reason: string };
  const tool = (t: string): Expected => ({ kind: "tool", tool: t });
  const none = (reason: string): Expected => ({ kind: "none", status: "not-applicable", reason });
  // [the command, or "npm test" with this script in package.json; the selection; init accepts the text]
  it.each([
    ["node --test", tool("node-test"), true],
    ["node --test tests/a.test.mjs tests/b.test.mjs", tool("node-test"), true],
    ['npm test: node --test "tests/**/*.test.ts"', tool("node-test"), true],
    ["cd web && node --test", tool("node-test"), true],
    ["node --test --test-reporter=tap", tool("node-test"), true],
    ["node --test --test-reporter spec --test-reporter-destination stdout", tool("node-test"), true],
    ["node --test --experimental-test-coverage", tool("node-test"), true],
    ["node --test --test-reporter=dot", none("no-parser"), true],
    ["node --test --test-reporter=spec --test-reporter=tap", none("no-parser"), true],
    ["node --test --test-reporter-destination=out.txt", none("no-parser"), true],
    ["node --test && echo done", none("no-parser"), true],
    ["node --test --watch", none("no-parser"), false],
    ["NODE_OPTIONS=--x node --test", none("no-parser"), false],
    ["/usr/bin/node --test", none("no-parser"), false],
    ["echo node --test", none("no-parser"), false],
    ["node --test vitest", none("several-tools"), true],
    ["npm test: vitest run", tool("vitest"), false],
  ] as const)("the table of §3.2: %s", (row, expected, init) => {
    const script = row.startsWith("npm test: ") ? row.slice("npm test: ".length) : null;
    const selection = script === null ? selectParser(row, dirWith(null)) : selectParser("npm test", dirWith({ test: script }));
    expect(selection).toEqual(expected);
    expect(initAccepts(script ?? row)).toBe(init);
  });
  it.each([
    ["node --test --test-reporter spec", tool("node-test")],
    ["node --test --test-reporter=spec", tool("node-test")],
    ["node --test --test-reporter-destination=stdout", tool("node-test")],
    ["node --test --test-reporter=tap --test-reporter-destination=stdout", tool("node-test")],
    ["NO_COLOR=1 node --test", tool("node-test")],
    ["node --test --test-reporter=junit", none("no-parser")],
    ["node --test --test-reporter=lcov", none("no-parser")],
    ["node --test --test-reporter=./my-reporter.mjs", none("no-parser")],
    ["node --test --test-reporter=spec --test-reporter-destination=stderr", none("no-parser")],
    ["node --test --test-reporter-destination=stdout --test-reporter-destination=stdout", none("no-parser")],
    ["node --test --test-reporter=tap --test-reporter=tap", none("no-parser")],
    ["cd web && cd tests && node --test", none("no-parser")],
    ["cd a b && node --test", none("no-parser")],
    ["true && node --test", none("no-parser")],
    ["node --test; node --test", none("no-parser")],
    ["node --test | cat", none("no-parser")],
    ["npx node --test", none("no-parser")],
    ["node --test --unknown-option", none("no-parser")],
  ] as const)("more edges: %s", (command, expected) => {
    expect(selectParser(command, dirWith(null))).toEqual(expected);
  });
});
