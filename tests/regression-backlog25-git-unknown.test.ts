/**
 * Backlog 25: verify's `git:` line said "(no commit)" when `git rev-parse HEAD` failed and "(detached)" when both branch lookups failed,
 * as if git had answered. git's own answers are told from failures by the exit code alone (measured before the change, git 2.50):
 * `rev-parse --verify --quiet HEAD` exits 1 with no output when there is no commit, `symbolic-ref -q --short HEAD` exits 1 when HEAD is
 * detached, and a failure is any other status or a git that cannot run. Now a failure is shown as "(commit: unknown)" / "(branch: unknown)",
 * like "(dirty: unknown)" (R-009). The report's `git` keeps its shape and values ({ commit, branch, dirty }, null for both), as the
 * decision for O3 did (ADR-0022, decision 8). The failures are made by a shell script put first on PATH (builtins only), as in the O3
 * test. A repository without a commit and a really detached HEAD are controls: they pass before and after.
 */
import { accessSync, chmodSync, constants, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** The first executable named `git` on the current PATH (an absolute path; the shim calls it). */
function realGit(): string {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "git");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // next directory
    }
  }
  throw new Error("git is not on PATH");
}

/** A directory with a `git` script that runs `cases` (the body of a `case " $* " in … esac`) and otherwise the real git. Returns the PATH to use. */
function shimPath(cases: string): string {
  const t = makeTempDir("aiqh-b25-shim-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "git"), `#!/bin/sh\nREAL="$AIQH_REAL_GIT"\ncase " $* " in\n${cases}\nesac\nexec "$REAL" "$@"\n`);
  chmodSync(path.join(t.dir, "git"), 0o755);
  return `${t.dir}${path.delimiter}${process.env.PATH ?? ""}`;
}

/** A git repository with one passing check; `commits` commits (0 = none); `detach` checks out the commit detached. */
function repo(commits: number, detach = false): string {
  const t = makeTempDir("aiqh-b25-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, ".gitignore"), "artifacts/\n");
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), '{ "version": 1, "project": { "name": "demo", "type": "other" }, "checks": [{ "name": "ok", "kind": "custom", "command": "true" }] }');
  for (let n = 0; n < commits; n++) {
    git("add", "--", ".gitignore", "aiqh.config.jsonc");
    git("commit", "-q", "--allow-empty", "-m", `c${n}`);
  }
  if (detach) git("checkout", "-q", "--detach");
  return t.dir;
}

/** Run verify in `dir` with `PATH` (and the real git for the shim); return the `git:` line and the report's `git`. */
async function verify(dir: string, pathValue?: string): Promise<{ code: number; line: string | undefined; reportGit: unknown }> {
  const saved = { PATH: process.env.PATH, AIQH_REAL_GIT: process.env.AIQH_REAL_GIT };
  process.env.AIQH_REAL_GIT = realGit();
  if (pathValue !== undefined) process.env.PATH = pathValue;
  const lines: string[] = [];
  try {
    const code = await runVerify({ cwd: dir, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    const report = JSON.parse(readFileSync(path.join(dir, "artifacts", "verification", "latest.json"), "utf8")) as { git: unknown };
    return { code, line: lines.find((l) => l.startsWith("git:")), reportGit: report.git };
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.AIQH_REAL_GIT === undefined) delete process.env.AIQH_REAL_GIT;
    else process.env.AIQH_REAL_GIT = saved.AIQH_REAL_GIT;
  }
}

const HEAD_FAILS = '*" rev-parse HEAD "*|*" rev-parse --verify --quiet HEAD "*) echo "fatal: simulated failure" >&2; exit 128;;';
const BRANCH_FAILS = '*" symbolic-ref "*|*" rev-parse --abbrev-ref HEAD "*) echo "fatal: simulated failure" >&2; exit 128;;';

describe("backlog 25: a git failure is shown as unknown, not as git's answer", () => {
  it('the commit lookup fails: "(commit: unknown)" (before: "(no commit)"); the report\'s git keeps commit null', async () => {
    const dir = repo(1);
    const r = await verify(dir, shimPath(HEAD_FAILS));
    expect(r.code).toBe(0);
    expect(r.line).toBe("git: main @ (commit: unknown)");
    expect(r.reportGit).toEqual({ commit: null, branch: "main", dirty: false });
  });

  it('both branch lookups fail: "(branch: unknown)" (before: "(detached)"); the report\'s git keeps branch null', async () => {
    const dir = repo(1);
    const r = await verify(dir, shimPath(BRANCH_FAILS));
    expect(r.code).toBe(0);
    expect(r.line).toMatch(/^git: \(branch: unknown\) @ [0-9a-f]{12}$/);
    expect(r.reportGit).toMatchObject({ branch: null, dirty: false });
  });
});

describe("backlog 25 controls: git's own answers are shown as before (pass before and after)", () => {
  it('a repository without a commit: "main @ (no commit)" (git answered: rev-parse --verify --quiet exits 1); its files are untracked, so dirty', async () => {
    const r = await verify(repo(0));
    expect(r.line).toBe("git: main @ (no commit) (dirty)");
    expect(r.reportGit).toMatchObject({ commit: null, branch: "main" });
  });

  it('a really detached HEAD: "HEAD @ <commit>" (symbolic-ref exits 1, rev-parse --abbrev-ref says HEAD)', async () => {
    const r = await verify(repo(1, true));
    expect(r.line).toMatch(/^git: HEAD @ [0-9a-f]{12}$/);
    expect(r.reportGit).toMatchObject({ branch: "HEAD" });
  });

  it("a repository on a branch: the line and the report's git are as before", async () => {
    const r = await verify(repo(1));
    expect(r.line).toMatch(/^git: main @ [0-9a-f]{12}$/);
    expect(Object.keys(r.reportGit as object).sort()).toEqual(["branch", "commit", "dirty"]);
  });
});
