import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkValue, type Checked } from "../src/review/checked.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult } from "../src/types.ts";

export function makeTempDir(prefix = "aiqh-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function checkResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "check",
    kind: "custom",
    command: "true",
    cwd: ".",
    required: true,
    timeoutSec: 10,
    description: null,
    status: "PASS",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1,
    errorSummary: null,
    stdoutTail: "",
    stderrTail: "",
    outputTruncated: false,
    ...overrides,
  };
}

/** Quote a JS snippet for `node -e` inside a shell command (POSIX single quotes). */
export function nodeEval(js: string): string {
  return `node -e '${js.replace(/'/g, `'\\''`)}'`;
}

/**
 * Throw unless `pid` is a positive safe integer (M2-1). `process.kill(0, …)` targets the caller's
 * own process group and a negative pid a whole group, so an empty or half-written pid file
 * (`Number("") === 0`) must never reach `process.kill`.
 */
export function assertSignalablePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`refusing to signal pid ${String(pid)}: not a positive safe integer`);
  }
}

/** The pid in `text`, or null unless it is a positive safe integer (an empty or half-written file gives null). */
export function parsePid(text: string): number | null {
  if (!/^[0-9]+$/.test(text)) return null;
  const pid = Number(text);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Wait until `file` holds a valid pid and return it (M2-1). Waiting for the file to *exist* is not
 * enough: `writeFileSync` creates the file before it writes, so a reader in between sees "".
 * Throws with the last content seen when no valid pid appears within `ms`.
 */
export async function waitForPid(file: string, ms: number): Promise<number> {
  const deadline = Date.now() + ms;
  for (;;) {
    const last = existsSync(file) ? readFileSync(file, "utf8") : null;
    const pid = last === null ? null : parsePid(last);
    if (pid !== null) return pid;
    if (Date.now() >= deadline) {
      throw new Error(`no valid pid in ${file} within ${ms}ms (last content: ${last === null ? "file missing" : JSON.stringify(last)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Assemble a synthetic secret-shaped value at runtime. Keeping prefix and body apart means
 * no literal in the repository matches a credential pattern (pre-push guard, secret scanners),
 * while the value under test is identical to a real-looking token.
 */
export function fake(prefix: string, body: string): string {
  return prefix + body;
}

/** A Checked value for tests (M2-1 R2); throws unless `value` passes the pre-render check. */
export function checked(value: string): Checked {
  const r = checkValue(value, DEFAULT_SECURITY);
  if (!r.ok) throw new Error(`test value does not pass the pre-render check: ${JSON.stringify(r.findings)}`);
  return r.value;
}

/**
 * Extra time for something the clean-up stopped to end, beyond its own grace period (M2-2-R5-001). After an abort the
 * runner sends SIGKILL within its grace period; then only the leader's `close` is left. 5 s is longer than the product's
 * own waits after SIGKILL (terminateActiveChildren 2 s, the CLI's safety valve 3 s), and the largest bound
 * (20 s grace + 5 s) stays within hookTimeout (30 s, vitest.config.ts).
 */
export const SETTLE_MARGIN_MS = 5_000;

/**
 * Run a test file's clean-ups newest first, awaiting each, so a run is stopped before its directory is removed
 * (M2-2-R5-001). Every clean-up runs even if another throws; the first error is thrown afterwards.
 */
export async function runCleanups(cleanups: Array<() => void | Promise<void>>): Promise<void> {
  const errors: unknown[] = [];
  while (cleanups.length > 0) {
    try {
      await cleanups.pop()?.();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) throw errors[0];
}

/**
 * A clean-up for something a test started and may not have seen end (M2-2-R5-001): unless `done` has settled, call
 * `stop` and wait for `done` at most `ms`; past that, call `onLate` and fail (the clean-up never passes silently).
 * vitest stops the worker when a test file ends, so a pending run's own timers never fire after a failed test, and a
 * `finally` in the test does not run on a test timeout; afterEach does. `stop` acts through the runner's
 * AbortController or the ChildProcess handle, never through a pid read from a file (it may be reused once the
 * process is gone).
 */
export function stopper(done: Promise<unknown>, stop: () => void, ms: number, what: string, onLate?: () => void): () => Promise<void> {
  let settled = false;
  const ended = done.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return async () => {
    if (settled) return;
    stop();
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), ms);
    });
    const outcome = await Promise.race([ended.then(() => "ended" as const), late]);
    clearTimeout(timer);
    if (outcome === "late") {
      onLate?.();
      throw new Error(`clean-up: ${what} did not end within ${ms} ms after it was stopped`);
    }
  };
}

/**
 * JS for a child process that a test starts (backlog 19 a): leave when `file` (its own pid file) disappears. The test's temp directory
 * is removed in afterEach, so a child the product failed to stop leaves within 200 ms of the test's end instead of living out its timer.
 */
export function exitWhenRemoved(file: string): string {
  return `setInterval(() => { if (!require("fs").existsSync(${JSON.stringify(file)})) process.exit(0); }, 200);`;
}

/**
 * waitForPid, failing as a precondition ("precondition: <what>: …", never a skip) when the process never became ready
 * (v0.5.6; shared since M2-2-R5-001).
 */
export async function waitReady(file: string, ms: number, what: string): Promise<number> {
  try {
    return await waitForPid(file, ms);
  } catch (err) {
    throw new Error(`precondition: ${what}: ${(err as Error).message}`, { cause: err });
  }
}
