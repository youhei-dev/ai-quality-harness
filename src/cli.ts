#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { runVerify } from "./commands/verify.ts";
import { DEFAULT_KILL_GRACE_MS, terminateActiveChildren } from "./runner/execute.ts";
import { maskSecrets } from "./security/mask.ts";
import { EXIT_ERROR, SIGNAL_EXIT_CODES } from "./types.ts";

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

// Interruption (R2-002 / R3-002). Order matters:
//   1. mark the run as interrupted (AbortController) so no further check is spawned,
//   2. clean up the groups that are running (SIGTERM → grace → SIGKILL → group gone),
//   3. let runVerify record the remaining checks as SKIPPED and write the report,
//   4. exit with 128 + signal number (the normal return path of the verify command).
// A safety valve forces the exit after grace + 3 s in case something never settles.
const SAFETY_VALVE_EXTRA_MS = 3_000;
const SIGNALS = ["SIGINT", "SIGTERM"] as const;
const interruption = new AbortController();

/** Before the finalization point: interrupt the run (R3-002) and back up the exit code (R4-001). */
function onSignalBeforeFinalization(signal: (typeof SIGNALS)[number]): void {
  if (interruption.signal.aborted) return;
  const exitCode = SIGNAL_EXIT_CODES[signal] ?? EXIT_ERROR;
  // Backup: even if the run finished before the abort is observed, the process must not exit 0.
  process.exitCode = exitCode;
  console.error(`aiqh: received ${signal}, stopping: no new checks, terminating running ones (grace ${DEFAULT_KILL_GRACE_MS}ms)`);
  interruption.abort(signal);
  void terminateActiveChildren(DEFAULT_KILL_GRACE_MS);
  setTimeout(() => {
    console.error(`aiqh: clean-up did not finish within ${DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS}ms, exiting ${exitCode}`);
    process.exit(exitCode);
  }, DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS).unref();
}

/**
 * After the finalization point (R4-001, plan B): the result is fixed, only the synchronous report
 * writing and the final output remain. Signals are acknowledged but change nothing. The handler is
 * swapped rather than removed: with no listener Node would restore the default action and kill the
 * process mid-finalization, which would change the outcome.
 */
function onSignalAfterFinalization(signal: (typeof SIGNALS)[number]): void {
  console.error(`aiqh: ${signal} received after verification was finalized; result unchanged`);
}

const beforeHandlers = Object.fromEntries(
  SIGNALS.map((signal) => [signal, () => onSignalBeforeFinalization(signal)] as const),
) as Record<(typeof SIGNALS)[number], () => void>;
for (const signal of SIGNALS) process.on(signal, beforeHandlers[signal]);

function swapHandlersToFinalized(): void {
  for (const signal of SIGNALS) {
    process.off(signal, beforeHandlers[signal]);
    process.on(signal, () => onSignalAfterFinalization(signal));
  }
}

const program = new Command();
program
  .name("aiqh")
  .description("Fail-closed quality gate runner for AI-assisted development")
  .version(VERSION);

program
  .command("verify")
  .description("Run every check in aiqh.config.jsonc and write JSON / Markdown reports")
  .option("-c, --config <path>", "path to the config file (default: ./aiqh.config.jsonc)")
  .option("--cwd <dir>", "directory used to locate the config (default: current directory)")
  .option("-o, --output-dir <dir>", "override the report output directory")
  .option("--fail-fast", "stop after the first required failure; later checks are SKIPPED", false)
  .option("-v, --verbose", "print the full captured output of failed checks", false)
  .action(
    async (opts: {
      config?: string;
      cwd?: string;
      outputDir?: string;
      failFast: boolean;
      verbose: boolean;
    }) => {
      const args: Parameters<typeof runVerify>[0] = {
        failFast: opts.failFast,
        verbose: opts.verbose,
        toolVersion: VERSION,
        signal: interruption.signal,
        onFinalized: swapHandlersToFinalized,
      };
      if (opts.config !== undefined) args.config = opts.config;
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      if (opts.outputDir !== undefined) args.outputDir = opts.outputDir;
      process.exitCode = await runVerify(args);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`aiqh: unexpected error: ${maskSecrets(message)}`);
  console.error("VERIFY ERROR (internal error)");
  process.exitCode = EXIT_ERROR;
});
