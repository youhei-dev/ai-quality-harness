/**
 * M2-0 / M1-R3-004: only rules from a *tracked* .gitignore count as coverage; an untracked local
 * .gitignore does not exist in a clone.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitIgnoredByRepoRules, scanRepository } from "../src/security/scan.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repo(): string {
  const t = makeTempDir("aiqh-m20-004-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, "a.txt"), "x\n");
  execFileSync("git", ["add", "--", "a.txt"], { cwd: t.dir });
  return t.dir;
}
const gi = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "gitignore");

describe("M2-0 / M1-R3-004: coverage requires a tracked .gitignore", () => {
  it("untracked .gitignore ignoring .env* → gitignore findings remain", () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.*\n");
    expect(gi(dir).length).toBeGreaterThan(0);
  });
  it("tracked .gitignore → no gitignore finding", () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.*\n");
    execFileSync("git", ["add", "--", ".gitignore"], { cwd: dir });
    expect(gi(dir)).toEqual([]);
  });
  it("nested .gitignore: tracked counts, untracked does not (checked per source)", () => {
    const dir = repo();
    mkdirSync(path.join(dir, "config"));
    writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
    writeFileSync(path.join(dir, "config", ".gitignore"), "*.secret\n");
    execFileSync("git", ["add", "--", ".gitignore"], { cwd: dir }); // config/.gitignore stays untracked
    expect(gitIgnoredByRepoRules(dir, ["config/a.secret"]).has("config/a.secret")).toBe(false);
    execFileSync("git", ["add", "--", "config/.gitignore"], { cwd: dir });
    expect(gitIgnoredByRepoRules(dir, ["config/a.secret"]).has("config/a.secret")).toBe(true);
  });
});
