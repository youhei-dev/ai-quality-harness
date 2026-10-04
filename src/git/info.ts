import { execFileSync } from "node:child_process";
import type { GitInfo } from "../types.ts";

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
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
}

/** Collect commit / branch / dirty state, and say why there is none when git failed instead of answering "no". */
export function lookupGit(cwd: string): GitLookup {
  const inside = askInside(cwd);
  if (inside.answer !== "true") {
    return { info: null, problem: inside.problem };
  }
  const commit = git(["rev-parse", "HEAD"], cwd);
  // symbolic-ref works before the first commit; abbrev-ref covers detached HEAD.
  const branch =
    git(["symbolic-ref", "--short", "HEAD"], cwd) ?? git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const status = git(["status", "--porcelain"], cwd);
  return {
    info: {
      commit,
      branch,
      // A failed `git status` is "unknown", never "clean" (R-009).
      dirty: status === null ? null : status.length > 0,
    },
    problem: null,
  };
}

/** Collect commit / branch / dirty state. Returns null when `cwd` is not inside a git work tree (or git failed: see lookupGit). */
export function getGitInfo(cwd: string): GitInfo | null {
  return lookupGit(cwd).info;
}
