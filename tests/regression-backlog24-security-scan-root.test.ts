/**
 * Backlog 24: when `git ls-files` could not run, security-scan said `not a git repository (or git failed): <root> (spawnSync git ENOENT)`
 * even when the ENOENT was the root's, not git's (`--cwd` to a missing directory), and the same for a root that is a regular file (reached
 * with an explicit `--config` elsewhere, so that the config read does not fail first). Now the failure of git is followed by a look at the
 * root, and a root problem is said in the words of init's root check (backlog 8, O9; ADR-0022): `directory not found`, `not a directory`,
 * `directory cannot be examined (<code>)`. Exit code 2 as before. A directory that is not a repository and a git that is not on PATH keep
 * the old message (controls: they pass before and after).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function temp(): string {
  const t = makeTempDir("aiqh-b24-");
  cleanups.push(t.cleanup);
  return t.dir;
}

async function scan(opts: Parameters<typeof runSecurityScan>[0]): Promise<{ code: number; err: string }> {
  const err: string[] = [];
  const code = await runSecurityScan({ log: () => {}, logError: (l) => err.push(l), ...opts });
  return { code, err: err.join("\n") };
}

describe("backlog 24: a root problem is reported as one, not as a git failure", () => {
  it("--cwd to a directory that does not exist: 'directory not found' (before: git ENOENT)", async () => {
    const missing = path.join(temp(), "no-such-dir");
    const r = await scan({ cwd: missing });
    expect(r.code).toBe(2);
    expect(r.err).toBe(`aiqh security-scan: directory not found: ${missing}`);
  });

  it("--cwd to a regular file, with an explicit --config elsewhere: 'not a directory' (before: git ENOTDIR as a git failure)", async () => {
    const dir = temp();
    const file = path.join(dir, "a-file");
    writeFileSync(file, "x");
    const config = path.join(dir, "aiqh.config.jsonc");
    writeFileSync(config, '{ "version": 1, "project": { "name": "demo", "type": "other" }, "checks": [{ "name": "t", "kind": "custom", "command": "true" }] }');
    const r = await scan({ cwd: file, configPath: config });
    expect(r.code).toBe(2);
    expect(r.err).toBe(`aiqh security-scan: not a directory: ${file}`);
  });
});

describe("backlog 24 controls: a git failure with a healthy root keeps its message (pass before and after)", () => {
  it("a directory that is not a git repository: 'not a git repository (or git failed)'", async () => {
    const dir = temp();
    const r = await scan({ cwd: dir });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^aiqh security-scan: not a git repository \(or git failed\): /);
  });

  it("git not on PATH: 'not a git repository (or git failed)' with git's ENOENT", async () => {
    const dir = temp();
    const saved = process.env.PATH;
    process.env.PATH = temp(); // an empty directory: no git
    try {
      const r = await scan({ cwd: dir });
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/^aiqh security-scan: not a git repository \(or git failed\): .*ENOENT/);
    } finally {
      process.env.PATH = saved;
    }
  });
});
