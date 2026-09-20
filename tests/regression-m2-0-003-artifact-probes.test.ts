/**
 * M2-0 / M1-R3-003: the artifacts/ proposal probes the real artifact paths; a rule that only
 * ignores a sentinel does not count as coverage.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { proposeGitignore } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repo(gitignore: string): string {
  const t = makeTempDir("aiqh-m20-003-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), gitignore);
  execFileSync("git", ["add", "--", ".gitignore"], { cwd: t.dir });
  return t.dir;
}

describe("M2-0 / M1-R3-003: real artifact paths decide the proposal", () => {
  it("sentinel-only rule → needed", () => expect(proposeGitignore(repo("artifacts/.aiqh-ignore-probe\n")).needed).toBe(true));
  it("artifacts/ → not needed", () => expect(proposeGitignore(repo("artifacts/\n")).needed).toBe(false));
  it("artifacts/** → not needed", () => expect(proposeGitignore(repo("artifacts/**\n")).needed).toBe(false));
  it("only artifacts/verification/ → needed (ai-review not covered)", () => expect(proposeGitignore(repo("artifacts/verification/\n")).needed).toBe(true));
});
