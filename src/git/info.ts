import { execFileSync } from "node:child_process";
import type { GitInfo } from "../types.ts";

function git(args: string[], cwd: string): string | null {
  const r = ask(args, cwd);
  return "out" in r ? r.out : null;
}

/**
 * Run git and keep its answer apart from its failure (backlog 25): the trimmed output when it exits 0, `{ no: true }` when it exits 1
 * (for `rev-parse --verify --quiet` and `symbolic-ref -q` that is git's own "no": no commit, a detached HEAD), `{ failed: true }` for
 * anything else (another status, a git that cannot run, a timeout).
 */
function ask(args: string[], cwd: string): { out: string } | { no: true } | { failed: true } {
  try {
    return {
      out: execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
      }).trim(),
    };
  } catch (err) {
    return (err as { status?: number | null }).status === 1 ? { no: true } : { failed: true };
  }
}

/**
 * Ask git whether `cwd` is inside a work tree. `answer` is git's output when it ran and succeeded; `problem` is set when git
 * did not answer at all (it could not be run, timed out, or exited with something other than its own "not a git
 * repository"), which is not the same as "not a work tree" (backlog 8, O3; ADR-0022). LC_ALL=C makes the message stable.
 */
function askInside(cwd: string): { answer: string | null; problem: string | null } {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      env: { ...process.env, LC_ALL: "C" },
    });
    return { answer: out.trim(), problem: null };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number | null; stderr?: string };
    if (e.code === "ETIMEDOUT") return { answer: null, problem: "git timed out after 10 s" };
    if (typeof e.status !== "number") return { answer: null, problem: `git could not be run (${e.code ?? "unknown error"})` };
    const first = String(e.stderr ?? "").split("\n")[0] ?? "";
    if (e.status === 128 && first.startsWith("fatal: not a git repository")) return { answer: null, problem: null };
    return { answer: null, problem: `git exited ${e.status}${first.length > 0 ? `: ${first}` : ""}` };
  }
}

export interface GitLookup {
  /** null when `cwd` is not inside a git work tree, or when git could not tell (then `problem` says why). */
  info: GitInfo | null;
  problem: string | null;
  /**
   * Present only when a field of `info` is null because git failed rather than answered (backlog 25): verify shows it as "unknown". It is
   * not part of `info`, so the report's `git` keeps its shape and values (null for both, as for O3; ADR-0022 decision 8).
   */
  unknown?: { commit: boolean; branch: boolean };
}

/** Collect commit / branch / dirty state, and say why there is none when git failed instead of answering "no". */
export function lookupGit(cwd: string): GitLookup {
  const inside = askInside(cwd);
  if (inside.answer !== "true") {
    return { info: null, problem: inside.problem };
  }
  // `--verify --quiet` exits 1, silently, when there is no commit yet: git's answer. Any other failure is "unknown" (backlog 25).
  const head = ask(["rev-parse", "--verify", "--quiet", "HEAD"], cwd);
  const commit = "out" in head ? head.out : null;
  // symbolic-ref works before the first commit and exits 1 on a detached HEAD; abbrev-ref then gives "HEAD", as before.
  const symbolic = ask(["symbolic-ref", "-q", "--short", "HEAD"], cwd);
  const branch = "out" in symbolic ? symbolic.out : git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const status = git(["status", "--porcelain"], cwd);
  const unknown = { commit: "failed" in head, branch: branch === null && "failed" in symbolic };
  return {
    info: {
      commit,
      branch,
      // A failed `git status` is "unknown", never "clean" (R-009).
      dirty: status === null ? null : status.length > 0,
    },
    problem: null,
    ...(unknown.commit || unknown.branch ? { unknown } : {}),
  };
}

/** Collect commit / branch / dirty state. Returns null when `cwd` is not inside a git work tree (or git failed: see lookupGit). */
export function getGitInfo(cwd: string): GitInfo | null {
  return lookupGit(cwd).info;
}
