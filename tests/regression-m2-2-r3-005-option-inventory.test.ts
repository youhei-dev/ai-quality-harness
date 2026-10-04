/**
 * M2-1-R3-005 (Medium, fixed in M2-2): the test that OPTION_INVENTORY lists every option of review-packet read
 * `--help` with a regular expression for `--long-name` lines, so a short-only option, a hidden option
 * (`hideHelp()`) or a positional argument could be added without an inventory entry. The CLI could not be
 * inspected directly: importing src/cli.ts parsed process.argv, installed signal handlers and exited.
 *  - src/cli-program.ts builds the program without side effects; the inventory is compared with the
 *    review-packet Command object itself: options by attribute name (hidden and short-only included),
 *    positional arguments, and each option's arity against its handling
 * Before the fix there was no factory (the import fails), and the help parser saw none of the three additions.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Option, type Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli-program.ts";
import { OPTION_INVENTORY } from "../src/commands/review-packet.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function reviewPacketCommand(): Command {
  const program = buildProgram({ version: "0.0.0", signal: new AbortController().signal, onVerdictFixed: () => {} });
  const cmd = program.commands.find((c) => c.name() === "review-packet");
  if (cmd === undefined) throw new Error("review-packet is not registered");
  return cmd;
}

/** The short aliases review-packet registers (src/cli-program.ts). An option that is not listed has none. */
const SHORT_ALIASES: Readonly<Record<string, string>> = { output: "-o", config: "-c" };

/** What the command registers but the inventory does not decide (and the reverse). Empty = consistent. */
function inventoryMismatch(cmd: Command): string[] {
  const keys = new Set(Object.keys(OPTION_INVENTORY));
  const out: string[] = [];
  for (const o of cmd.options) {
    const name = o.attributeName();
    if (!keys.has(name)) out.push(`option ${o.flags} (${name}${o.hidden ? ", hidden" : ""}${o.long === undefined ? ", short-only" : ""}) is not in OPTION_INVENTORY`);
  }
  for (const k of keys) if (!cmd.options.some((o) => o.attributeName() === k)) out.push(`OPTION_INVENTORY.${k} is not registered`);
  // The short alias (M2-2-R1-002): the long name is the key above, so only the short name is left to compare.
  for (const o of cmd.options) {
    if (!keys.has(o.attributeName())) continue;
    if ((o.short ?? "") !== (SHORT_ALIASES[o.attributeName()] ?? "")) out.push(`option ${o.flags}: short alias ${o.short ?? "(none)"} is not SHORT_ALIASES.${o.attributeName()} (${SHORT_ALIASES[o.attributeName()] ?? "(none)"})`);
  }
  for (const a of cmd.registeredArguments) out.push(`positional argument ${a.name()} is not in OPTION_INVENTORY`);
  return out.sort();
}

/** Options whose value does not fit their handling. Empty = consistent. Only the arity is read: `<x>` is required, `[x]` is optional, a flag has neither. */
function arityMismatch(cmd: Command): string[] {
  return cmd.options.flatMap((o) => {
    const handling = OPTION_INVENTORY[o.attributeName() as keyof typeof OPTION_INVENTORY].handling;
    const takesValue = o.required || o.optional;
    if (handling === "flag") return takesValue ? [`${o.flags}: a flag takes no value`] : [];
    if (!takesValue) return [`${o.flags}: ${handling} takes a value`];
    if (!o.required) return [`${o.flags}: ${handling} takes a required value, not an optional one`];
    if (handling === "number" && o.parseArg === undefined) return [`${o.flags}: a number needs a parser`];
    return [];
  });
}

describe("M2-1-R3-005: the option inventory against the Command object", () => {
  it("the inventory equals the options of the review-packet command", () => {
    expect(inventoryMismatch(reviewPacketCommand())).toEqual([]);
  });

  it("a hidden option, a short-only option and a positional argument added to the command are reported", () => {
    const cmd = reviewPacketCommand();
    cmd.addOption(new Option("--hidden-extra <value>", "hidden").hideHelp());
    cmd.option("-x <value>", "short-only");
    cmd.argument("[extra]", "positional");
    expect(inventoryMismatch(cmd)).toEqual([
      "option --hidden-extra <value> (hiddenExtra, hidden) is not in OPTION_INVENTORY",
      "option -x <value> (x, short-only) is not in OPTION_INVENTORY",
      "positional argument extra is not in OPTION_INVENTORY",
    ]);
  });

  it("a short alias that is renamed, removed, added or moved is reported (M2-2-R1-002)", () => {
    const reshape = (long: string, short: string | undefined): ((cmd: Command) => void) => (cmd) => {
      const o = cmd.options.find((x) => x.long === long);
      if (o === undefined) throw new Error(`no ${long}`);
      o.short = short;
    };
    const mismatch = (...edits: Array<(cmd: Command) => void>): string[] => {
      const cmd = reviewPacketCommand();
      for (const edit of edits) edit(cmd);
      return inventoryMismatch(cmd);
    };
    expect(mismatch(reshape("--output", "-p"))).toEqual(["option -o, --output <file>: short alias -p is not SHORT_ALIASES.output (-o)"]);
    expect(mismatch(reshape("--config", undefined))).toEqual(["option -c, --config <path>: short alias (none) is not SHORT_ALIASES.config (-c)"]);
    expect(mismatch(reshape("--json", "-j"))).toEqual(["option --json: short alias -j is not SHORT_ALIASES.json ((none))"]);
    expect(mismatch(reshape("--output", undefined), reshape("--zip-output", "-o"))).toEqual([
      "option -o, --output <file>: short alias (none) is not SHORT_ALIASES.output (-o)",
      "option --zip-output <file>: short alias -o is not SHORT_ALIASES.zipOutput ((none))",
    ].sort());
  });

  it("each option's arity matches its handling (flags take no value, numbers have a parser, the rest take a required value)", () => {
    expect(arityMismatch(reviewPacketCommand())).toEqual([]);
  });

  it("an option whose value became optional (`<file>` -> `[file]`) is reported (M2-2-R1-002)", () => {
    const cmd = reviewPacketCommand();
    const output = cmd.options.find((x) => x.long === "--output");
    if (output === undefined) throw new Error("no --output");
    output.required = false;
    output.optional = true;
    output.flags = "-o, --output [file]";
    expect(arityMismatch(cmd)).toEqual(["-o, --output [file]: rendered takes a required value, not an optional one"]);
  });

  it("review-packet takes no positional argument, and an unknown option is a usage error (exit 2)", () => {
    expect(reviewPacketCommand().registeredArguments).toEqual([]);
    const r = spawnSync(process.execPath, [path.join(ROOT, "src", "cli.ts"), "review-packet", "--range", "a..b", "--no-such-option"], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown option");
  });

  it("importing the program factory has no side effects (no parse, no output, no signal handler, no exit)", () => {
    const url = pathToFileURL(path.join(ROOT, "src", "cli-program.ts")).href;
    const script = [
      'const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];',
      `const m = await import(${JSON.stringify(url)});`,
      'const after = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];',
      'process.stdout.write(JSON.stringify({ before, after, exitCode: process.exitCode ?? null, build: typeof m.buildProgram }));',
    ].join("\n");
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual({ before: [0, 0], after: [0, 0], exitCode: null, build: "function" });
  });
});
