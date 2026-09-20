/**
 * M2-0-R1-002: `security-scan` output goes through the masker like every other command (text lines
 * via maskSecrets, JSON via maskDeep), and allow rule free text cannot contain line breaks.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { ConfigError, parseConfigText } from "../src/config/load.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';
const AWS = fake("AKIA", "ABCDEFGHIJKLMNOP");
const ANT = fake("sk-ant-", "api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef");

function repo(config: string): string {
  const t = makeTempDir("aiqh-r1-002-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  writeFileSync(path.join(t.dir, "tests_a.py"), `KEY = "${ANT}"\n`);
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), config);
  execFileSync("git", ["add", "--", ".gitignore", "tests_a.py", "aiqh.config.jsonc"], { cwd: t.dir });
  return t.dir;
}
async function scan(cwd: string, json = false) {
  const lines: string[] = [];
  const code = await runSecurityScan({ cwd, json, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, output: lines.join("\n") };
}

describe("M2-0-R1-002: mask boundary of security-scan", () => {
  const cfg = `{ ${BASE}, "security": { "allow": [ { "path": "tests_a.py", "category": "anthropic", "reason": "temporary ${AWS} exception" } ] } }`;
  it("text output: the reason is masked but the rule usage stays auditable", async () => {
    const r = await scan(repo(cfg));
    // The config file itself is tracked and carries the secret-shaped reason: the scanner reports it
    // (aiqh.config.jsonc, aws) — that is correct — so the exit is 1; the value must still be masked.
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/\[secret\] aiqh\.config\.jsonc:\d+ aws/);
    expect(r.output).not.toContain(AWS);
    expect(r.output).toContain("[REDACTED:aws]");
    expect(r.output).toMatch(/rule used 1×: #1 path=tests_a\.py category=anthropic/);
    expect(r.output).toMatch(/\[allowed\] tests_a\.py:1 anthropic by rule #1/);
  });
  it("--json output: the reason is masked deeply", async () => {
    const r = await scan(repo(cfg), true);
    expect(r.output).not.toContain(AWS);
    const parsed = JSON.parse(r.output) as { allowUsage: Array<{ reason: string; count: number }>; suppressed: unknown[] };
    expect(parsed.allowUsage[0]?.reason).toContain("[REDACTED:aws]");
    expect(parsed.allowUsage[0]?.count).toBe(1);
    expect(parsed.suppressed).toHaveLength(1);
  });
  it("schema: reason and path must not contain line breaks", () => {
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": "line one\\nline two" } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": "a\\rb" } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**\\nsrc/**", "reason": "r" } ] } }`)).toThrow(ConfigError);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "allow": [ { "path": "tests/**", "reason": "one line" } ] } }`)).not.toThrow();
  });
});
