/**
 * M2-0 §8: scanner settings in `security` (env probe paths, example suffixes, window limits) with
 * defaults equal to the M1 behaviour.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfigText, resolveConfig } from "../src/config/load.ts";
import { DEFAULT_SECURITY, LINE_OVERLAP, MAX_CARRY_BYTES, MAX_LINE_BYTES, scanRepository } from "../src/security/scan.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repo(gitignore: string, files: string[] = []): string {
  const t = makeTempDir("aiqh-m20-008-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), gitignore);
  execFileSync("git", ["add", "--", ".gitignore"], { cwd: t.dir });
  for (const f of files) writeFileSync(path.join(t.dir, f), "X=1\n");
  return t.dir;
}
const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';

describe("M2-0 §8: security settings", () => {
  it("defaults equal the M1 constants", () => {
    expect(DEFAULT_SECURITY.envProbePaths).toEqual([".env", ".env.local", ".env.production", ".env.development"]);
    expect(DEFAULT_SECURITY.exampleEnvSuffixes).toEqual(["example", "sample", "template", "dist"]);
    expect(DEFAULT_SECURITY.maxLineBytes).toBe(MAX_LINE_BYTES);
    expect(DEFAULT_SECURITY.lineOverlapBytes).toBe(LINE_OVERLAP);
    expect(DEFAULT_SECURITY.maxCarryBytes).toBe(MAX_CARRY_BYTES);
    expect(DEFAULT_SECURITY.allow).toEqual([]);
    const cfg = resolveConfig(parseConfigText(`{ ${BASE} }`), "/tmp/aiqh.config.jsonc");
    expect(cfg.security).toEqual(DEFAULT_SECURITY);
  });
  it("envProbePaths changes which paths are probed", () => {
    const dir = repo(".env\n.env.local\n.env.production\n.env.development\n");
    expect(scanRepository(dir).findings.filter((f) => f.kind === "gitignore")).toEqual([]);
    const custom = { ...DEFAULT_SECURITY, envProbePaths: [".env", ".env.staging"] };
    expect(scanRepository(dir, custom).findings.filter((f) => f.kind === "gitignore").map((f) => f.message)).toEqual([expect.stringMatching(/\.env\.staging/)]);
  });
  it("exampleEnvSuffixes changes which untracked env files are informational", () => {
    const dir = repo(".env\n", [".env.example", ".env.fixture"]);
    const dflt = scanRepository(dir);
    expect(dflt.findings.filter((f) => f.kind === "untracked-env").map((f) => f.file)).toEqual([".env.fixture"]);
    const custom = scanRepository(dir, { ...DEFAULT_SECURITY, exampleEnvSuffixes: ["example", "fixture"] });
    expect(custom.findings.filter((f) => f.kind === "untracked-env")).toEqual([]);
    expect(custom.exampleEnvFiles.sort()).toEqual([".env.example", ".env.fixture"]);
  });
  it("window limits are validated (positive integers) and carried into the resolved config", () => {
    // 4096 / 128 / 2048 satisfies overlap <= carry <= line (M2-0-R1-001; 1024 / 128 / 2048 no longer does)
    const cfg = resolveConfig(parseConfigText(`{ ${BASE}, "security": { "maxLineBytes": 4096, "lineOverlapBytes": 128, "maxCarryBytes": 2048 } }`), "/tmp/aiqh.config.jsonc");
    expect([cfg.security.maxLineBytes, cfg.security.lineOverlapBytes, cfg.security.maxCarryBytes]).toEqual([4096, 128, 2048]);
    expect(() => parseConfigText(`{ ${BASE}, "security": { "maxLineBytes": 0 } }`)).toThrow();
  });
});
