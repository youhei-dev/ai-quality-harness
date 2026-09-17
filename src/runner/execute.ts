import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import type { ExecutionResult } from "../types.ts";
import { utf8LeadingBytesToDrop } from "./utf8-trim.ts";

export interface ExecuteOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  /** Per-stream cap on retained output. Older output is dropped first. Default 10 MiB. */
  maxOutputBytes?: number;
  /** Grace period between SIGTERM and SIGKILL on timeout / interruption. Default 5000 ms. */
  killGraceMs?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Interruption signal (R3-002). When it is already aborted the command is not started; when it
   * aborts while the command runs, the process group is terminated like on a timeout.
   * `signal.reason` (e.g. "SIGINT") is recorded in the result.
   */
  signal?: AbortSignal;
}

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 5_000;

export { DEFAULT_KILL_GRACE_MS };

/** Children currently running, with the process-group id saved at spawn time. */
const activeChildren = new Map<ChildProcess, number | undefined>();

/**
 * Clean-up path shared by timeouts and the CLI signal handlers (R2-002):
 * SIGTERM to every active process group → wait up to `graceMs` for the groups to disappear →
 * SIGKILL whatever is left → wait (bounded) until no group member remains.
 * Note (R3-002): this acts on the children active at call time; preventing *new* children is the
 * job of the AbortSignal passed to executeCommand / runChecks.
 */
export async function terminateActiveChildren(graceMs: number = DEFAULT_KILL_GRACE_MS): Promise<void> {
  const targets = [...activeChildren.entries()];
  if (targets.length === 0) return;
  for (const [child, pgid] of targets) killTree(child, pgid, "SIGTERM");
  const anyAlive = (): boolean => targets.some(([, pgid]) => groupAlive(pgid));
  await waitUntil(() => !anyAlive(), graceMs);
  if (anyAlive()) {
    for (const [child, pgid] of targets) killTree(child, pgid, "SIGKILL");
    await waitUntil(() => !anyAlive(), 2_000);
  }
}

