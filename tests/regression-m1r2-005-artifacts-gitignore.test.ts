/**
 * M1-R2-005: the `artifacts/` proposal of `aiqh init` asks git (check-ignore) instead of matching
 * lines, so negations count; outside a git repository the proposal is made (safe side).
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
function repo(gitignore: string | null, git = true): string {
  const t = makeTempDir("aiqh-r2-005-");
  cleanups.push(t.cleanup);
  if (git) execFileSync("git", ["init", "-q"], { cwd: t.dir });
  if (gitignore !== null) writeFileSync(path.join(t.dir, ".gitignore"), gitignore);
  if (git && gitignore !== null) execFileSync("git", ["add", "--", ".gitignore"], { cwd: t.dir }); // M2-0: only tracked .gitignore rules count
  return t.dir;
}

describe("M1-R2-005: artifacts/ proposal uses git semantics", () => {
  it("artifacts/ → not needed", () => expect(proposeGitignore(repo("artifacts/\n")).needed).toBe(false));
  it("artifacts/ followed by !artifacts/ → needed", () => expect(proposeGitignore(repo("artifacts/\n!artifacts/\n")).needed).toBe(true));
  it("/artifacts/ → not needed", () => expect(proposeGitignore(repo("/artifacts/\n")).needed).toBe(false));
  it("artifacts/** → not needed", () => expect(proposeGitignore(repo("artifacts/**\n")).needed).toBe(false));
  it("no .gitignore → needed", () => expect(proposeGitignore(repo(null)).needed).toBe(true));
  it("not a git repository → needed (safe side)", () => expect(proposeGitignore(repo("artifacts/\n", false)).needed).toBe(true));
});
