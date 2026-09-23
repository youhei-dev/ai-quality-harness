import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import path from "node:path";
import { EXIT_ERROR, EXIT_FAILED, EXIT_PASSED } from "../types.ts";
import type { ResolvedSecurity } from "../types.ts";
import { ConfigError, DEFAULT_CONFIG_FILENAME, loadConfig } from "../config/load.ts";
import { maskDeep, maskSecrets } from "../security/mask.ts";
import { escapeRawChars, findRawChars, formatCodePoint } from "../security/raw-chars.ts";
import { DEFAULT_SECURITY, scanString } from "../security/scan.ts";
import { PacketError, buildPacket, type PacketFinding, type PacketOptions } from "../review/packet.ts";
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
   * current directory only when --cwd is not given) if present; never the repository root of a subdirectory.
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
 * invalid UTF-8) and nothing written, 2 = usage / git / size-limit / write error and nothing written
 * (fail closed). Printed lines and JSON go through the masker; findings never include values.
 */
export async function runReviewPacket(options: ReviewPacketOptions): Promise<number> {
  const rawLog = options.log ?? ((line: string) => console.log(line));
  const rawLogError = options.logError ?? ((line: string) => console.error(line));
  // Every printed line and every JSON string goes through the safe display first (M2-1-R1-002), then the masker.
  const log = (line: string): void => rawLog(safeText(line));
  const logError = (line: string): void => rawLogError(safeText(line));
  const summary: JsonSummary = { result: "error", output: null, zip: null, bytes: null, sha256: null, zipSha256: null, from: null, to: null, commits: null, files: null, suppressed: null, findings: [], error: null, backupsRetained: [] };
  const finish = (code: number): number => {
    if (options.json) rawLog(JSON.stringify(maskDeep(escapeDeep(summary)), null, 2));
    return code;
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
  const rejected = (findings: PacketFinding[]): number => {
    summary.result = "findings";
    summary.findings = findings;
    if (!options.json) {
      logError(`aiqh review-packet: ${findings.length} finding(s); no packet written (values are never shown)`);
      for (const f of findings) logError(`  [${f.kind}] ${f.source}${f.line !== null ? `:${f.line}` : ""}${f.location ? ` (${f.location})` : ""}${f.detail ? ` ${f.detail}` : ""} (${f.stage})`);
      logError("REVIEW PACKET: not written (findings)");
    }
    return finish(EXIT_FAILED);
  };

  const cwd = path.resolve(options.cwd ?? process.cwd());
  try {
    // Order (M2-1-R2-007): a detection (exit 1) comes before an error (exit 2) whenever both are known. Only
    // what the check itself needs comes first: the command line (commander) and the security configuration.
    const security = readSecurity(cwd, options.configPath);
    const optionFindings = checkOptionValues(options, cwd, security);
    if (optionFindings.length > 0) return rejected(optionFindings);
    const cwdProblem = rawCharsIn(options.cwd !== undefined ? "--cwd" : "--cwd (current directory)", cwd);
    if (cwdProblem !== null) return fail(cwdProblem);
    const packetOpts: PacketOptions = { cwd, range: options.range, security, toolVersion: options.toolVersion };
    if (options.label !== undefined) packetOpts.label = options.label;
    if (options.request !== undefined) packetOpts.request = readInput(cwd, options.request, options.stdin);
    packetOpts.reviews = (options.review ?? []).map((r) => readInput(cwd, r, options.stdin));
    packetOpts.docs = options.doc ?? [];
    packetOpts.excludes = options.exclude ?? [];
    if (options.maxFileBytes !== undefined) packetOpts.maxFileBytes = options.maxFileBytes;
    if (options.maxPacketBytes !== undefined) packetOpts.maxPacketBytes = options.maxPacketBytes;
    if (options.today !== undefined) packetOpts.today = options.today;

    const built = buildPacket(packetOpts);
    if (!built.ok) return rejected(built.findings);

    const output = path.resolve(cwd, options.output ?? path.join(built.root, "artifacts", "ai-review", `review-packet-${built.label}.md`));
    const entryName = path.basename(output);
    if (options.output === undefined) {
      const nameFindings = valueFindings(entryName, "output file name", security);
      if (nameFindings.length > 0) return rejected(nameFindings);
    }
    const zipWanted = options.zip === true || options.zipOutput !== undefined;
    const zipPath = zipWanted ? path.resolve(cwd, options.zipOutput ?? output.replace(/\.md$/, "") + ".zip") : null;
    for (const [label, p] of [
      ["--output", output],
      ["--zip-output", zipPath],
    ] as const) {
      if (p === null) continue;
      const problem = rawCharsIn(label, p);
      if (problem !== null) return fail(problem);
      if (!OUTPUT_NAME.test(path.basename(p))) return fail(`output file name must be ASCII letters, digits, ".", "_" or "-": ${path.basename(p)}`);
    }
    if (zipPath !== null && targetIdentity(zipPath) === targetIdentity(output)) {
      return fail("--zip-output resolves to the same file as the packet path (compared through symbolic links in the parent directories, ignoring case)");
    }

    // Both contents first, then one two-phase write for both files (M2-1-R1-003).
    const bytes = Buffer.from(built.text, "utf8");
    const zip = zipPath !== null ? createStoredZip([{ name: entryName, data: bytes }]) : null;
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
    summary.from = built.fromSha;
    summary.to = built.toSha;
    summary.commits = built.commits;
    summary.files = built.files.length;
    summary.suppressed = built.suppressed.length;
    if (!options.json) {
      log(`aiqh review-packet — ${built.fromSha.slice(0, 12)}..${built.toSha.slice(0, 12)} (${built.commits} commits, ${built.files.length} changed files)`);
      log(`packet: ${output} (${bytes.length} bytes, sha256 ${summary.sha256})`);
      if (summary.zip) log(`zip:    ${summary.zip} (sha256 ${summary.zipSha256})`);
      if (built.suppressed.length > 0) log(`suppressed by security.allow: ${built.suppressed.length} (listed in the packet's Integrity section)`);
      if (retainedBackups.length > 0) {
        // After the commit point (M2-1-R2-003): the new files are in place; only the old versions remain as well.
        logError(`aiqh review-packet: warning: the packet${summary.zip ? " and the ZIP were" : " was"} written, but ${retainedBackups.length} backup file(s) of the previous version could not be removed:`);
        for (const b of retainedBackups) logError(`  backup file retained at ${b}`);
        log("REVIEW PACKET: written (backup files retained)");
      } else log("REVIEW PACKET: written");
    }
    return finish(EXIT_PASSED);
  } catch (err) {
    if (err instanceof PacketError || err instanceof ConfigError || err instanceof ZipError || err instanceof InputError || err instanceof WriteError) return fail(err.message);
    if (err instanceof Error && "code" in err) return fail(`write failed: ${err.message}`);
    throw err;
  }
}

/** Safe display (forbidden characters, LF, TAB as `\u{...}`), then the masker. */
function safeText(s: string): string {
  return maskSecrets(escapeRawChars(s));
}

/** The same for every string inside a JSON value (before maskDeep). */
function escapeDeep<T>(value: T): T {
  if (typeof value === "string") return escapeRawChars(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => escapeDeep(v)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = escapeDeep(v);
    return out as T;
  }
  return value;
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
 * Option values that end up in the packet or its ZIP, checked for raw characters and secret shapes before git
 * is run and before anything is rendered (M2-1-R2-006). The renderers turn raw characters into ASCII notation,
 * so a value that is not checked here would pass both stages. The packet's file name is the ZIP entry name,
 * which the whole-packet check never sees (M2-1-R2-001). Findings name the option, never the value.
 */
function checkOptionValues(options: ReviewPacketOptions, cwd: string, security: ResolvedSecurity): PacketFinding[] {
  const values: Array<[source: string, value: string]> = [["range", options.range]];
  if (options.label !== undefined) values.push(["label", options.label]);
  (options.exclude ?? []).forEach((g, i) => values.push([`--exclude pattern ${i + 1}`, g]));
  (options.doc ?? []).forEach((d, i) => values.push([`doc path ${i + 1}`, d]));
  if (options.request !== undefined) values.push(["request file name", inputName(cwd, options.request)]);
  (options.review ?? []).forEach((r, i) => values.push([`review file name ${i + 1}`, inputName(cwd, r)]));
  if (options.output !== undefined) values.push(["output file name", path.basename(path.resolve(cwd, options.output))]);
  return values.flatMap(([source, value]) => valueFindings(value, source, security));
}

/** Raw characters and secret shapes in one value; the findings carry `source` and never the value. */
function valueFindings(value: string, source: string, security: ResolvedSecurity): PacketFinding[] {
  const out: PacketFinding[] = [];
  for (const h of findRawChars(value)) out.push({ kind: "raw-char", source, line: h.line, detail: formatCodePoint(h.codePoint), location: null, stage: "input" });
  for (const f of scanString(value, security)) {
    out.push({ kind: f.kind === "oversized-candidate" ? "oversized-candidate" : "secret", source, line: f.line ?? 1, detail: f.category ?? null, location: null, stage: "input" });
  }
  return out;
}

/** The name shown for a --request / --review file (its basename, or "(standard input)" for "-"). */
function inputName(cwd: string, file: string): string {
  return file === "-" ? "(standard input)" : path.basename(path.resolve(cwd, file));
}

class InputError extends Error {
  override readonly name = "InputError";
}

function readInput(cwd: string, file: string, stdin: (() => Buffer) | undefined): { name: string; bytes: Uint8Array } {
  if (file === "-") return { name: inputName(cwd, file), bytes: stdin ? stdin() : readFileSync(0) };
  const abs = path.resolve(cwd, file);
  try {
    return { name: inputName(cwd, file), bytes: readFileSync(abs) };
  } catch (err) {
    throw new InputError(`cannot read ${file}: ${(err as NodeJS.ErrnoException).code ?? "error"}`);
  }
}

/** The `security` section: explicit --config must exist; the default file may be absent (like security-scan). */
function readSecurity(cwd: string, configPath: string | undefined): ResolvedSecurity {
  if (configPath !== undefined) return loadConfig(path.resolve(cwd, configPath)).security;
  const dflt = path.join(cwd, DEFAULT_CONFIG_FILENAME);
  if (!existsSync(dflt)) return DEFAULT_SECURITY;
  return loadConfig(dflt).security;
}

export interface WriteHooks {
  /**
   * Called before each step ("prepare:<label>", "commit:backup:<label>", "commit:install:<label>",
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
 * The file that writing to `p` would replace, for comparing the packet and ZIP targets (M2-1-R2-002): the
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
 * ZIP). The commit point (M2-1-R2-003) is reached when both new files are in place.
 * Before it, a failure runs every rollback action — remove a new file that had no previous one, rename each
 * backup back, remove the temporary files — and collects each action's failure: the error says "the previous
 * files were restored" only when all succeeded, otherwise it lists every file left behind (exit 2).
 * After it, the backups are removed; one that cannot be removed does not undo the write: it is returned as a
 * retained backup (warning, exit 0).
 */
function writeTogether(targets: WriteTarget[], hooks: WriteHooks | undefined): { retainedBackups: string[] } {
  const step = (name: string): void => hooks?.beforeStep?.(name);
  const tmps = new Map<WriteTarget, string>();
  /** Remove the temporary files that still exist; returns the ones that could not be removed. */
  const removeTmps = (): string[] => {
    const left: string[] = [];
    for (const t of tmps.values()) {
      try {
        if (existsSync(t)) rmSync(t, { force: true });
      } catch {
        left.push(t);
      }
    }
    return left;
  };
  try {
    for (const t of targets) {
      step(`prepare:${t.label}`);
      const st = lstatOrNull(t.path);
      if (st !== null && !st.isFile()) throw new WriteError(`${t.label} target exists and is not a regular file: ${t.path}`);
      mkdirSync(path.dirname(t.path), { recursive: true });
      const tmp = siblingName(t.path, "tmp");
      writeFileSync(tmp, t.data, { flag: "wx" });
      tmps.set(t, tmp);
    }
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

function prepareError(err: unknown, leftTmps: string[]): Error {
  const left = leftTmps.length > 0 ? `; temporary file left at ${leftTmps.join(", ")}` : "";
  if (err instanceof WriteError) return left === "" ? err : new WriteError(`${err.message}${left}`);
  return new WriteError(`write failed before any file was replaced (${err instanceof Error ? err.message : String(err)})${left}`);
}
