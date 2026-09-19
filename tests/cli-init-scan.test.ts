/**
 * M1 — real CLI end-to-end for `aiqh init` and `aiqh security-scan` (exit codes, files written).
 */
import { execFile, execFileSync } from "node:child_process";
import { cpSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { fake, makeTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
async function cli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("aiqh init (CLI)", () => {
  it("proposal only → exit 0, nothing written; --write → file; second --write → exit 2; --force → exit 0", async () => {
    const t = makeTempDir("aiqh-cli-init-");
    cleanups.push(t.cleanup);
    cpSync(path.join(FIX, "node-vite"), t.dir, { recursive: true });
    const p = await cli(["init"], t.dir);
    expect(p.code).toBe(0);
    expect(p.stdout).toContain("npx --no-install tsc -b");
    expect(existsSync(path.join(t.dir, "aiqh.config.jsonc"))).toBe(false);
    expect((await cli(["init", "--write"], t.dir)).code).toBe(0);
    expect(existsSync(path.join(t.dir, "aiqh.config.jsonc"))).toBe(true);
    const again = await cli(["init", "--write"], t.dir);
    expect(again.code).toBe(2);
    expect(`${again.stdout}${again.stderr}`).toMatch(/already exists/);
    expect((await cli(["init", "--write", "--force"], t.dir)).code).toBe(0);
  });
});

describe("aiqh security-scan (CLI)", () => {
  function gitRepo(files: Record<string, string>): string {
    const t = makeTempDir("aiqh-cli-scan-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    for (const [rel, c] of Object.entries(files)) writeFileSync(path.join(t.dir, rel), c);
    execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files)], { cwd: t.dir });
    return t.dir;
  }
  it("exit 0 when clean, exit 1 with a finding (value not printed), exit 2 outside git", async () => {
    expect((await cli(["security-scan"], gitRepo({ "a.txt": "fine\n" }))).code).toBe(0);
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const r = await cli(["security-scan"], gitRepo({ "a.txt": `${secret}\n` }));
    expect(r.code).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("a.txt:1");
    expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
    const t = makeTempDir("aiqh-cli-scan-nogit-");
    cleanups.push(t.cleanup);
    expect((await cli(["security-scan"], t.dir)).code).toBe(2);
  });
});
