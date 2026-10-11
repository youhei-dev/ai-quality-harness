import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import type { ExecutionResult } from "../types.ts";
import { isUtf8ContinuationByte } from "./utf8-trim.ts";
import { checkEnv } from "./env.ts";

export interface ExecuteOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  /** Per-stream cap on retained output. Older output is dropped first. Default 10 MiB. */
  maxOutputBytes?: number;
  /** Grace period between SIGTERM and SIGKILL on timeout / interruption. Default 5000 ms. */
  killGraceMs?: number;
  /** Longest wait for the process group to disappear after SIGKILL (and for `close` after the group is gone). Default 2000 ms. */
  confirmMs?: number;
  /** The environment of the caller, the base of the check's environment; checkEnv() is applied to it (default: process.env). */
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
/** Longest wait for a terminated group to disappear (backlog 16). With the kill grace period it is 1 s shorter than the CLI's safety valve (src/cli-signals.ts) by default: a relation of constants, not a guarantee (ADR-0023, decision 7). */
const DEFAULT_CONFIRM_MS = 2_000;
/** Interval of the group probes: a timer setting, not an upper bound (a probe runs later when the event loop is delayed; B28-R1-001). */
const CONFIRM_POLL_MS = 25;

export { DEFAULT_KILL_GRACE_MS, DEFAULT_CONFIRM_MS };

/**
 * The process group of one spawned command as this process has observed it (B16-R1-001). `gone` is set once, when a signal 0 or a
 * signal to the group fails with ESRCH, and never cleared: the same number may name an unrelated group later (the OS reuses ids),
 * so a group seen gone is never probed or signalled again. It is shared by the command's own clean-up and terminateActiveChildren().
 * On Windows (and without a pgid) nothing is observed, so `gone` stays false and the group-less paths behave as before.
 * `leaderGone` is the same rule for the leader's own pid: set once, when a direct signal to it fails with ESRCH, and never cleared;
 * the pid is not signalled directly again (v0.5.36). It is set on Windows too; without a pgid there is no pid to signal at all.
 */
interface GroupState {
  readonly pgid: number | undefined;
  gone: boolean;
  leaderGone: boolean;
}

/** Children currently running, with the process group saved at spawn time. */
const activeChildren = new Map<ChildProcess, GroupState>();

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
  for (const [child, group] of targets) killTree(child, group, "SIGTERM");
  // Probe every target, not only up to the first live one (S-1): a later group that disappears while an earlier one is still alive
  // must be seen gone during the grace period, so that it gets no SIGKILL.
  const anyAlive = (): boolean => targets.map(([, group]) => groupAlive(group)).includes(true);
  await waitUntil(() => !anyAlive(), graceMs);
  if (anyAlive()) {
    // killTree() skips a group that was seen gone (B16-R1-001)
    for (const [child, group] of targets) killTree(child, group, "SIGKILL");
    await waitUntil(() => !anyAlive(), 2_000);
  }
}

