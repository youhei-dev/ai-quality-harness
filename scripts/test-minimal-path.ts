/**
 * The whole test suite with only node and git on PATH (M2-2, M2-1-R3-006; self verify check `unit-minpath`).
 * Tests start no external command other than git and node unless its availability is part of the skip
 * condition (M2-1-R2-004): here unzip / python3 tests skip, and a test that starts any other command — in any
 * form, including from inside a `node -e` script that the static guard cannot see — fails.
 *
 * The runner shell (/bin/sh, started by absolute path) and its builtins (true, echo) stay usable; `node` for
 * the runner's `node -e` commands (tests/helpers.ts nodeEval) is the node on PATH, here this process's node.
 * The symlinks live in a temporary directory under the OS temp directory, removed in `finally`. A command started by its absolute
 * path is outside what this check guarantees (backlog 6, decided in v0.5.37), and vitest gets no variable of this process's environment.
 * vitest runs under a watchdog (scripts/minpath-watchdog.ts, backlog 5, v0.5.38) in a process group of its own: when this script stops
 * the run or ends in any way (also by a SIGKILL to its group), the watchdog removes the temporary directory and stops that whole group.
 * Exit code: vitest's (128 + n when vitest was ended by a signal n), 2 if git is not found or vitest or its watchdog cannot be started,
 * 128 + n after SIGINT / SIGTERM.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
const WATCHDOG = path.join(import.meta.dirname, "minpath-watchdog.ts");
/** Below the check's timeoutSec (600) in aiqh.config.jsonc, so this script reports rather than being killed. */
const TIMEOUT_MS = 540_000;

/** Absolute path of `cmd` on the current PATH, or null (no shell, no `which`). */
function which(cmd: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir.length === 0) continue;
    const p = path.join(dir, cmd);
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // not here
    }
  }
  return null;
}

function runVitest(bin: string): Promise<number> {
  return new Promise((resolve) => {
    // A minimal environment (backlog 6): nothing of this process's environment is passed on, only PATH = { node, git } and no colors.
    // Measured (v0.5.37, macOS): the suite needs no other variable (not HOME, TMPDIR or LANG; os.tmpdir() falls back to /tmp).
    // Backlog 5: the watchdog leads a new process group (detached) and starts vitest in it; closing its stdin stops that group.
    const child = spawn(process.execPath, [WATCHDOG, bin, VITEST, "run"], { cwd: ROOT, env: { PATH: bin, NO_COLOR: "1", FORCE_COLOR: "0" }, stdio: ["pipe", "inherit", "inherit"], detached: true });
    child.stdin?.on("error", () => {
      // EPIPE: the watchdog has ended already, so nothing is left to stop.
    });
    let result: number | null = null;
    const stop = (code: number): void => {
      result ??= code;
      child.stdin?.end();
    };
    const onSigint = (): void => stop(130);
    const onSigterm = (): void => stop(143);
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    const timer = setTimeout(() => {
      console.error(`test-minimal-path: vitest did not finish within ${TIMEOUT_MS}ms; killed`);
      stop(2);
    }, TIMEOUT_MS);
    const done = (code: number): void => {
      clearTimeout(timer);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      resolve(result ?? code);
    };
    child.on("error", (err) => {
      console.error(`test-minimal-path: the watchdog of vitest could not be started: ${err.message}`);
      done(2);
    });
    child.on("close", (code) => done(code ?? 2));
  });
}

async function main(): Promise<number> {
  const git = which("git");
  if (git === null) {
    console.error("test-minimal-path: git was not found on PATH");
    return 2;
  }
  const bin = mkdtempSync(path.join(os.tmpdir(), "aiqh-minpath-"));
  try {
    symlinkSync(process.execPath, path.join(bin, "node"));
    symlinkSync(git, path.join(bin, "git"));
    console.log("test-minimal-path: vitest with PATH = { node, git } only");
    return await runVitest(bin);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

process.exitCode = await main();