async function waitUntil(done: () => boolean, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!done() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** True while any member of the process group exists (signal 0 probe; EPERM counts as alive). */
function groupAlive(pgid: number | undefined): boolean {
  if (process.platform === "win32" || pgid === undefined) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function abortReason(signal: AbortSignal | undefined): string {
  const reason: unknown = signal?.reason;
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  return "aborted";
}

/**
 * Run one command through the platform shell, inside its own process group,
 * capturing stdout / stderr with a size cap and enforcing a timeout.
 * Never throws: every failure mode is expressed in the returned result.
 */
export function executeCommand(options: ExecuteOptions): Promise<ExecutionResult> {
  const startedAt = new Date();
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;

  // R3-002: never start a new process once the run has been interrupted.
  if (options.signal?.aborted) {
    return Promise.resolve(notStarted(null, abortReason(options.signal), startedAt));
  }

  const cwdProblem = checkDirectory(options.cwd);
  if (cwdProblem !== null) {
    return Promise.resolve(notStarted(cwdProblem, null, startedAt));
  }

  return new Promise<ExecutionResult>((resolve) => {
    const stdout = new OutputBuffer(maxBytes);
    const stderr = new OutputBuffer(maxBytes);
    let timedOut = false;
    let interruptedBy: string | null = null;
    let sigkillSent = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;
    let closeResult: Pick<ExecutionResult, "exitCode" | "signal"> | null = null;

    let child: ChildProcess;
    try {
      child = spawn(options.command, {
        cwd: options.cwd,
        shell: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: options.env ?? process.env,
      });
    } catch (err) {
      resolve(notStarted(`spawn failed: ${(err as Error).message}`, null, startedAt));
      return;
    }
    // With `detached`, the child is the leader of a new process group whose id equals its pid.
    // Save it now: the leader may exit before its descendants, and the group outlives it (R-004).
    const pgid = child.pid;
    activeChildren.set(child, pgid);

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

    /** Settle once the process closed AND (not terminated by us | SIGKILL sent | group gone). */
    const tryFinish = (): void => {
      if (closeResult === null) return;
      if ((timedOut || interruptedBy !== null) && !sigkillSent && groupAlive(pgid)) return;
      finish({ ...closeResult, timedOut, spawnError: null });
    };

    // Clean-up lifecycle (R2-002): SIGTERM → grace → SIGKILL → group gone. The promise does not
    // settle on the leader's `close` alone while the group is still alive, and the timers are
    // deliberately not unref()'d so the escalation cannot be skipped by an empty event loop.
    const escalate = (): void => {
      if (killTimer !== null) return;
      killTree(child, pgid, "SIGTERM");
      killTimer = setTimeout(() => {
        killTree(child, pgid, "SIGKILL");
        sigkillSent = true;
        tryFinish();
      }, killGraceMs);
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      escalate();
    }, options.timeoutMs);

    // R3-002: interruption while running uses the same escalation as a timeout.
    const onAbort = (): void => {
      if (interruptedBy !== null) return;
      interruptedBy = abortReason(options.signal);
      escalate();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    // The signal may have aborted between the pre-spawn check and the listener registration.
    if (options.signal?.aborted) onAbort();

    const finish = (
      result: Omit<
        ExecutionResult,
        "stdout" | "stderr" | "stdoutTruncated" | "stderrTruncated" | "startedAt" | "durationMs" | "interruptedBy"
      >,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", onAbort);
      activeChildren.delete(child);
      resolve({
        ...result,
        interruptedBy,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      });
    };

    child.on("error", (err) => {
      finish({
        exitCode: null,
        signal: null,
        timedOut,
        spawnError: `spawn failed: ${err.message}`,
      });
    });

    // "close" fires after stdio streams have ended, so all output has been captured. After a
    // timeout / interruption it may fire before the descendants are dead (they can close their
    // stdio), so the escalation timer keeps running until the group is confirmed gone or SIGKILL
    // was sent.
    child.on("close", (code, signal) => {
      closeResult = { exitCode: code, signal };
      tryFinish();
    });
  });
}

/** Result for a command that never started: a spawn / cwd problem, or an interrupted run. */
function notStarted(spawnError: string | null, interruptedBy: string | null, startedAt: Date): ExecutionResult {
  return {
    exitCode: null,
    signal: null,
    timedOut: false,
    interruptedBy,
    spawnError,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  };
}

function checkDirectory(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) {
      return `working directory is not a directory: ${dir}`;
    }
    return null;
  } catch {
    return `working directory does not exist: ${dir}`;
  }
}

/**
 * Kill the child's whole process group (POSIX), then fall back to the child alone.
 * The group kill is attempted regardless of the leader's state: after SIGTERM the shell
 * (group leader) may already be gone while TERM-ignoring descendants keep the group alive,
 * and the SIGKILL escalation must still reach them (R-004).
 */
function killTree(child: ChildProcess, pgid: number | undefined, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && pgid !== undefined) {
    try {
      process.kill(-pgid, signal);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") {
        return; // no process left in the group
      }
      // EPERM or similar: fall through to a direct kill of the child.
    }
  }
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    child.kill(signal);
  } catch {
    // Already exited.
  }
}

/** Byte-capped buffer that keeps the *tail* of the output. */
class OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    // Trim from the front byte-wise so at most the last `maxBytes` bytes survive. Dropping whole
    // chunks would lose the entire output when a single chunk is larger than the cap.
    if (this.size <= this.maxBytes) return;
    this.truncated = true;
    this.dropFront(this.size - this.maxBytes);
    // R5-004 / R6-001: land on a UTF-8 code-point boundary (shared helper). Only the first chunk's
    // leading bytes matter; a chunk boundary inside a character is handled because dropFront
    // crosses chunks.
    const head = this.chunks[0];
    if (head !== undefined) this.dropFront(utf8LeadingBytesToDrop(head));
  }

  private dropFront(bytes: number): void {
    let remaining = bytes;
    while (remaining > 0 && this.chunks.length > 0) {
      const head = this.chunks[0];
      if (head === undefined) break;
      if (head.length <= remaining) {
        this.chunks.shift();
        this.size -= head.length;
        remaining -= head.length;
      } else {
        this.chunks[0] = head.subarray(remaining);
        this.size -= remaining;
        remaining = 0;
      }
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}
