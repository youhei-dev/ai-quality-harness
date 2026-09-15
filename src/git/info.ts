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

/** Collect commit / branch / dirty state. Returns null when `cwd` is not inside a git work tree. */
export function getGitInfo(cwd: string): GitInfo | null {
  const inside = git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside !== "true") {
    return null;
  }
  const commit = git(["rev-parse", "HEAD"], cwd);
  // symbolic-ref works before the first commit; abbrev-ref covers detached HEAD.
  const branch =
    git(["symbolic-ref", "--short", "HEAD"], cwd) ?? git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const status = git(["status", "--porcelain"], cwd);
  return {
    commit,
    branch,
    // A failed `git status` is "unknown", never "clean" (R-009).
    dirty: status === null ? null : status.length > 0,
  };
}
