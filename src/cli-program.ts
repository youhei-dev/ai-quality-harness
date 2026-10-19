/**
 * The aiqh command-line program (M2-2, M2-1-R3-005): every command and option, built without side effects —
 * no parsing, no signal handlers, no file reads — so that tests can inspect the real commander objects
 * (review-packet's options against OPTION_INVENTORY) instead of parsing `--help` text. src/cli.ts reads the
 * version, installs the signal handling and parses process.argv.
 */
import { Command } from "commander";
import { runHistory } from "./commands/history.ts";
import { runInit } from "./commands/init.ts";
import { runReviewCheck } from "./commands/review-check.ts";
import { runReviewImport } from "./commands/review-import.ts";
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

/** Positive integer option (bytes, a round); anything else is a usage error (exit 2). */
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
  // A usage error (an unknown command or option, a missing argument or value, no command given) is exit 2: exit 1 means "findings" (verify FAILED,
  // security-scan findings). help and --version stay 0. Set before the commands are added: each command inherits it when it is created.
  program.exitOverride((err) => {
    process.exit(err.exitCode === 0 ? 0 : EXIT_ERROR);
  });
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
    .description("Scan tracked and untracked files for secret-shaped strings, raw bidi controls and line separators, .env files and .gitignore gaps (values are never printed)")
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

  program
    .command("review-import")
    .description("Import an independent review (Markdown with one aiqh-findings JSON block) into docs/reviews/<label>/findings-r<N>.json, every finding open; nothing is written if the block is missing or invalid, or if it does not agree with the review's headings, count line or IDs")
    .argument("<review>", "the review file (Markdown)")
    .requiredOption("--label <name>", "docs/reviews/<label>/: lower-case ASCII letters, digits, \".\" and \"-\"")
    .requiredOption("--round <n>", "the review round (1, 2, …)", positiveInt)
    .requiredOption("--id-prefix <prefix>", "the prefix of the finding IDs: <prefix>-R<round>-<NNN> (for example B20 or M2-2-RI)")
    .option("--allow-missing-previous", "round 2 or later without findings-r<round-1>.json (only when that file does not exist)", false)
    .option("--cwd <dir>", "repository directory with docs/reviews/ (default: current directory)")
    .action(async (review: string, opts: { label: string; round: number; idPrefix: string; allowMissingPrevious: boolean; cwd?: string }) => {
      const args: Parameters<typeof runReviewImport>[0] = { review, label: opts.label, round: opts.round, idPrefix: opts.idPrefix, allowMissingPrevious: opts.allowMissingPrevious, toolVersion: deps.version };
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      process.exitCode = await runReviewImport(args);
    });

  program
    .command("review-check")
    .description("Check the findings files of a label (docs/reviews/<label>/findings-r*.json; reads only): the rounds, their shape, the fields each state needs and the previous round's assessments; show the open findings. 0 = checked (open findings and warnings do not change it), 2 = a problem")
    .requiredOption("--label <name>", "docs/reviews/<label>/: lower-case ASCII letters, digits, \".\" and \"-\"")
    .option("--cwd <dir>", "repository directory with docs/reviews/ (default: current directory)")
    .action(async (opts: { label: string; cwd?: string }) => {
      const args: Parameters<typeof runReviewCheck>[0] = { label: opts.label };
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      process.exitCode = await runReviewCheck(args);
    });

  program
    .command("history")
    .description("Aggregate the verify history of one or more projects without a database (the histories are only read): a table, or the aggregate as JSON; with --html, also a static dashboard (no script, nothing loaded from elsewhere). A --from is shown as #<n>, never as a path. 0 = every history file was read, 2 = a history file could not be read (listed), or a usage or input error, or a limit")
    .option("--from <dir>", "a project root (with artifacts/verification/history) or a history directory (repeatable; at least one)", collect, [])
    .option("--cwd <dir>", "the directory relative --from paths are resolved against (default: current directory)")
    .option("--json", "print the aggregate as JSON (the last line goes to standard error)", false)
    .option("--html", "also write the dashboard, <out>/dashboard.html (static HTML: no script, nothing loaded from elsewhere)", false)
    .option("--out <dir>", "the directory of dashboard.html, relative to --cwd (default: artifacts/history); only with --html")
    .action(async (opts: { from: string[]; cwd?: string; json: boolean; html: boolean; out?: string }) => {
      const args: Parameters<typeof runHistory>[0] = { from: opts.from, json: opts.json, toolVersion: deps.version };
      if (opts.cwd !== undefined) args.cwd = opts.cwd;
      if (opts.html) args.html = true;
      if (opts.out !== undefined) args.out = opts.out;
      process.exitCode = await runHistory(args);
    });

  return program;
}
