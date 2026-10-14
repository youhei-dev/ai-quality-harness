/**
 * v0.8.0 (ADR-0028, P5): which parser reads a check's output is decided by aiqh from the command, and for `npm run <script>` /
 * `npm test` from that script in the check's package.json. There is no config field for it. A command that names no tool aiqh reads,
 * or more than one, is not-applicable; a package.json that cannot be read is unparsed, not "absent" (ADR-0022). The command of the
 * config is never changed.
 */
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
    ['"vitest" run', "vitest"],
  ])("%s -> %s", (command, tool) => {
    expect(selectParser(command, dir())).toEqual({ kind: "tool", tool });
  });
  it.each([
    ["tsc --noEmit", "no-parser"],
    ["true", "no-parser"],
    ["pytest -q", "no-parser"],
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

describe("npm run <script> / npm test: the script in the check's package.json", () => {
  const scripts = { lint: "eslint .", test: "vitest run", "test:minpath": "node scripts/test-minimal-path.ts", build: "tsc -p tsconfig.build.json", dependency: "npm audit --audit-level=high", both: "eslint . && vitest run" };
  it.each([
    ["npm run lint", { kind: "tool", tool: "eslint" }],
    ["npm run-script lint", { kind: "tool", tool: "eslint" }],
    ["npm test", { kind: "tool", tool: "vitest" }],
    ["npm t", { kind: "tool", tool: "vitest" }],
    ["npm run test -- --bail 1", { kind: "tool", tool: "vitest" }],
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
