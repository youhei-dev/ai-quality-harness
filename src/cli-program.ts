/**
 * The aiqh command-line program (M2-2, M2-1-R3-005): every command and option, built without side effects —
 * no parsing, no signal handlers, no file reads — so that tests can inspect the real commander objects
 * (review-packet's options against OPTION_INVENTORY) instead of parsing `--help` text. src/cli.ts reads the
 * version, installs the signal handling and parses process.argv.
 */
import { Command } from "commander";
import { runInit } from "./commands/init.ts";
import { runReviewPacket } from "./commands/review-packet.ts";
import { runSecurityScan } from "./commands/security-scan.ts";
import { runVerify } from "./commands/verify.ts";
import { COMMANDER_OUTPUT, writeError } from "./output.ts";
import { EXIT_ERROR } from "./types.ts";

export interface ProgramDeps {
  version: string;
  /** Aborted when the verify run is interrupted (SIGINT / SIGTERM before the verdict is fixed). */
  signal: AbortSignal;
  /** Called by runVerify once the verdict is fixed. */
  onVerdictFixed: () => void;
}

/** Repeatable option: collect every value in order. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Positive integer option (bytes); anything else is a usage error (exit 2). */
function positiveInt(value: string): number {
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    writeError(`aiqh: expected a positive integer, got ${JSON.stringify(value)}`);
    process.exit(EXIT_ERROR);
  }
  return Number(value);
}

export function buildProgram(deps: ProgramDeps): Command {
  const program = new Command();
  // commander's own output (help, --version, usage errors that quote argv) goes through the output boundary
  // (src/output.ts, M2-2-R2-001; a usage error is one line plus commander's suggestion, M2-2-R3-001). Set before the
  // commands are added: each command inherits it when it is created.
  program.configureOutput(COMMANDER_OUTPUT);
  program
    .name("aiqh")
    .description("Fail-closed quality gate runner for AI-assisted development")
    .version(deps.version);

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
          toolVersion: deps.version,
          signal: deps.signal,
          onVerdictFixed: deps.onVerdictFixed,
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
      const args: Parameters<typeof runInit>[0] = { write: opts.write, force: opts.force, writeGitignore: opts.writeGitignore, writeScripts: opts.writeScripts, json: opts.json, toolVersion: deps.version };
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
        const args: Parameters<typeof runReviewPacket>[0] = { range: opts.range, zip: opts.zip, review: opts.review, doc: opts.doc, exclude: opts.exclude, json: opts.json, toolVersion: deps.version };
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

  return program;
}
