import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import path from "node:path";
import { EXIT_ERROR, EXIT_FAILED, EXIT_PASSED } from "../types.ts";
import type { ResolvedSecurity } from "../types.ts";
import { ConfigError, loadSecurityConfig } from "../config/load.ts";
import { createOutput } from "../output.ts";
import { findRawChars, formatCodePoint } from "../security/raw-chars.ts";
import { REJECTED, UncheckedValueError, checkValue, type Checked, type Rejected, type ValueFinding } from "../review/checked.ts";
import { DeferredError, InspectionError, decideOutcome } from "../review/outcome.ts";
import { inspectPacket, type PacketFinding, type PacketInspection, type PacketOptions } from "../review/packet.ts";
import { ZipError, createStoredZip } from "../review/zip.ts";

export interface ReviewPacketOptions {
  cwd?: string;
  range: string;
  label?: string;
  output?: string;
  zip?: boolean;
  zipOutput?: string;
  /** File with the human-written request, or "-" for standard input. */
  request?: string;
  review?: string[];
  doc?: string[];
  exclude?: string[];
  maxFileBytes?: number;
  maxPacketBytes?: number;
  /**
   * Config file for the `security` section. Default: `aiqh.config.jsonc` in the --cwd directory (the process's
   * current directory only when --cwd is not given) if it exists; never the repository root of a subdirectory.
   * Read by loadSecurityConfig (shared with security-scan): only a file that does not exist gives the defaults.
   */
  configPath?: string;
  json?: boolean;
  toolVersion: string;
  /** Tests: standard input for `--request -`. */
  stdin?: () => Buffer;
  /** Tests: date for allow-rule expiry. */
  today?: string;
  /** Internal test hook for the two-phase write (M2-1-R1-003); not reachable from the CLI. */
  writeHooks?: WriteHooks;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/** Output file names: ASCII letters, digits, ".", "_", "-" only. */
const OUTPUT_NAME = /^[A-Za-z0-9._-]+$/;

/** The options that src/cli-program.ts registers for review-packet (commander attribute names). */
type OptionName = "range" | "cwd" | "label" | "output" | "zip" | "zipOutput" | "request" | "review" | "doc" | "exclude" | "maxFileBytes" | "maxPacketBytes" | "config" | "json";

interface OptionEntry {
  /**
   * - rendered: the strings of `rendered` go into the packet or its ZIP; they are checked for raw characters and
   *   secret shapes before git runs (finding, exit 1), which is the only way to the Checked values inspectPacket takes
   * - path: a path that is resolved and used, never rendered; a forbidden character in the resolved path is exit 2
   * - config: a file that is read (errors are printed through the safe display)
   * - number / flag: not text
   */
  handling: "rendered" | "path" | "config" | "number" | "flag";
  /** For rendered values: the finding source; a repeatable option's values are numbered (" 1", " 2", …). */
  source?: string;
  repeatable?: boolean;
  rendered?: (o: ReviewPacketOptions, cwd: string) => string[];
}

/**
 * Every option of `aiqh review-packet` and how its value is handled before anything is rendered or written
 * (M2-1 R2, ADR-0014). tests/regression-m2-2-r3-005-option-inventory.test.ts compares the keys with the options
 * of the review-packet Command object that src/cli-program.ts builds (hidden and short-only options and positional
 * arguments included, M2-1-R3-005), so a new input cannot be added without deciding here how its value is checked.
 */
export const OPTION_INVENTORY: Readonly<Record<OptionName, OptionEntry>> = {
  range: { handling: "rendered", source: "range", rendered: (o) => [o.range] },
  label: { handling: "rendered", source: "label", rendered: (o) => (o.label === undefined ? [] : [o.label]) },
  exclude: { handling: "rendered", source: "--exclude pattern", repeatable: true, rendered: (o) => o.exclude ?? [] },
  doc: { handling: "rendered", source: "doc path", repeatable: true, rendered: (o) => o.doc ?? [] },
  request: { handling: "rendered", source: "request file name", rendered: (o, cwd) => (o.request === undefined ? [] : [inputName(cwd, o.request)]) },
  review: { handling: "rendered", source: "review file name", repeatable: true, rendered: (o, cwd) => (o.review ?? []).map((r) => inputName(cwd, r)) },
  // The packet's file name is the ZIP entry name (M2-1-R2-001); its resolved path is also checked as a path (exit 2).
  output: { handling: "rendered", source: "output file name", rendered: (o, cwd) => (o.output === undefined ? [] : [path.basename(path.resolve(cwd, o.output))]) },
  zipOutput: { handling: "path" },
  cwd: { handling: "path" },
  config: { handling: "config" },
  maxFileBytes: { handling: "number" },
  maxPacketBytes: { handling: "number" },
  zip: { handling: "flag" },
  json: { handling: "flag" },
};

interface JsonSummary {
  result: "written" | "findings" | "error";
  output: string | null;
  zip: string | null;
  bytes: number | null;
  sha256: string | null;
  zipSha256: string | null;
  from: string | null;
  to: string | null;
  commits: number | null;
  files: number | null;
  suppressed: number | null;
  findings: PacketFinding[];
  error: string | null;
  /** Backups of the previous packet / ZIP that could not be removed after the commit point (M2-1-R2-003). */
  backupsRetained: string[];
}

/**
 * `aiqh review-packet`: 0 = packet written, 1 = findings (secret-shaped strings, raw characters,
 * invalid UTF-8) and nothing written, 2 = usage / configuration / inspection / deferred / write error and
 * nothing written (fail closed). The order is ADR-0015's (src/review/outcome.ts): an input that cannot be
 * obtained is exit 2 even with findings (listed as incomplete); findings come before the errors that did not
 * stop the inspection. Printed lines and JSON go through the output boundary (src/output.ts: raw characters as ASCII
 * notation, then the masker); findings never include values.
 */
export async function runReviewPacket(options: ReviewPacketOptions): Promise<number> {
  // Every printed line and every JSON string goes through the output boundary (src/output.ts): raw characters, and LF
  // and TAB as well, become ASCII notation, then the masker. One call is one line (M2-1-R1-002; every command's lines
  // since M2-2-R3-001); "escape" makes the JSON's strings escape LF and TAB too, as before.
  const output = createOutput({ log: options.log, logError: options.logError }, "escape");
  const log = output.log;
  const logError = output.error;
  const summary: JsonSummary = { result: "error", output: null, zip: null, bytes: null, sha256: null, zipSha256: null, from: null, to: null, commits: null, files: null, suppressed: null, findings: [], error: null, backupsRetained: [] };
  const finish = (code: number): number => {
    if (options.json) output.json(summary);
    return code;
  };
  const printFindings = (findings: readonly PacketFinding[]): void => {
    for (const f of findings) logError(`  [${f.kind}] ${f.source}${f.line !== null ? `:${f.line}` : ""}${f.location ? ` (${f.location})` : ""}${f.detail ? ` ${f.detail}` : ""} (${f.stage})`);
  };
  const fail = (message: string): number => {
    summary.result = "error";
    summary.error = message;
    if (!options.json) {
      logError(`aiqh review-packet: ${message}`);
      logError("REVIEW PACKET: not written (error)");
    }
    return finish(EXIT_ERROR);
  };
  const rejected = (findings: readonly PacketFinding[]): number => {
    summary.result = "findings";
    summary.findings = [...findings];
    if (!options.json) {
      logError(`aiqh review-packet: ${findings.length} finding(s); no packet written (values are never shown)`);
      printFindings(findings);
      logError("REVIEW PACKET: not written (findings)");
    }
    return finish(EXIT_FAILED);
  };
  /** Inspection impossible (ADR-0015): exit 2, and the findings known so far as an incomplete list. */
  const incomplete = (message: string, findings: readonly PacketFinding[]): number => {
    summary.result = "error";
    summary.error = message;
    summary.findings = [...findings];
    if (!options.json) {
      logError(`aiqh review-packet: ${message}`);
      if (findings.length > 0) {
        logError(`aiqh review-packet: the inspection could not be completed, so this list of ${findings.length} finding(s) is incomplete (values are never shown):`);
        printFindings(findings);
      }
      logError("REVIEW PACKET: not written (error)");
    }
    return finish(EXIT_ERROR);
  };

  const cwd = path.resolve(options.cwd ?? process.cwd());
  try {
    // ADR-0015: the configuration of the check itself comes first (exit 2); then every input is inspected.
    const security = loadSecurityConfig(cwd, options.configPath);
    const opt = checkOptionValues(options, cwd, security);
    const deferred: DeferredError[] = [];
    // A forbidden character in the resolved --cwd does not stop the inspection (reported only without findings).
    const cwdProblem = rawCharsIn(options.cwd !== undefined ? "--cwd" : "--cwd (current directory)", cwd);
    if (cwdProblem !== null) deferred.push(new DeferredError(cwdProblem));

    let inspection: PacketInspection;
    try {
      const packetOpts: PacketOptions = { cwd, range: nth(opt.checked, "range", 0), security, toolVersion: options.toolVersion, findings: opt.findings };
      if (options.label !== undefined) packetOpts.label = nth(opt.checked, "label", 0);
      if (options.request !== undefined) packetOpts.request = { name: nth(opt.checked, "request", 0), bytes: readInput(cwd, options.request, options.stdin) };
      packetOpts.reviews = (options.review ?? []).map((r, i) => ({ name: nth(opt.checked, "review", i), bytes: readInput(cwd, r, options.stdin) }));
      packetOpts.docs = opt.checked.get("doc") ?? [];
      packetOpts.excludes = (options.exclude ?? []).map((pattern, i) => ({ pattern, shown: nth(opt.checked, "exclude", i) }));
      if (options.maxFileBytes !== undefined) packetOpts.maxFileBytes = options.maxFileBytes;
      if (options.maxPacketBytes !== undefined) packetOpts.maxPacketBytes = options.maxPacketBytes;
      if (options.today !== undefined) packetOpts.today = options.today;
      inspection = inspectPacket(packetOpts);
    } catch (err) {
      // inspectPacket's error carries every finding so far (the option findings included); a --request /
      // --review that cannot be read stops before it, with the option findings only.
      if (err instanceof InspectionError) return incomplete(err.message, err.findings.length > 0 ? err.findings : opt.findings);
      throw err;
    }

    const findings = [...inspection.findings];
    deferred.push(...inspection.deferred);
    const out = outputTargets(options, cwd, inspection, opt.checked, security);
    findings.push(...out.findings);
    deferred.push(...out.deferred);
    // Rendered (and checked as a whole) only without findings; the assembled packet can add findings and a size error.
    const rendered = findings.length === 0 ? inspection.render() : null;
    if (rendered !== null) {
      findings.push(...rendered.findings);
      deferred.push(...rendered.deferred);
    }
    const decision = decideOutcome({ inspection: null, findings, deferred });
    if (decision.category === "finding") return rejected(decision.findings);
    if (decision.category === "deferred") return fail(decision.message);
    if (decision.category === "inspection") return incomplete(decision.message, decision.findings);
    const git = inspection.git;
    if (rendered === null || git === null || out.output === null || out.entryName === null) throw new Error("internal: nothing to write without a finding or an error");

    // Both contents first, then one two-phase write for both files (M2-1-R1-003).
    const output = out.output;
    const zipPath = out.zipPath;
    const bytes = Buffer.from(rendered.text, "utf8");
    const zip = zipPath !== null ? createStoredZip([{ name: out.entryName, data: bytes }]) : null;
    const targets: WriteTarget[] = [{ label: "packet", path: output, data: bytes }];
    if (zipPath !== null && zip !== null) targets.push({ label: "zip", path: zipPath, data: zip });
    const { retainedBackups } = writeTogether(targets, options.writeHooks);
    summary.backupsRetained = retainedBackups;
    summary.output = output;
    summary.bytes = bytes.length;
    summary.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (zipPath !== null && zip !== null) {
      summary.zip = zipPath;
      summary.zipSha256 = createHash("sha256").update(zip).digest("hex");
    }
    summary.result = "written";
    summary.from = git.fromSha;
    summary.to = git.toSha;
    summary.commits = git.commits;
    summary.files = git.files.length;
    summary.suppressed = inspection.suppressed.length;
    if (!options.json) {
      log(`aiqh review-packet — ${git.fromSha.slice(0, 12)}..${git.toSha.slice(0, 12)} (${git.commits} commits, ${git.files.length} changed files)`);
      log(`packet: ${output} (${bytes.length} bytes, sha256 ${summary.sha256})`);
      if (summary.zip) log(`zip:    ${summary.zip} (sha256 ${summary.zipSha256})`);
      if (inspection.suppressed.length > 0) log(`suppressed by security.allow: ${inspection.suppressed.length} (listed in the packet's Integrity section)`);
      if (retainedBackups.length > 0) {
        // After the commit point (M2-1-R2-003): the new files are in place; only the old versions remain as well.
        logError(`aiqh review-packet: warning: the packet${summary.zip ? " and the ZIP were" : " was"} written, but ${retainedBackups.length} backup file(s) of the previous version could not be removed:`);
        for (const b of retainedBackups) logError(`  backup file retained at ${b}`);
        log("REVIEW PACKET: written (backup files retained)");
      } else log("REVIEW PACKET: written");
    }
    return finish(EXIT_PASSED);
  } catch (err) {
    if (err instanceof InspectionError) return incomplete(err.message, err.findings);
    if (err instanceof ConfigError || err instanceof ZipError || err instanceof WriteError) return fail(err.message);
    // A value that reached a renderer without the check (M2-1-R3-004): an internal error, reported as review-packet's own.
    if (err instanceof UncheckedValueError) return fail(err.message);
    if (err instanceof Error && "code" in err) return fail(`write failed: ${err.message}`);
    throw err;
  }
}

/**
 * Where the packet and the ZIP go (ADR-0015): the default file name, which becomes the ZIP entry name, is checked
 * like -o's (a finding); a forbidden character in a resolved output path, a name outside [A-Za-z0-9._-] and the
 * same file for both are deferred (the first one found, as before). Nothing when the path cannot be known yet
 * (no -o, and the label has a finding or is <to>'s while the range has a finding). With --label the default path
 * does not depend on the range, so it is checked even when the range has a finding (M2-2-R1-001).
 */
function outputTargets(options: ReviewPacketOptions, cwd: string, inspection: PacketInspection, checked: Map<OptionName, Array<Checked | Rejected>>, security: ResolvedSecurity): { findings: PacketFinding[]; deferred: DeferredError[]; output: string | null; zipPath: string | null; entryName: Checked | null } {
  const findings: PacketFinding[] = [];
  const deferred: DeferredError[] = [];
  let output: string | null = null;
  let entryName: Checked | null = null;
  if (options.output !== undefined) {
    output = path.resolve(cwd, options.output);
    // The ZIP entry name: checked through the inventory for -o (its finding is already reported).
    const name = nth(checked, "output", 0);
    entryName = typeof name === "string" ? name : null;
  } else if (typeof inspection.label === "string") {
    output = path.resolve(cwd, path.join(inspection.root, "artifacts", "ai-review", `review-packet-${inspection.label}.md`));
    const r = checkValue(path.basename(output), security);
    if (r.ok) entryName = r.value;
    else findings.push(...asPacketFindings(r.findings, "output file name"));
  }
  if (output === null) return { findings, deferred, output, zipPath: null, entryName };
  const zipWanted = options.zip === true || options.zipOutput !== undefined;
  const zipPath = zipWanted ? path.resolve(cwd, options.zipOutput ?? output.replace(/\.md$/, "") + ".zip") : null;
  for (const [label, p] of [
    ["--output", output],
    ["--zip-output", zipPath],
  ] as const) {
    if (p === null) continue;
    const problem = rawCharsIn(label, p) ?? (!OUTPUT_NAME.test(path.basename(p)) ? `output file name must be ASCII letters, digits, ".", "_" or "-": ${path.basename(p)}` : null);
    if (problem !== null) {
      deferred.push(new DeferredError(problem));
      return { findings, deferred, output, zipPath, entryName };
    }
  }
  // Early rejection by strings (before any directory is created); the final check is by dev + ino (M2-1-R3-001).
  try {
    if (zipPath !== null && targetIdentity(zipPath) === targetIdentity(output)) {
      deferred.push(new DeferredError("--zip-output resolves to the same file as the packet path (compared through symbolic links in the parent directories, ignoring case)"));
    }
  } catch (err) {
    if (!(err instanceof Error && "code" in err)) throw err;
    deferred.push(new DeferredError(`write failed: ${err.message}`));
  }
  return { findings, deferred, output, zipPath, entryName };
}

/**
 * A resolved path that contains a forbidden character (M2-1-R1-002): the message names the option and
 * the code points only, never the path. LF and TAB are allowed (they are shown as `\u{A}` / `\u{9}`).
 */
function rawCharsIn(option: string, resolved: string): string | null {
  const hits = findRawChars(resolved);
  if (hits.length === 0) return null;
  const codes = [...new Set(hits.map((h) => formatCodePoint(h.codePoint)))].join(", ");
  return `${option}: the resolved path contains ${codes}; choose a path without control, separator or bidi characters`;
}

/**
 * The rendered option values of OPTION_INVENTORY, checked for raw characters and secret shapes before git is
 * run and before anything is rendered (M2-1-R2-006; the packet's file name, which becomes the ZIP entry name,
 * M2-1-R2-001). The renderers turn raw characters into ASCII notation, so a value that is not checked here
 * would pass both stages; inspectPacket takes only the values returned here: Checked, or Rejected for a value
 * with a finding (never passed to git; ADR-0015). Findings name the option, never the value.
 */
function checkOptionValues(options: ReviewPacketOptions, cwd: string, security: ResolvedSecurity): { findings: PacketFinding[]; checked: Map<OptionName, Array<Checked | Rejected>> } {
  const findings: PacketFinding[] = [];
  const checked = new Map<OptionName, Array<Checked | Rejected>>();
  for (const [name, entry] of Object.entries(OPTION_INVENTORY) as Array<[OptionName, OptionEntry]>) {
    if (entry.handling !== "rendered" || entry.rendered === undefined) continue;
    const values = entry.rendered(options, cwd).map((value, i): Checked | Rejected => {
      const r = checkValue(value, security);
      if (r.ok) return r.value;
      findings.push(...asPacketFindings(r.findings, entry.repeatable === true ? `${entry.source ?? name} ${i + 1}` : (entry.source ?? name)));
      return REJECTED;
    });
    checked.set(name, values);
  }
  return { findings, checked };
}

function asPacketFindings(findings: ValueFinding[], source: string): PacketFinding[] {
  return findings.map((f) => ({ kind: f.kind, source, line: f.line, detail: f.detail, location: null, stage: "input" }));
}

/** The i-th checked value of an option (present by construction; a missing one is an internal error). */
function nth(checked: Map<OptionName, Array<Checked | Rejected>>, name: OptionName, i: number): Checked | Rejected {
  const v = checked.get(name)?.[i];
  if (v === undefined) throw new Error(`internal: option ${name} value ${i + 1} was not checked`);
  return v;
}

/** The name shown for a --request / --review file (its basename, or "(standard input)" for "-"). */
function inputName(cwd: string, file: string): string {
  return file === "-" ? "(standard input)" : path.basename(path.resolve(cwd, file));
}

/**
 * The bytes of a --request / --review file (its name is checked through OPTION_INVENTORY, and a finding in the
 * name does not stop the reading: ADR-0015). A file that cannot be read is an InspectionError (exit 2).
 */
function readInput(cwd: string, file: string, stdin: (() => Buffer) | undefined): Uint8Array {
  try {
    if (file === "-") return stdin ? stdin() : readFileSync(0);
    return readFileSync(path.resolve(cwd, file));
  } catch (err) {
    throw new InspectionError(`cannot read ${file === "-" ? "standard input" : file}: ${(err as NodeJS.ErrnoException).code ?? "error"}`);
  }
}

export interface WriteHooks {
  /**
   * Called before each step ("prepare:<label>", "check:same-target", "commit:backup:<label>", "commit:install:<label>",
   * "rollback:remove:<label>", "rollback:restore:<label>", "cleanup:backup:<label>"); may throw.
   */
  beforeStep?: (step: string) => void;
}

interface WriteTarget {
  label: "packet" | "zip";
  path: string;
  data: Uint8Array;
}

class WriteError extends Error {
  override readonly name = "WriteError";
}

/**
 * The file that writing to `p` would replace, for an early rejection of the same packet and ZIP target before
 * anything is created (M2-1-R2-002; the final check is by dev + ino, checkTargetsByIdentity, M2-1-R3-001): the
 * parent directory through realpath (through its nearest existing ancestor when it does not exist yet) plus
 * the basename, in NFC and lower case. Case-only differences are treated as the same file on every file
 * system (a case-insensitive one would write both to one file; rejecting them everywhere is the safe side).
 */
function targetIdentity(p: string): string {
  const rest = [path.basename(p)];
  let dir = path.dirname(p);
  for (;;) {
    try {
      return path.join(realpathSync(dir), ...rest).normalize("NFC").toLowerCase();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const parent = path.dirname(dir);
      if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === dir) throw err;
      rest.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

/** Unused sibling name `.<base>.<kind>-<pid>-<random>` (never an existing file). */
function siblingName(target: string, kind: "tmp" | "bak"): string {
  for (;;) {
    const p = path.join(path.dirname(target), `.${path.basename(target)}.${kind}-${process.pid}-${randomBytes(6).toString("hex")}`);
    if (!existsSync(p)) return p;
  }
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Two-phase write of the packet and the ZIP (M2-1-R1-003), so that they are replaced together or not at all.
 * Prepare: every target must be absent or a regular file; both temporary files are written next to their
 * targets with flag "wx". A failure removes the temporary files; existing files are untouched.
 * Commit: existing targets are renamed to backups, then the new files are renamed into place (packet, then
 * ZIP). Between the phases the targets are checked by file system identity (checkTargetsByIdentity). The commit
 * point (M2-1-R2-003) is reached when both new files are in place.
 * Before it, a failure runs every rollback action — remove a new file that had no previous one, rename each
 * backup back, remove the temporary files — and collects each action's failure: the error says "the previous
 * files were restored" only when all succeeded, otherwise it lists every file left behind (exit 2).
 * After it, the backups are removed; one that cannot be removed does not undo the write: it is returned as a
 * retained backup (warning, exit 0).
 */
function writeTogether(targets: WriteTarget[], hooks: WriteHooks | undefined): { retainedBackups: string[] } {
  const step = (name: string): void => hooks?.beforeStep?.(name);
  const tmps = new Map<WriteTarget, string>();
  /** Remove the temporary files; returns the ones that could not be removed. `force` ignores only ENOENT, so a file that cannot be reached is listed, not taken as absent (backlog 8, P4; ADR-0022). */
  const removeTmps = (): string[] => {
    const left: string[] = [];
    for (const t of tmps.values()) {
      try {
        rmSync(t, { force: true });
      } catch {
        left.push(t);
      }
    }
    return left;
  };
  const parents = new Map<WriteTarget, { dev: number; ino: number }>();
  try {
    for (const t of targets) {
      step(`prepare:${t.label}`);
      const st = lstatOrNull(t.path);
      if (st !== null && !st.isFile()) throw new WriteError(`${t.label} target exists and is not a regular file: ${t.path}`);
      mkdirSync(path.dirname(t.path), { recursive: true });
      // The temporary file goes into the directory as resolved now; its identity is checked again before the commit.
      const dir = realpathSync(path.dirname(t.path));
      const id = statSync(dir);
      parents.set(t, { dev: id.dev, ino: id.ino });
      const tmp = siblingName(path.join(dir, path.basename(t.path)), "tmp");
      writeFileSync(tmp, t.data, { flag: "wx" });
      tmps.set(t, tmp);
    }
    step("check:same-target");
    checkTargetsByIdentity(targets, parents);
  } catch (err) {
    throw prepareError(err, removeTmps());
  }

  const backups = new Map<WriteTarget, string>();
  const installed: WriteTarget[] = [];
  try {
    for (const t of targets) {
      if (lstatOrNull(t.path) === null) continue;
      step(`commit:backup:${t.label}`);
      const bak = siblingName(t.path, "bak");
      renameSync(t.path, bak);
      backups.set(t, bak);
    }
    for (const t of targets) {
      step(`commit:install:${t.label}`);
      renameSync(tmps.get(t) ?? "", t.path);
      tmps.delete(t); // renamed into place: no longer a temporary file
      installed.push(t);
    }
  } catch (err) {
    const left: string[] = [];
    for (const t of [...installed].reverse()) {
      if (backups.has(t)) continue;
      try {
        step(`rollback:remove:${t.label}`);
        unlinkSync(t.path);
      } catch {
        left.push(`new file left at ${t.path}`);
      }
    }
    for (const [t, bak] of backups) {
      try {
        step(`rollback:restore:${t.label}`);
        renameSync(bak, t.path);
      } catch {
        if (installed.includes(t)) left.push(`new file left at ${t.path}`);
        left.push(`previous file could not be restored; it is kept at ${bak} (for ${t.path})`);
      }
    }
    for (const tmp of removeTmps()) left.push(`temporary file left at ${tmp}`);
    const cause = err instanceof Error ? err.message : String(err);
    if (left.length > 0) throw new WriteError(`write failed (${cause}) and could not be fully rolled back: ${left.join("; ")}`);
    throw new WriteError(`write failed (${cause}); the previous files were restored`);
  }

  // Commit point: both new files are in place. Removing the backups can no longer undo the write.
  const retainedBackups: string[] = [];
  for (const [t, bak] of backups) {
    try {
      step(`cleanup:backup:${t.label}`);
      rmSync(bak, { force: true });
    } catch {
      retainedBackups.push(bak);
    }
  }
  return { retainedBackups };
}

/**
 * The same-target check by file system identity (M2-1-R3-001), right before the commit phase: the file system, not
 * a string transformation, decides whether two parent directory names are one directory (APFS treats U+00DF and
 * "ss" as the same name; toLowerCase does not). Each parent must still be the directory the temporary file was
 * written to (dev + ino recorded in the prepare phase), and the packet and the ZIP must not be the same file:
 * parents with the same dev + ino and basenames equal ignoring ASCII case (basenames are ASCII; case-only
 * differences are rejected on every file system, the safe side). Concurrent changes of the output directories by
 * others after this check are outside the trust boundary (ADR-0014).
 */
function checkTargetsByIdentity(targets: WriteTarget[], parents: Map<WriteTarget, { dev: number; ino: number }>): void {
  const ascii = /^[\x21-\x7e]+$/;
  for (const t of targets) {
    const was = parents.get(t);
    const now = statSync(path.dirname(t.path));
    if (was === undefined || now.dev !== was.dev || now.ino !== was.ino) {
      throw new WriteError(`the ${t.label} target's directory changed during the write; nothing was replaced: ${t.path}`);
    }
    if (!ascii.test(path.basename(t.path))) throw new WriteError(`${t.label} file name is not ASCII: ${t.path}`);
  }
  const [a, b] = targets;
  if (a === undefined || b === undefined) return;
  const pa = parents.get(a);
  const pb = parents.get(b);
  if (pa !== undefined && pb !== undefined && pa.dev === pb.dev && pa.ino === pb.ino && path.basename(a.path).toLowerCase() === path.basename(b.path).toLowerCase()) {
    throw new WriteError("--zip-output resolves to the same file as the packet path (same directory by device and inode, file names equal ignoring ASCII case); nothing was replaced");
  }
}

function prepareError(err: unknown, leftTmps: string[]): Error {
  const left = leftTmps.length > 0 ? `; temporary file left at ${leftTmps.join(", ")}` : "";
  if (err instanceof WriteError) return left === "" ? err : new WriteError(`${err.message}${left}`);
  return new WriteError(`write failed before any file was replaced (${err instanceof Error ? err.message : String(err)})${left}`);
}
