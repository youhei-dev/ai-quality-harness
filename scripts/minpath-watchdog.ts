/**
 * The watchdog of scripts/test-minimal-path.ts (backlog 5, v0.5.38). The script starts it as the leader of a new process group (detached),
 * with a pipe on its stdin. It starts `node <entry> <args…>` (vitest) in the same group and exits with that child's exit code: 128 + n when
 * the child was ended by a signal n, 2 when the child cannot be started.
 *
 * When the pipe closes — the script stopped the run (SIGINT, SIGTERM, its time limit), or it ended in any other way, also by a SIGKILL to
 * its own group from the runner, which does not reach this group — the watchdog removes the script's temporary PATH directory (the script's
 * `finally` does not run after a SIGKILL; N3), then sends SIGKILL to its own group with process.kill(0): vitest, its workers and every
 * descendant that stayed in the group. The watchdog is a member of that group at that moment, so the id cannot name another group. A
 * process that a test started in a group of its own (detached) is not reached.
 *
 * It refuses to start (exit 2, nothing started) unless it leads its own process group: process.kill(0) in the caller's group would reach
 * the caller. Usage: node scripts/minpath-watchdog.ts <temp dir> <entry> [args…]. Only an absolute directory named aiqh-minpath-* is removed.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const [tempDir, entry, ...args] = process.argv.slice(2);
if (tempDir === undefined || entry === undefined) {
  console.error("minpath-watchdog: usage: minpath-watchdog.ts <temp dir> <entry> [args...]");
  process.exit(2);
}

/** A group with this process's pid exists only if this process created it (detached): then it leads its own group. */
function leadsOwnGroup(): boolean {
  try {
    process.kill(-process.pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!leadsOwnGroup()) {
  console.error("minpath-watchdog: refusing to run: not the leader of a process group of its own (start it detached)");
  process.exit(2);
}

const child = spawn(process.execPath, [entry, ...args], { stdio: ["ignore", "inherit", "inherit"] });
child.on("error", (err) => {
  console.error(`minpath-watchdog: ${entry} could not be started: ${err.message}`);
  process.exit(2);
});
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal === null ? 2 : 128 + os.constants.signals[signal]));
});

process.stdin.on("end", () => {
  if (path.isAbsolute(tempDir) && path.basename(tempDir).startsWith("aiqh-minpath-")) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`minpath-watchdog: could not remove ${tempDir}: ${(err as Error).message}`);
    }
  }
  process.kill(0, "SIGKILL");
});
process.stdin.resume();
