/**
 * Backlog 8 (C group), O5 and O9 (docs/reviews/m2-2/response-r1.md; the dry-run part of O5 was left in v0.5.29, ADR-0022 "known limits").
 *  - O9: runInit() asked existsSync(root): a directory that exists but cannot be examined was reported as "directory not found", and a
 *    root that is a regular file was audited as if it were a repository (exit 0). Only ENOENT is "not found" now; any other failure of
 *    stat says the directory cannot be examined, with the code; a path that is not a directory is refused (exit 2).
 *  - O5: proposeGitignore() asked existsSync() for `.gitignore` and `.git`, which follows links and is false for every failure: a dangling
 *    or looping `.gitignore` was "no .gitignore", a dangling `.git` was "not a git repository" while the audit of the same run called
 *    it a repository. Now lstat decides: only ENOENT is absent; a link is present (git then decides); any other failure says it cannot
 *    be examined. The dry-run text changes; the exit code does not (the writes were already refused or failed since v0.5.29).
 * Permission cases are skipped for root. The cases that are not about O5 or O9 are controls: they pass before and after.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { proposeGitignore, runInit } from "../src/commands/init.ts";
import { fake, makeTempDir } from "./helpers.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function temp(): string {
  const t = makeTempDir("aiqh-b8c-o59-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Make `p` impossible to traverse / read; it is restored first on cleanup (LIFO, before the temp dir is removed). */
function lock(p: string): void {
  chmodSync(p, 0o000);
  cleanups.push(() => chmodSync(p, 0o755));
}

/** A git repository (one commit) in a temporary directory. */
function repo(): string {
  const dir = temp();
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(dir, "a.txt"), "x\n");
  git("add", "--", "a.txt");
  git("commit", "-q", "-m", "c1");
  return dir;
}

async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => out.push(l), logError: (l) => err.push(l), ...opts });
  return { code, out, err };
}

