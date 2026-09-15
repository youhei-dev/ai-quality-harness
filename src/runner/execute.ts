import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import type { ExecutionResult } from "../types.ts";

export interface ExecuteOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  /** Per-stream cap on retained output. Older output is dropped first. Default 10 MiB. */
  maxOutputBytes?: number;
  /** Grace period between SIGTERM and SIGKILL on timeout. Default 5000 ms. */
  killGraceMs?: number;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 5_000;

/** Children currently running. Used by the CLI to clean up on SIGINT / SIGTERM. */
const activeChildren = new Set<ChildProcess>();

/** Kill every running child (and its process group). Safe to call repeatedly. */
export function killActiveChildren(signal: NodeJS.Signals = "SIGTERM"): void {
  for (const child of activeChildren) {
    killTree(child, signal);
  }
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

  const cwdProblem = checkDirectory(options.cwd);
  if (cwdProblem !== null) {
    return Promise.resolve(
      failedToStart(cwdProblem, startedAt),
    );
  }

  return new Promise<ExecutionResult>((resolve) => {
    const stdout = new OutputBuffer(maxBytes);
    const stderr = new OutputBuffer(maxBytes);
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;

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
      resolve(failedToStart(`spawn failed: ${(err as Error).message}`, startedAt));
      return;
    }
    activeChildren.add(child);

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killTree(child, "SIGTERM");
      killTimer = setTimeout(() => killTree(child, "SIGKILL"), killGraceMs);
      killTimer.unref();
    }, options.timeoutMs);
    timeoutTimer.unref();

    const finish = (result: Omit<ExecutionResult, "stdout" | "stderr" | "stdoutTruncated" | "stderrTruncated" | "startedAt" | "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      activeChildren.delete(child);
      resolve({
        ...result,
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

    // "close" fires after stdio streams have ended, so all output has been captured.
    child.on("close", (code, signal) => {
      finish({
        exitCode: code,
        signal,
        timedOut,
        spawnError: null,
      });
    });
  });
}

function failedToStart(reason: string, startedAt: Date): ExecutionResult {
  return {
    exitCode: null,
    signal: null,
    timedOut: false,
    spawnError: reason,
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

/** Kill the child's whole process group (POSIX). Falls back to killing the child alone. */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Process group already gone or not owned; fall through to direct kill.
    }
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
    while (this.size > this.maxBytes && this.chunks.length > 0) {
      const dropped = this.chunks.shift();
      if (dropped) {
        this.size -= dropped.length;
        this.truncated = true;
      }
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}