async function waitUntil(done: () => boolean, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!done() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * True while any member of the process group exists (signal 0 probe; EPERM counts as alive). The first ESRCH is recorded in `group`
 * and the group is never probed again (B16-R1-001); on Windows or without a pgid there is no group to probe: false, nothing recorded.
 */
function groupAlive(group: GroupState): boolean {
  if (group.gone) return false;
  if (process.platform === "win32" || group.pgid === undefined) return false;
  try {
    process.kill(-group.pgid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") return true;
    group.gone = true;
    return false;
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
  const confirmMs = options.confirmMs ?? DEFAULT_CONFIRM_MS;

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
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    /** Probes the group (signal 0) after the leader exited while `close` is pending (backlog 28), until the group is seen gone. */
    let exitWatchTimer: NodeJS.Timeout | null = null;
    /** When SIGKILL was sent (null before): the bounded wait for the group to disappear counts from here. */
    let sigkillSentAt: number | null = null;
    /**
     * When the escalation's poll first saw the group gone while `close` was still pending (a descendant outside the group may hold the
     * pipes). The probes after the leader's exit (backlog 28) record only `gone`, not this time: the wait after the escalation is unchanged.
     */
    let goneAt: number | null = null;
    /** errno code of the first signal that could be delivered neither to the group nor to the child (e.g. "EPERM"). */
    let killError: string | null = null;
    let closeResult: Pick<ExecutionResult, "exitCode" | "signal"> | null = null;

    let child: ChildProcess;
    try {
      child = spawn(options.command, {
        cwd: options.cwd,
        shell: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: checkEnv(options.env ?? process.env),
      });
    } catch (err) {
      resolve(notStarted(`spawn failed: ${(err as Error).message}`, null, startedAt));
      return;
    }
    // With `detached`, the child is the leader of a new process group whose id equals its pid.
    // Save it now: the leader may exit before its descendants, and the group outlives it (R-004).
    const pgid = child.pid;
    const group: GroupState = { pgid, gone: false, leaderGone: false };
    activeChildren.set(child, group);

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

    const send = (signal: NodeJS.Signals): void => {
      const failure = killTree(child, group, signal);
      if (failure !== null && killError === null) killError = failure;
    };

    /**
     * Settle a terminated command (backlog 16). Done when `close` has fired AND the group is gone. Bounded: after SIGKILL (or, when
     * `close` is pending although the group is gone, after this poll first saw the group gone) at most `confirmMs` more is waited; then the
     * result is settled anyway, marked as unconfirmed while the group is still present. Without this bound a descendant outside the
     * group that keeps the pipes open (or a group that cannot be signalled) would keep the run waiting indefinitely.
     */
    const poll = (): void => {
      pollTimer = null;
      if (settled) return;
      const gone = !groupAlive(group);
      const now = Date.now();
      if (gone && goneAt === null) goneAt = now;
      if (gone && closeResult !== null) {
        finish({ ...closeResult, timedOut, spawnError: null });
        return;
      }
      const anchor = sigkillSentAt ?? goneAt;
      if (anchor !== null && now - anchor >= confirmMs) {
        // Stop waiting for `close`: release the pipes and the handle so that nothing keeps this process (or the event loop) waiting.
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
        finish(
          { exitCode: closeResult?.exitCode ?? child.exitCode, signal: closeResult?.signal ?? child.signalCode, timedOut, spawnError: null },
          gone ? undefined : { waitedMs: confirmMs, killError },
        );
        return;
      }
      pollTimer = setTimeout(poll, CONFIRM_POLL_MS);
    };

    // Clean-up lifecycle (R2-002, backlog 16): SIGTERM → grace → SIGKILL → group gone, confirmed within `confirmMs`. The timers are
    // deliberately not unref'd so the escalation cannot be skipped by an empty event loop.
    const escalate = (): void => {
      if (killTimer !== null) return;
      send("SIGTERM");
      pollTimer = setTimeout(poll, CONFIRM_POLL_MS);
      killTimer = setTimeout(() => {
        // A group seen gone is never signalled again: its id may name an unrelated group now (B16-R1-001). The wait for `close` then
        // keeps counting from `goneAt`.
        if (group.gone) return;
        send("SIGKILL");
        sigkillSentAt = Date.now();
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
      // R4-002: timedOut of an interrupted command means "the timeout was reached before the
      // interruption". A timeout that would expire during the clean-up after it is not recorded.
      clearTimeout(timeoutTimer);
      escalate();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    // The signal may have aborted between the pre-spawn check and the listener registration.
    if (options.signal?.aborted) onAbort();

    // Backlog 28: once the leader has exited, the group can disappear while `close` is still pending (a descendant outside the group
    // holds the pipes), and its id can then be reused before the first signal. Keep probing until the group is seen gone, so that the
    // first SIGTERM is not sent to a reused id; a probe cannot tell a reused id from our group, so this narrows the window to the time
    // from the disappearance until the next probe actually runs, it does not close it: CONFIRM_POLL_MS is a timer setting, not an upper
    // bound, and event-loop or scheduling delays add to it (B28-R1-001). Only signal 0 is sent, through groupAlive(): it stops at the first
    // ESRCH (`gone`, B16-R1-001), and nothing is probed on Windows or without a pgid. The probing ends at `close` (finish clears the
    // timer) or when the escalation starts (its own poll takes over).
    const watchAfterExit = (): void => {
      exitWatchTimer = null;
      if (settled || killTimer !== null) return;
      if (!groupAlive(group)) return;
      exitWatchTimer = setTimeout(watchAfterExit, CONFIRM_POLL_MS);
    };
    child.on("exit", () => {
      if (!settled && closeResult === null) watchAfterExit();
    });

    const finish = (
      result: Omit<
        ExecutionResult,
        "stdout" | "stderr" | "stdoutTruncated" | "stderrTruncated" | "startedAt" | "durationMs" | "interruptedBy" | "terminationUnconfirmed"
      >,
      unconfirmed?: ExecutionResult["terminationUnconfirmed"],
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (pollTimer) clearTimeout(pollTimer);
      if (exitWatchTimer) clearTimeout(exitWatchTimer);
      options.signal?.removeEventListener("abort", onAbort);
      activeChildren.delete(child);
      resolve({
        ...result,
        ...(unconfirmed === undefined ? {} : { terminationUnconfirmed: unconfirmed }),
        interruptedBy,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      });
    };

    // A failure to start is the only 'error' event expected before a pid exists. Signals are sent with process.kill (killTree),
    // never child.kill, so a failed signal (EPERM) is not reported here; any other late error is remembered, not mistaken for a spawn failure.
    child.on("error", (err) => {
      if (child.pid !== undefined) {
        killError ??= errnoName((err as NodeJS.ErrnoException).code);
        return;
      }
      finish({
        exitCode: null,
        signal: null,
        timedOut,
        spawnError: `spawn failed: ${err.message}`,
      });
    });

    // "close" fires after stdio streams have ended, so all output has been captured. After a
    // timeout / interruption it may fire before the descendants are dead (they can close their
    // stdio), so the run settles only when the group is gone, or at the bound of the poll above.
    child.on("close", (code, signal) => {
      closeResult = { exitCode: code, signal };
      if (timedOut || interruptedBy !== null) {
        if (pollTimer !== null) clearTimeout(pollTimer);
        poll();
        return;
      }
      finish({ ...closeResult, timedOut, spawnError: null });
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

/**
 * Why `dir` cannot be the working directory of a check, or null when it can. Only ENOENT is "does not exist": any other
 * failure of stat (EACCES, ENOTDIR, ELOOP, …) is a directory that cannot be examined. The config load already refuses
 * such paths (ADR-0022); this is the case where the path changed after the load (backlog 8, O4).
 */
function checkDirectory(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) {
      return `working directory is not a directory: ${dir}`;
    }
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? `working directory does not exist: ${dir}` : `working directory cannot be examined: ${dir} (${code ?? "unknown error"})`;
  }
}

/**
 * Signal the child's whole process group (POSIX), then fall back to the child alone.
 * The group signal is attempted regardless of the leader's state: after SIGTERM the shell
 * (group leader) may already be gone while TERM-ignoring descendants keep the group alive,
 * and the SIGKILL escalation must still reach them (R-004).
 * With a group path the child alone is signalled only when the group send failed with something other than ESRCH. A group seen
 * gone gets nothing, and neither does its leader: the pid may name an unrelated process by now (B16-R2-001).
 * Returns null when the signal was delivered or nothing is left to signal (ESRCH); otherwise the errno code of the failure (e.g.
 * "EPERM"): the caller must not assume the process stops (backlog 2). When the group send failed and the child turns out to be gone,
 * the group's errno is returned: the group itself is still there and could not be signalled (B16-R3-001). A child that answered
 * ESRCH once is not signalled directly again (`leaderGone`, v0.5.36). The child is signalled with process.kill, not child.kill,
 * because child.kill reports a failure as an 'error' event, which executeCommand would mistake for a spawn failure.
 */
function killTree(child: ChildProcess, group: GroupState, signal: NodeJS.Signals): string | null {
  let failure: string | null = null;
  if (process.platform !== "win32" && group.pgid !== undefined) {
    // A group seen gone (by a probe or by an earlier signal) is not signalled again: the id may name an unrelated group now (B16-R1-001).
    // Returning here, not falling through, keeps the direct signal below from reaching a leader of that group (B16-R2-001).
    if (group.gone) return null;
    try {
      process.kill(-group.pgid, signal);
      return null;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        group.gone = true; // no process left in the group
        return null;
      }
      failure = errnoName(code);
      // EPERM or similar: fall through to a direct signal to the child.
    }
  }
  // A leader pid seen gone is not signalled directly again: the number may name an unrelated process now (v0.5.36).
  if (group.leaderGone || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return failure;
  }
  try {
    process.kill(child.pid, signal);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") return errnoName(code);
    // The child is gone: remember it, and keep the group's errno, if any (B16-R3-001). Without a group path `failure` is null, as before.
    group.leaderGone = true;
    return failure;
  }
}

/** An errno name for a message: only a short upper-case identifier, never an arbitrary string. */
function errnoName(code: unknown): string {
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,15}$/.test(code) ? code : "UNKNOWN";
}

/** Byte-capped buffer that keeps the *tail* of the output. Exported for unit tests with fixed chunk boundaries. */
export class OutputBuffer {
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
    if (this.size > this.maxBytes) {
      this.truncated = true;
      this.dropFront(this.size - this.maxBytes);
    }
    // R5-004 / R7-001: once the start of the stream has been discarded, the buffer must begin on
    // a UTF-8 code-point boundary. Re-check the *current* first byte after every single-byte drop:
    // a code point may be split across chunks, so dropping the continuation bytes left in the first
    // chunk can expose another continuation byte at the start of the next chunk (the R6 version
    // looked at the first chunk only once). The check also runs when this push did not trim
    // anything: after an earlier trim emptied the buffer, a chunk holding only continuation bytes
    // of the split character can arrive within the cap and must not survive.
    if (!this.truncated) return;
    for (let i = 0; i < 3; i++) {
      const first = this.chunks[0]?.[0];
      if (first === undefined || !isUtf8ContinuationByte(first)) break;
      this.dropFront(1);
    }
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
