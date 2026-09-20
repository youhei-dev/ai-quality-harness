/**
 * M2-0-R1-003: `--write-gitignore` stays idempotent when .gitignore is untracked: it creates the
 * file once, never duplicates the canonical line, and tells the user to track the file; the
 * negation repair for a tracked .gitignore is unchanged.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repo(): string {
  const t = makeTempDir("aiqh-r1-003-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, "package.json"), '{"name":"demo","private":true}');
  execFileSync("git", ["add", "--", "package.json"], { cwd: t.dir });
  return t.dir;
}
async function write(dir: string) {
  const lines: string[] = [];
  const code = await runInit({ cwd: dir, toolVersion: "0.0.0", writeGitignore: true, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, output: lines.join("\n") };
}
const lineCount = (dir: string) => readFileSync(path.join(dir, ".gitignore"), "utf8").split("\n").filter((l) => l.trim() === "artifacts/").length;

describe("M2-0-R1-003: --write-gitignore with an untracked .gitignore", () => {
  it("no .gitignore: the first run creates one line, the second run keeps one line and asks to track the file", async () => {
    const dir = repo();
    expect(existsSync(path.join(dir, ".gitignore"))).toBe(false);
    expect((await write(dir)).code).toBe(0);
    expect(lineCount(dir)).toBe(1);
    const second = await write(dir);
    expect(second.code).toBe(0);
    expect(lineCount(dir)).toBe(1);
    expect(second.output).toMatch(/not tracked/);
    expect(second.output).toMatch(/git add \.gitignore/);
  });
  it("untracked .gitignore that already contains artifacts/: nothing appended, guidance printed", async () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n");
    const r = await write(dir);
    expect(r.code).toBe(0);
    expect(lineCount(dir)).toBe(1);
    expect(r.output).toMatch(/not tracked/);
  });
  it("tracked .gitignore with a negation: the repair line is appended once (guard for M1-R3-002)", async () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n!artifacts/\n");
    execFileSync("git", ["add", "--", ".gitignore"], { cwd: dir });
    await write(dir);
    expect(lineCount(dir)).toBe(2);
    await write(dir);
    expect(lineCount(dir)).toBe(2);
  });
});
