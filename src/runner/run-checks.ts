import type { CheckResult, ExecutionResult, ResolvedCheck, ResolvedConfig } from "../types.ts";
import { executeCommand } from "./execute.ts";

export interface RunChecksOptions {
  /** Stop executing after the first required failure; remaining checks become SKIPPED. */
  failFast?: boolean;
  /** Interruption signal (R3-002): once aborted, no further check is started. */
  signal?: AbortSignal;
  onCheckStart?: (check: ResolvedCheck, index: number, total: number) => void;
  onCheckFinish?: (result: CheckResult, index: number, total: number) => void;
}

/** Lines kept per stream in the report. */
export const TAIL_LINES = 200;
/** Bytes kept per stream in the report. */
export const TAIL_BYTES = 64 * 1024;
const ERROR_SUMMARY_MAX = 300;

/** Run every check in config order. Never throws for check failures. */
export async function runChecks(
  config: ResolvedConfig,
  options: RunChecksOptions = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const total = config.checks.length;
  let requiredFailed = false;

  for (const [index, check] of config.checks.entries()) {
    options.onCheckStart?.(check, index, total);

    let result: CheckResult;
    if (options.signal?.aborted) {
      result = skippedResult(check, `skipped: run interrupted by ${describeAbort(options.signal)}`);
    } else if (options.failFast && requiredFailed) {
      result = skippedResult(check, "skipped: an earlier required check failed (--fail-fast)");
    } else {
      const execArgs: Parameters<typeof executeCommand>[0] = {
        command: check.command,
        cwd: check.cwdAbsolute,
        timeoutMs: check.timeoutSec * 1000,
      };
      if (options.signal) execArgs.signal = options.signal;
      const execution = await executeCommand(execArgs);
      result = toCheckResult(check, execution);
    }

    if (check.required && result.status !== "PASS") {
      requiredFailed = true;
    }
    results.push(result);
    options.onCheckFinish?.(result, index, total);
  }

  return results;
}

function describeAbort(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  return typeof reason === "string" ? reason : "abort";
}

export function toCheckResult(check: ResolvedCheck, exec: ExecutionResult): CheckResult {
  if (exec.interruptedBy !== null) {
    // R3-002: a check interrupted before or while running produced no result -> SKIPPED with the reason.
    const ran = exec.startedAt !== null && (exec.stdout.length > 0 || exec.stderr.length > 0 || exec.signal !== null);
    const skipped = skippedResult(
      check,
      ran
        ? `interrupted by ${exec.interruptedBy} while running (process group terminated)`
        : `skipped: run interrupted by ${exec.interruptedBy}`,
    );
    return { ...skipped, startedAt: exec.startedAt, durationMs: exec.durationMs, signal: exec.signal, stdoutTail: tail(exec.stdout).text, stderrTail: tail(exec.stderr).text };
  }
  const failed = exec.spawnError !== null || exec.timedOut || exec.exitCode !== 0;
  const stdoutTail = tail(exec.stdout);
  const stderrTail = tail(exec.stderr);
  return {
    name: check.name,
    kind: check.kind,
    command: check.command,
    cwd: check.cwd,
    required: check.required,
    timeoutSec: check.timeoutSec,
    description: check.description ?? null,
    status: failed ? "FAIL" : "PASS",
    exitCode: exec.exitCode,
    signal: exec.signal,
    timedOut: exec.timedOut,
    startedAt: exec.startedAt,
    durationMs: exec.durationMs,
    errorSummary: failed ? summarizeFailure(check, exec) : null,
    stdoutTail: stdoutTail.text,
    stderrTail: stderrTail.text,
    outputTruncated:
      exec.stdoutTruncated || exec.stderrTruncated || stdoutTail.truncated || stderrTail.truncated,
  };
}

function skippedResult(check: ResolvedCheck, reason: string): CheckResult {
  return {
    name: check.name,
    kind: check.kind,
    command: check.command,
    cwd: check.cwd,
    required: check.required,
    timeoutSec: check.timeoutSec,
    description: check.description ?? null,
    status: "SKIPPED",
    exitCode: null,
    signal: null,
    timedOut: false,
    startedAt: null,
    durationMs: 0,
    errorSummary: reason,
    stdoutTail: "",
    stderrTail: "",
    outputTruncated: false,
  };
}

function summarizeFailure(check: ResolvedCheck, exec: ExecutionResult): string {
  if (exec.spawnError !== null) {
    return `failed to start: ${exec.spawnError}`;
  }
  if (exec.timedOut) {
    return `timed out after ${check.timeoutSec}s (process group terminated)`;
  }
  if (exec.exitCode === null) {
    return `terminated by signal ${exec.signal ?? "unknown"}`;
  }
  const firstLine = firstMeaningfulLine(exec.stderr) ?? firstMeaningfulLine(exec.stdout);
  const base = `exit code ${exec.exitCode}`;
  return firstLine ? truncate(`${base}: ${firstLine}`, ERROR_SUMMARY_MAX) : base;
}

function firstMeaningfulLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    // Skip npm's own noise so the summary points at the actual tool error.
    if (trimmed.length === 0 || trimmed.startsWith("> ") || trimmed.startsWith("npm ")) {
      continue;
    }
    return trimmed;
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Keep the last TAIL_LINES lines and at most TAIL_BYTES bytes. */
export function tail(text: string): { text: string; truncated: boolean } {
  let truncated = false;
  let lines = text.split(/\r?\n/);
  if (lines.length > TAIL_LINES) {
    lines = lines.slice(-TAIL_LINES);
    truncated = true;
  }
  let out = lines.join("\n");
  if (Buffer.byteLength(out, "utf8") > TAIL_BYTES) {
    const buf = Buffer.from(out, "utf8");
    out = buf.subarray(buf.length - TAIL_BYTES).toString("utf8");
    truncated = true;
  }
  return { text: out, truncated };
}