describe("backlog 8 O9: the root of init is examined, not just 'found'", () => {
  it.skipIf(isRoot)("a directory below one that cannot be traversed (EACCES): 'cannot be examined (EACCES)', exit 2 (before: 'directory not found')", async () => {
    const dir = temp();
    mkdirSync(path.join(dir, "parent", "child"), { recursive: true });
    lock(path.join(dir, "parent"));
    const r = await init(path.join(dir, "parent", "child"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/^aiqh init: directory cannot be examined: .*parent\/child \(EACCES\)$/);
    expect(r.out).toEqual([]);
  });

  it("a root that is a regular file: 'not a directory', exit 2, nothing audited (before: exit 0 and an audit of the file as a repository)", async () => {
    const dir = temp();
    writeFileSync(path.join(dir, "afile"), "x");
    const r = await init(path.join(dir, "afile"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/^aiqh init: not a directory: .*afile$/);
    expect(r.out).toEqual([]);
  });

  it("a root below a regular file (ENOTDIR): 'cannot be examined (ENOTDIR)'", async () => {
    const dir = temp();
    writeFileSync(path.join(dir, "afile"), "x");
    const r = await init(path.join(dir, "afile", "x"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/directory cannot be examined: .*afile\/x \(ENOTDIR\)/);
  });

  it("a root that is a symbolic link that loops (ELOOP): 'cannot be examined (ELOOP)'", async () => {
    const dir = temp();
    symlinkSync("loop", path.join(dir, "loop"));
    const r = await init(path.join(dir, "loop"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/directory cannot be examined: .*loop \(ELOOP\)/);
  });
});

describe("backlog 8 O9 controls: the root of init (pass before and after)", () => {
  it("a directory that does not exist: 'directory not found', exit 2", async () => {
    const dir = temp();
    const r = await init(path.join(dir, "no-such-dir"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/^aiqh init: directory not found: .*no-such-dir$/);
  });

  it("a dangling symbolic link (its target does not exist): 'directory not found'", async () => {
    const dir = temp();
    symlinkSync("missing-dir", path.join(dir, "link"));
    const r = await init(path.join(dir, "link"));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/^aiqh init: directory not found: .*link$/);
  });

  it("a directory: the audit runs, exit 0", async () => {
    const dir = temp();
    const r = await init(dir);
    expect(r.code).toBe(0);
    expect(r.out.some((l) => l.startsWith("aiqh init — "))).toBe(true);
  });
});

describe("backlog 8 O5: .gitignore and .git are examined by lstat, not by existsSync", () => {
  it("a .gitignore that is a dangling symbolic link in a repository: not 'no .gitignore'; git is asked (before: 'no .gitignore', git not asked)", () => {
    const dir = repo();
    symlinkSync("missing-target", path.join(dir, ".gitignore"));
    const p = proposeGitignore(dir);
    expect(p.needed).toBe(true);
    expect(p.reason).not.toBe("no .gitignore");
    expect(p.canAskGit).toBe(true);
  });

  it("a .gitignore that is a symbolic link that loops: not 'no .gitignore'", () => {
    const dir = repo();
    symlinkSync(".gitignore", path.join(dir, ".gitignore"));
    const p = proposeGitignore(dir);
    expect(p.needed).toBe(true);
    expect(p.reason).not.toBe("no .gitignore");
  });

  it("a .git that is a dangling symbolic link, with a .gitignore: the audit and the proposal no longer disagree (before: 'not a git repository')", () => {
    const dir = temp();
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    symlinkSync("missing-gitdir", path.join(dir, ".git"));
    const p = proposeGitignore(dir);
    expect(p.needed).toBe(true);
    expect(p.reason).toMatch(/^git check-ignore failed: cannot confirm/);
    expect(p.canAskGit).toBe(false);
  });

  it.skipIf(isRoot)("a root that cannot be traversed: '.gitignore cannot be examined (EACCES)' (before: 'no .gitignore')", () => {
    const dir = temp();
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    lock(dir);
    const p = proposeGitignore(dir);
    expect(p.needed).toBe(true);
    expect(p.reason).toMatch(/^\.gitignore cannot be examined \(EACCES\): cannot confirm/);
    expect(p.canAskGit).toBe(false);
  });

  it("the dry-run of init in a repository with a dangling .gitignore link does not say 'no .gitignore'; the exit code is 0", async () => {
    const dir = repo();
    symlinkSync("missing-target", path.join(dir, ".gitignore"));
    const r = await init(dir);
    expect(r.code).toBe(0);
    const line = r.out.find((l) => l.startsWith("  - .gitignore:")) ?? "";
    expect(line).toContain("--write-gitignore");
    expect(line).not.toMatch(/— no \.gitignore$/);
  });

  it("--write-gitignore through that dangling link still refuses (v0.5.29) and creates nothing", async () => {
    const dir = repo();
    symlinkSync("missing-target", path.join(dir, ".gitignore"));
    const r = await init(dir, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/symbolic link whose target does not exist/);
    expect(existsSync(path.join(dir, "missing-target"))).toBe(false);
  });
});

describe("backlog 8 O5 controls: proposeGitignore (pass before and after)", () => {
  it("no .gitignore: 'no .gitignore'", () => {
    const dir = repo();
    const p = proposeGitignore(dir);
    expect(p).toMatchObject({ needed: true, reason: "no .gitignore", canAskGit: false });
  });

  it("a .gitignore in a directory that is not a git repository: 'not a git repository'", () => {
    const dir = temp();
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const p = proposeGitignore(dir);
    expect(p).toMatchObject({ needed: true, canAskGit: false });
    expect(p.reason).toMatch(/^not a git repository: cannot ask git whether artifacts\/ is ignored$/);
  });

  it("a tracked .gitignore that ignores artifacts/: not needed", () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), "artifacts/\n");
    execFileSync("git", ["add", "--", ".gitignore"], { cwd: dir });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "gi"], { cwd: dir });
    expect(proposeGitignore(dir)).toMatchObject({ needed: false, canAskGit: true, gitignoreTracked: true });
  });

  it("an untracked .gitignore without the line: needed, and git was asked", () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const p = proposeGitignore(dir);
    expect(p).toMatchObject({ needed: true, canAskGit: true, gitignoreTracked: false });
  });
});

describe("backlog 8 O9: the new messages go through the output boundary", () => {
  it.skipIf(isRoot)("a secret-shaped name and an ESC in the root: the message is masked and the ESC is written as notation", async () => {
    const dir = temp();
    const esc = String.fromCodePoint(0x1b);
    const name = `child-${fake("AKIA", "ABCDEFGHIJKLMNOP")}-${esc}x`;
    mkdirSync(path.join(dir, "parent", name), { recursive: true });
    lock(path.join(dir, "parent"));
    const r = await init(path.join(dir, "parent", name));
    expect(r.code).toBe(2);
    const text = r.err.join("\n");
    expect(text).toMatch(/directory cannot be examined: /);
    expect(text).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    expect(text).not.toContain(esc);
  });
});
