/**
 * M2-0 §7: `security.allow` suppresses findings by path glob / category / line with a mandatory
 * reason and an optional expiry; suppressed counts and rule usage are reported, unused and expired
 * rules are warned about, and `security-scan --config` reads the config.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { ConfigError, parseConfigText } from "../src/config/load.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const ANT = fake("sk-ant-", "api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef");
const AWS = fake("AKIA", "ABCDEFGHIJKLMNOP");
const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';

function repo(config: string | null, files: Record<string, string>): string {
  const t = makeTempDir("aiqh-m20-007-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(t.dir, rel)), { recursive: true });
    writeFileSync(path.join(t.dir, rel), c);
  }
  if (config !== null) writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), config);
  execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files), ...(config !== null ? ["aiqh.config.jsonc"] : [])], { cwd: t.dir });
  return t.dir;
}
async function scan(cwd: string, extra: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const code = await runSecurityScan({ cwd, log: (l) => lines.push(l), logError: (l) => lines.push(l), ...extra });
  return { code, output: lines.join("\n") };
}
const FILES = { "tests/test_a.py": `KEY = "${ANT}"\n`, "src/main.py": `x = "${AWS}"\n` };

describe("M2-0 §7: security.allow", () => {
  it("schema: reason is mandatory, expires must be an ISO date, unknown fields are rejected", () => {
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "category": "anthropic" } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": " " } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": "r", "expires": "someday" } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": "r", "bogus": 1 } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "category": "anthropic", "reason": "synthetic", "expires": "2999-12-31" } ] } }`)).not.toThrow();
  });
  it("suppresses matching findings, reports the count and the rules used, exit reflects the rest", async () => {
    const dir = repo(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "category": "anthropic", "reason": "synthetic test keys built at runtime" } ] } }`, FILES);
    const r = await scan(dir);
    expect(r.code).toBe(1); // src/main.py (aws) remains
    expect(r.output).toMatch(/suppressed[^\n]*\b1\b/i);
    expect(r.output).toMatch(/tests\/\*\*/);
    expect(r.output).not.toMatch(/\[secret\] tests\/test_a\.py:1/);
    expect(r.output).toMatch(/\[allowed\] tests\/test_a\.py:1 anthropic by rule #1/);
    expect(r.output).toContain("src/main.py:1");
    const only = repo(`{ ${BASE}, "security": { "allow": [ { "path": "**", "reason": "everything is synthetic here" } ] } }`, { "tests/test_a.py": `KEY = "${ANT}"\n` });
    expect((await scan(only)).code).toBe(0);
  });
  it("an expired rule suppresses nothing and is warned about", async () => {
    const dir = repo(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "category": "anthropic", "reason": "r", "expires": "2020-01-01" } ] } }`, FILES);
    const r = await scan(dir);
    expect(r.output).toContain("tests/test_a.py:1");
    expect(r.output).toMatch(/expired/i);
  });
  it("an unused rule is warned about", async () => {
    const dir = repo(`{ ${BASE}, "security": { "allow": [ { "path": "docs/**", "reason": "never matches" } ] } }`, FILES);
    const r = await scan(dir);
    expect(r.output).toMatch(/unused/i);
    expect(r.output).toMatch(/docs\/\*\*/);
  });
  it("line-scoped rule suppresses only that line; JSON output carries the suppression record", async () => {
    const dir = repo(`{ ${BASE}, "security": { "allow": [ { "path": "tests/test_a.py", "line": 1, "reason": "r" } ] } }`, FILES);
    const r = await scan(dir, { json: true });
    const parsed = JSON.parse(r.output) as { findings: Array<{ file: string }>; suppressed: Array<{ file: string; rule: number }> };
    expect(parsed.findings.map((f) => f.file)).toEqual(["src/main.py"]);
    expect(parsed.suppressed.map((s) => [s.file, s.rule])).toEqual([["tests/test_a.py", 0]]);
  });
  it("--config reads a config elsewhere; a missing default config means no allow; an invalid config is exit 2", async () => {
    const dir = repo(null, FILES);
    expect((await scan(dir)).code).toBe(1);
    const cfgDir = makeTempDir("aiqh-m20-007-cfg-");
    cleanups.push(cfgDir.cleanup);
    const cfg = path.join(cfgDir.dir, "aiqh.config.jsonc");
    writeFileSync(cfg, `{ ${BASE}, "security": { "allow": [ { "path": "**", "reason": "r" } ] } }`);
    expect((await scan(dir, { configPath: cfg })).code).toBe(0);
    writeFileSync(path.join(dir, "aiqh.config.jsonc"), "{ not json");
    expect((await scan(dir)).code).toBe(2);
  });
});
