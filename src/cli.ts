#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildProgram } from "./cli-program.ts";
import { CLI_SIGNALS, swapSignalHandlers, type CliSignal, type SignalHandlers } from "./cli-signals.ts";
import { DEFAULT_KILL_GRACE_MS, terminateActiveChildren } from "./runner/execute.ts";
import { writeError } from "./output.ts";
import { EXIT_ERROR, SIGNAL_EXIT_CODES } from "./types.ts";

/**
 * The version of this package, from the package.json next to src/ (and dist/). A package.json that cannot be read, or that has no
 * version string, is an error and not "0.0.0": the version is written into the verify report and the review packet as the tool
 * that made them, so a made-up one would be false evidence (backlog 8, P11; ADR-0022).
 */
function readVersion(): string {
  let version: unknown;
  try {
    version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown }).version;
  } catch (err) {
    throw new Error(`cannot read the version from package.json (${(err as NodeJS.ErrnoException).code ?? "not valid JSON"})`, { cause: err });
  }
  if (typeof version !== "string" || version.length === 0) throw new Error("package.json has no version string");
  return version;
}

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
  writeError(`aiqh: received ${signal}, stopping: no new checks, terminating running ones (grace ${DEFAULT_KILL_GRACE_MS}ms)`);
  interruption.abort(signal);
  void terminateActiveChildren(DEFAULT_KILL_GRACE_MS);
  setTimeout(() => {
    writeError(`aiqh: clean-up did not finish within ${DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS}ms, exiting ${exitCode}`);
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
  writeError(`aiqh: ${signal} received after the verdict was fixed; result unchanged`);
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

/** The first line for a thrown value whose inspection throws (ROADMAP backlog 1, v0.5.14). */
const UNINSPECTABLE_THROWN_LINE = "aiqh: unexpected error: (the thrown value could not be inspected)";

/**
 * The first line for a value thrown out of a command: an Error's message, anything else as a string. Every inspection
 * (instanceof, reading message, the conversion to a string) and the line itself are made inside the try; if one throws,
 * the fixed line is used and neither the value nor what it threw is read again (the rule of inspect() in src/output.ts,
 * ADR-0018).
 */
function unexpectedErrorLine(err: unknown): string {
  try {
    return `aiqh: unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  } catch {
    return UNINSPECTABLE_THROWN_LINE;
  }
}

/** One line to standard error through the output boundary; a line that cannot be written is left out, nothing is read. */
function tryWriteError(line: string): void {
  try {
    writeError(line);
  } catch {
    // The exit code is already set; what was thrown is not inspected.
  }
}

// The last handler never throws: an exception here would be Node's unhandled rejection (the value printed raw, exit 1).
// The commands and options (side-effect free, src/cli-program.ts; M2-1-R3-005) are built inside the chain, so that a version that cannot
// be read is reported by this handler (exit 2) and not thrown while this module loads.
Promise.resolve().then(() => buildProgram({ version: readVersion(), signal: interruption.signal, onVerdictFixed }).parseAsync(process.argv)).catch((err: unknown) => {
  process.exitCode = EXIT_ERROR;
  // Through the output boundary like every other line (src/output.ts): a message can quote a path.
  tryWriteError(unexpectedErrorLine(err));
  tryWriteError("VERIFY ERROR (internal error)");
});
