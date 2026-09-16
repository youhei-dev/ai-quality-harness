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
const interruption = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (interruption.signal.aborted) return;
    console.error(`aiqh: received ${signal}, stopping: no new checks, terminating running ones (grace ${DEFAULT_KILL_GRACE_MS}ms)`);
    interruption.abort(signal);
    void terminateActiveChildren(DEFAULT_KILL_GRACE_MS);
    const exitCode = SIGNAL_EXIT_CODES[signal] ?? EXIT_ERROR;
    setTimeout(() => {
      console.error(`aiqh: clean-up did not finish within ${DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS}ms, exiting ${exitCode}`);
      process.exit(exitCode);
    }, DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS).unref();
  });
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
