import path from "node:path";
import { ConfigError, DEFAULT_CONFIG_FILENAME, loadConfig } from "../config/load.ts";
import { getGitInfo } from "../git/info.ts";
import { buildReport } from "../report/build-report.ts";
import { formatDuration } from "../report/markdown.ts";
import { writeReports } from "../report/write.ts";
import { createOutput } from "../output.ts";
import { runChecks } from "../runner/run-checks.ts";
import { maskSecrets } from "../security/mask.ts";
import { CATEGORY_KINDS, EXIT_ERROR, SIGNAL_EXIT_CODES, type CheckResult, type ResolvedCheck } from "../types.ts";

export interface VerifyOptions {
  /** Path to aiqh.config.jsonc. Default: <cwd>/aiqh.config.jsonc */
  config?: string;
  /** Directory used to locate the default config. Default: process.cwd() */
  cwd?: string;
  /** Override output.dir from the config. */
  outputDir?: string;
  failFast?: boolean;
  verbose?: boolean;
  toolVersion: string;
  /**
   * Interruption signal (R3-002). When it aborts (reason = signal name), no further check is
   * started, running checks are terminated, the report is written with verdict ERROR and the
   * returned exit code is 128 + signal number.
   */
  signal?: AbortSignal;
  /**
   * Called once the verdict is fixed (R4-001 plan B, R5-003): every check has completed, the event
   * loop was run for one full iteration, and no interruption had been dispatched by then. From
   * here on the verification result does not change; the CLI uses this to swap its signal
   * handlers. Note that the CLI *outcome* is decided later: exit 0 / 1 after the report was
   * written, or 2 if writing fails (R-007).
   */
  onVerdictFixed?: () => void;
  /**
   * Test hook: called synchronously right after every check has completed and before the run is
   * finalized. Tests use it to deliver an OS signal into that window (R4-001). This is an internal
   * option of runVerify only — it is not reachable from the config file or the CLI arguments.
   */
  afterChecksCompleted?: () => void;
  /** Line sink for progress output. Default: standard output (through the output boundary, src/output.ts) */
  log?: (line: string) => void;
  /** Line sink for errors. Default: standard error (through the output boundary) */
  logError?: (line: string) => void;
}

const CONSOLE_TAIL_LINES = 20;

/**
 * Run the verify pipeline. Returns the process exit code. The final console line is tied to
 * the exit code: 0 = "VERIFY PASSED", 1 = "VERIFY FAILED", 2 / 130 / 143 = "VERIFY ERROR" (R-007, R3-002).
 */
