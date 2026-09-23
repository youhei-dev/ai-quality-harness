#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { CLI_SIGNALS, swapSignalHandlers, type CliSignal, type SignalHandlers } from "./cli-signals.ts";
import { runInit } from "./commands/init.ts";
import { runReviewPacket } from "./commands/review-packet.ts";
import { runSecurityScan } from "./commands/security-scan.ts";
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

/** Before the verdict is fixed: interrupt the run (R3-002) and back up the exit code (R4-001). */
function onSignalBeforeVerdictFixed(signal: CliSignal): void {
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
 * After the verdict is fixed (R4-001, plan B): the verification result no longer changes; only the
 * synchronous report writing and the final output remain (the CLI outcome is 0 / 1 after a
 * successful write, or 2 if the report cannot be written — R-007 / R5-003). Signals are
 * acknowledged but change nothing. The handlers are swapped rather than removed: with no listener
 * Node would restore the default action and kill the process, which would change the outcome.
 */
function onSignalAfterVerdictFixed(signal: CliSignal): void {
  console.error(`aiqh: ${signal} received after the verdict was fixed; result unchanged`);
}

// Handler references are kept so the swap can remove exactly these functions (R5-001).
const beforeHandlers: SignalHandlers = {
  SIGINT: () => onSignalBeforeVerdictFixed("SIGINT"),
  SIGTERM: () => onSignalBeforeVerdictFixed("SIGTERM"),
};
const afterHandlers: SignalHandlers = {
  SIGINT: () => onSignalAfterVerdictFixed("SIGINT"),
  SIGTERM: () => onSignalAfterVerdictFixed("SIGTERM"),
};
for (const signal of CLI_SIGNALS) process.on(signal, beforeHandlers[signal]);

/** Called by runVerify once the verdict is fixed: add the "after" handlers, then remove the "before" ones. */
function onVerdictFixed(): void {
  swapSignalHandlers(beforeHandlers, afterHandlers);
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
        onVerdictFixed,
      };
      if (opts.config !== undefined) args.config = opts.config;
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      if (opts.outputDir !== undefined) args.outputDir = opts.outputDir;
      process.exitCode = await runVerify(args);
    },
  );

program
  .command("init")
  .description("Audit a repository (read-only), propose aiqh.config.jsonc, and write it only with --write")
  .option("--cwd <dir>", "repository directory (default: current directory)")
  .option("--write", "write aiqh.config.jsonc (refuses to overwrite without --force)", false)
  .option("--force", "overwrite an existing aiqh.config.jsonc", false)
  .option("--write-gitignore", 'append "artifacts/" to .gitignore', false)
  .option("--write-scripts", "add missing scripts (verify) to package.json", false)
  .option("--json", "print the audit and proposal as JSON", false)
  .action(async (opts: { cwd?: string; write: boolean; force: boolean; writeGitignore: boolean; writeScripts: boolean; json: boolean }) => {
    const args: Parameters<typeof runInit>[0] = { write: opts.write, force: opts.force, writeGitignore: opts.writeGitignore, writeScripts: opts.writeScripts, json: opts.json, toolVersion: VERSION };
    if (opts.cwd !== undefined) args.cwd = opts.cwd;
    process.exitCode = await runInit(args);
  });

program
  .command("security-scan")
  .description("Scan tracked and untracked files for secret-shaped strings, .env files and .gitignore gaps (values are never printed)")
  .option("--cwd <dir>", "repository directory (default: current directory)")
  .option("-c, --config <path>", "config file for the security section (default: ./aiqh.config.jsonc if present)")
  .option("--json", "print the result as JSON", false)
  .action(async (opts: { cwd?: string; config?: string; json: boolean }) => {
    const args: Parameters<typeof runSecurityScan>[0] = { json: opts.json };
    if (opts.cwd !== undefined) args.cwd = opts.cwd;
    if (opts.config !== undefined) args.configPath = opts.config;
    process.exitCode = await runSecurityScan(args);
  });

/** Repeatable option: collect every value in order. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Positive integer option (bytes); anything else is a usage error (exit 2). */
function positiveInt(value: string): number {
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    console.error(`aiqh: expected a positive integer, got ${maskSecrets(JSON.stringify(value))}`);
    process.exit(EXIT_ERROR);
  }
  return Number(value);
}

program
  .command("review-packet")
  .description("Build a Markdown review packet for a commit range (full sources, diffs, no implementer conclusion); nothing is written if a secret-shaped string, a raw control / separator / bidi character or invalid UTF-8 is found")
  .requiredOption("--range <from..to>", "commit range; <from> must be an ancestor of <to>")
  .option("--cwd <dir>", "repository directory (default: current directory)")
  .option("--label <name>", "name used in the title and the file name: a-z, 0-9, \".\", \"-\" (default: first 12 hex digits of <to>)")
  .option("-o, --output <file>", "packet path (default: <repo>/artifacts/ai-review/review-packet-<label>.md)")
  .option("--zip", "also write a ZIP that contains only the packet (next to the packet)", false)
  .option("--zip-output <file>", "ZIP path (implies --zip)")
  .option("--request <file>", "human-written request to include verbatim (\"-\" = standard input)")
  .option("--review <file>", "previous review to include verbatim (repeatable)", collect, [])
  .option("--doc <path>", "repository file to include in full at <to> (repeatable)", collect, [])
  .option("--exclude <glob>", "leave matching changed files out of the full sources and diffs; they stay listed as excluded (repeatable)", collect, [])
  .option("--max-file-bytes <n>", "largest changed file / document shown in full (default 524288); larger ones are an error unless excluded", positiveInt)
  .option("--max-packet-bytes <n>", "largest packet (default 4194304); larger is an error, nothing is written", positiveInt)
  .option("-c, --config <path>", "config file for the security section (default: ./aiqh.config.jsonc if present)")
  .option("--json", "print the result as JSON", false)
  // Usage errors (missing --range, unknown option) must be exit 2 here: exit 1 means "findings".
  .exitOverride((err) => {
    process.exit(err.exitCode === 0 ? 0 : EXIT_ERROR);
  })
  .action(
    async (opts: {
      range: string;
      cwd?: string;
      label?: string;
      output?: string;
      zip: boolean;
      zipOutput?: string;
      request?: string;
      review: string[];
      doc: string[];
      exclude: string[];
      maxFileBytes?: number;
      maxPacketBytes?: number;
      config?: string;
      json: boolean;
    }) => {
      const args: Parameters<typeof runReviewPacket>[0] = { range: opts.range, zip: opts.zip, review: opts.review, doc: opts.doc, exclude: opts.exclude, json: opts.json, toolVersion: VERSION };
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      if (opts.label !== undefined) args.label = opts.label;
      if (opts.output !== undefined) args.output = opts.output;
      if (opts.zipOutput !== undefined) args.zipOutput = opts.zipOutput;
      if (opts.request !== undefined) args.request = opts.request;
      if (opts.maxFileBytes !== undefined) args.maxFileBytes = opts.maxFileBytes;
      if (opts.maxPacketBytes !== undefined) args.maxPacketBytes = opts.maxPacketBytes;
      if (opts.config !== undefined) args.configPath = opts.config;
      process.exitCode = await runReviewPacket(args);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`aiqh: unexpected error: ${maskSecrets(message)}`);
  console.error("VERIFY ERROR (internal error)");
  process.exitCode = EXIT_ERROR;
});
