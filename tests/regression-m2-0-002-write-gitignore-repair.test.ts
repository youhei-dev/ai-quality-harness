/**
 * M2-0 / M1-R3-002: `--write-gitignore` repairs a negated artifacts/ rule by appending the line at
 * the end (last rule wins); once git reports coverage the second run appends nothing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const ignored = (dir: string, p: string): boolean => {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", p], { cwd: dir });
    return true;
  } catch {
    return false;
  }
};

describe("M2-0 / M1-R3-002: --write-gitignore repairs a negation", () => {
  it("artifacts/ + !artifacts/ → after --write-gitignore the artifact paths are ignored; second run adds nothing", async () => {
    const t = makeTempDir("aiqh-m20-002-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), "artifacts/\n!artifacts/\n");
    writeFileSync(path.join(t.dir, "package.json"), '{"name":"demo","private":true}');
    execFileSync("git", ["add", "--", ".gitignore", "package.json"], { cwd: t.dir });
    expect(ignored(t.dir, "artifacts/verification/latest.json")).toBe(false);
    const code = await runInit({ cwd: t.dir, toolVersion: "0.0.0", writeGitignore: true, log: () => {}, logError: () => {} });
    expect(code).toBe(0);
    expect(ignored(t.dir, "artifacts/verification/latest.json")).toBe(true);
    const after1 = readFileSync(path.join(t.dir, ".gitignore"), "utf8");
    await runInit({ cwd: t.dir, toolVersion: "0.0.0", writeGitignore: true, log: () => {}, logError: () => {} });
    expect(readFileSync(path.join(t.dir, ".gitignore"), "utf8")).toBe(after1);
    expect(after1.split("\n").filter((l) => l.trim() === "artifacts/")).toHaveLength(2);
  });
});
