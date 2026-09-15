#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { runVerify } from "./commands/verify.ts";
import { killActiveChildren } from "./runner/execute.ts";
import { maskSecrets } from "./security/mask.ts";
import { EXIT_ERROR } from "./types.ts";

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

// Children run in their own process group (ADR-0005), so forward termination explicitly.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    killActiveChildren("SIGTERM");
    process.exitCode = 130;
    setTimeout(() => process.exit(130), 200).unref();
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