export async function runVerify(options: VerifyOptions): Promise<number> {
  // Every printed line goes through the output boundary (src/output.ts, M2-2-R2-001): raw characters in paths, names,
  // git output and the tails of check output become ASCII notation, then the masker (the masks below stay: printTail
  // masks a tail as one text, so a secret over several lines is redacted before it is split into lines).
  const output = createOutput({ log: options.log, logError: options.logError });
  const log = output.log;
  const logError = output.error;
  const startedAt = new Date();

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configPath = path.resolve(cwd, options.config ?? DEFAULT_CONFIG_FILENAME);

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      logError(`aiqh: ${maskSecrets(err.message)}`);
      logError("VERIFY ERROR (configuration error)");
      return EXIT_ERROR;
    }
    throw err;
  }
  if (options.outputDir) {
    config.outputDir = path.resolve(cwd, options.outputDir);
  }

  const git = getGitInfo(config.projectRoot);

  log(`aiqh verify — ${config.project.name}`);
  log(`config: ${config.configPath}`);
  log(
    git
      ? `git: ${git.branch ?? "(detached)"} @ ${git.commit ? git.commit.slice(0, 12) : "(no commit)"}${git.dirty === null ? " (dirty: unknown)" : git.dirty ? " (dirty)" : ""}`
      : "git: not a git repository",
  );
  log("");

  const runOptions: Parameters<typeof runChecks>[1] = {
    failFast: options.failFast ?? false,
    onCheckStart: (check: ResolvedCheck, index: number, total: number) => {
      log(`[${index + 1}/${total}] ${check.name} (${check.kind}${check.required ? "" : ", optional"})`);
      log(`      $ ${maskSecrets(check.command)}`);
    },
    // R4-003: a check that is not started is shown as SKIPPED only, never with its command line.
    onCheckSkip: (check: ResolvedCheck, index: number, total: number, reason: string) => {
      log(`[${index + 1}/${total}] ${check.name} (${check.kind}) — SKIPPED (${maskSecrets(reason)})`);
      log("");
    },
    onCheckFinish: (result: CheckResult) => {
      const tag = result.status === "PASS" ? "PASS" : result.status === "FAIL" ? "FAIL" : "SKIP";
      const detail = result.errorSummary ? ` — ${maskSecrets(result.errorSummary)}` : "";
      log(`      ${tag}  ${formatDuration(result.durationMs)}${detail}`);
      if (result.status === "FAIL") {
        printTail(log, "stderr", result.stderrTail, options.verbose ?? false);
        printTail(log, "stdout", result.stdoutTail, options.verbose ?? false);
      }
      log("");
    },
  };
  if (options.signal) runOptions.signal = options.signal;
  const results = await runChecks(config, runOptions);
  options.afterChecksCompleted?.();

  // Verdict fixing point (R4-001 plan B, R5-002 semantics): all exit codes are in. The event loop
  // is run for one full iteration (including a poll phase); every signal that Node has dispatched
  // to JS by the end of that iteration is treated as an interruption. A signal that arrives later,
  // or has arrived but has not been dispatched yet, is treated as a post-verdict signal and does not
  // change the verification result. This is the observable semantics; a guarantee based on the
  // OS arrival time is not provided by the JS event loop alone.
  await yieldFullIteration();
  const interruptedBy = options.signal?.aborted ? describeAbort(options.signal) : null;
  if (interruptedBy === null) options.onVerdictFixed?.();
  const finishedAt = new Date();
  const report = buildReport({
    config,
    results,
    git,
    startedAt,
    finishedAt,
    toolVersion: options.toolVersion,
    interruptedBy,
  });

  let paths;
  try {
    paths = writeReports(report, config.outputDir);
  } catch (err) {
    logError(`aiqh: failed to write reports to ${config.outputDir}: ${maskSecrets((err as Error).message)}`);
    // Never echo the verdict here: the exit code is 2, so the wording must be ERROR (R-007).
    logError("VERIFY ERROR (report write error)");
    return EXIT_ERROR;
  }

  const failedNames = results.filter((r) => r.required && r.status !== "PASS").map((r) => r.name);
  const optionalFailed = results.filter((r) => !r.required && r.status === "FAIL").map((r) => r.name);
  if (interruptedBy !== null) {
    // R3-002: never echo PASSED / FAILED here; the run did not complete.
    log(
      `VERIFY ERROR (interrupted by ${interruptedBy}) — completed: ${results.filter((r) => r.status !== "SKIPPED").length}, skipped: ${report.summary.skipped}, duration: ${formatDuration(report.durationMs)}`,
    );
  } else {
    log(
      `VERIFY ${report.verdict} — required failed: ${failedNames.length}${failedNames.length ? ` (${failedNames.join(", ")})` : ""}, optional failed: ${optionalFailed.length}${optionalFailed.length ? ` (${optionalFailed.join(", ")})` : ""}, duration: ${formatDuration(report.durationMs)}`,
    );
  }
  log(
    `categories: ${CATEGORY_KINDS.map((k) => `${k} ${report.categories[k] === "NOT_APPLICABLE" ? "N/A" : report.categories[k]}`).join(" | ")}`,
  );
  log(`report: ${paths.latestMd}`);
  log(`        ${paths.latestJson}`);
  log(`        ${paths.history}`);

  return report.exitCode;
}

function describeAbort(signal: AbortSignal): string {
  const reason: unknown = signal.reason;
  return typeof reason === "string" ? reason : "abort";
}

/**
 * Yield until the event loop has gone through at least one full iteration that includes a poll
 * phase. libuv dispatches pending OS signals (SIGINT / SIGTERM handlers) in the poll phase. A single
 * setImmediate is not enough: when the continuation comes from an I/O callback (e.g. the child's
 * "close" event, which is what resolves runChecks), that immediate fires in the check phase of the
 * *same* iteration, before the next poll — so a signal already pending in Node would still be
 * unseen (v0.1.3 had exactly this gap; 4 of 10 runs missed the signal). The second setImmediate is
 * scheduled from the check phase and therefore runs in the next iteration, after its poll phase.
 * What this gives: signals dispatched by Node up to that poll are observed. What it does not give:
 * a signal that reaches the OS after that poll (or is not yet dispatched) is a post-verdict signal
 * (R5-002). Measured: 20 of 20 runs recognise a signal that was pending when the checks completed.
 */
async function yieldFullIteration(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Exit code for an interrupted run: 128 + signal number when known, otherwise the generic error code. */
export function interruptionExitCode(interruptedBy: string): number {
  return SIGNAL_EXIT_CODES[interruptedBy] ?? EXIT_ERROR;
}

function printTail(log: (line: string) => void, label: string, text: string, verbose: boolean): void {
  const masked = maskSecrets(text).trimEnd();
  if (masked.length === 0) return;
  let lines = masked.split("\n");
  let note = "";
  if (!verbose && lines.length > CONSOLE_TAIL_LINES) {
    lines = lines.slice(-CONSOLE_TAIL_LINES);
    note = ` (last ${CONSOLE_TAIL_LINES} lines; use --verbose for more)`;
  }
  log(`      --- ${label}${note} ---`);
  for (const line of lines) {
    log(`      ${line}`);
  }
}
