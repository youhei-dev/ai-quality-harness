/**
 * M1-R1-005: .gitignore coverage of .env files is decided by git itself (check-ignore --no-index),
 * so negation rules count. Example / sample / template files may be un-ignored.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepository } from "../src/security/scan.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repoWithGitignore(content: string): string {
  const t = makeTempDir("aiqh-r1-005-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), content);
  writeFileSync(path.join(t.dir, "a.txt"), "x\n");
  execFileSync("git", ["add", "--", ".gitignore", "a.txt"], { cwd: t.dir });
  return t.dir;
}
const gi = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "gitignore").map((f) => f.message);

describe("M1-R1-005: negation rules in .gitignore", () => {
  it(".env* + !.env.production → finding naming .env.production", () => {
    const msgs = gi(repoWithGitignore(".env*\n!.env.production\n"));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/\.env\.production/);
  });
  it(".env* alone → no finding", () => {
    expect(gi(repoWithGitignore(".env*\n"))).toEqual([]);
  });
  it(".env and .env.* on two lines → no finding", () => {
    expect(gi(repoWithGitignore(".env\n.env.*\n"))).toEqual([]);
  });
  it(".env* + !.env.example → no finding (example files may be tracked)", () => {
    expect(gi(repoWithGitignore(".env*\n!.env.example\n"))).toEqual([]);
  });
  it("only .env → finding for the variants; nothing at all → two findings", () => {
    expect(gi(repoWithGitignore(".env\n"))).toHaveLength(1);
    expect(gi(repoWithGitignore("node_modules\n"))).toHaveLength(2);
  });
});
