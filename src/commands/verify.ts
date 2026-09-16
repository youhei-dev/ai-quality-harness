import path from "node:path";
import { ConfigError, DEFAULT_CONFIG_FILENAME, loadConfig } from "../config/load.ts";
import { getGitInfo } from "../git/info.ts";
import { buildReport } from "../report/build-report.ts";
import { formatDuration } from "../report/markdown.ts";
import { writeReports } from "../report/write.ts";
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
  /** Line sink for progress output. Default: console.log */
  log?: (line: string) => void;
  /** Line sink for errors. Default: console.error */
  logError?: (line: string) => void;
}

const CONSOLE_TAIL_LINES = 20;

/**
 * Run the verify pipeline. Returns the process exit code. The final console line is tied to
 * the exit code: 0 = "VERIFY PASSED", 1 = "VERIFY FAILED", 2 / 130 / 143 = "VERIFY ERROR" (R-007, R3-002).
 */
export async function runVerify(options: VerifyOptions): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  const logError = options.logError ?? ((line: string) => console.error(line));
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

  const interruptedBy = options.signal?.aborted ? describeAbort(options.signal) : null;
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
