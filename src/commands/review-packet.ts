import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import path from "node:path";
import { EXIT_ERROR, EXIT_FAILED, EXIT_PASSED } from "../types.ts";
import type { ResolvedSecurity } from "../types.ts";
import { ConfigError, DEFAULT_CONFIG_FILENAME, loadConfig } from "../config/load.ts";
import { maskDeep, maskSecrets } from "../security/mask.ts";
import { escapeRawChars, findRawChars, formatCodePoint } from "../security/raw-chars.ts";
import { DEFAULT_SECURITY } from "../security/scan.ts";
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
  const summary: JsonSummary = { result: "error", output: null, zip: null, bytes: null, sha256: null, zipSha256: null, from: null, to: null, commits: null, files: null, suppressed: null, findings: [], error: null };
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

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const cwdProblem = rawCharsIn(options.cwd !== undefined ? "--cwd" : "--cwd (current directory)", cwd);
  if (cwdProblem !== null) return fail(cwdProblem);
  try {
    const security = readSecurity(cwd, options.configPath);
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
    if (!built.ok) {
      summary.result = "findings";
      summary.findings = built.findings;
      if (!options.json) {
        logError(`aiqh review-packet: ${built.findings.length} finding(s); no packet written (values are never shown)`);
        for (const f of built.findings) logError(`  [${f.kind}] ${f.source}${f.line !== null ? `:${f.line}` : ""}${f.location ? ` (${f.location})` : ""}${f.detail ? ` ${f.detail}` : ""} (${f.stage})`);
        logError("REVIEW PACKET: not written (findings)");
      }
      return finish(EXIT_FAILED);
    }

    const output = path.resolve(cwd, options.output ?? path.join(built.root, "artifacts", "ai-review", `review-packet-${built.label}.md`));
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
    if (zipPath !== null && zipPath === output) return fail("--zip-output must differ from the packet path");

    // Both contents first, then one two-phase write for both files (M2-1-R1-003).
    const bytes = Buffer.from(built.text, "utf8");
    const zip = zipPath !== null ? createStoredZip([{ name: path.basename(output), data: bytes }]) : null;
    const targets: WriteTarget[] = [{ label: "packet", path: output, data: bytes }];
    if (zipPath !== null && zip !== null) targets.push({ label: "zip", path: zipPath, data: zip });
    writeTogether(targets, options.writeHooks);
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
      log("REVIEW PACKET: written");
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

class InputError extends Error {
  override readonly name = "InputError";
}

function readInput(cwd: string, file: string, stdin: (() => Buffer) | undefined): { name: string; bytes: Uint8Array } {
  if (file === "-") return { name: "(standard input)", bytes: stdin ? stdin() : readFileSync(0) };
  const abs = path.resolve(cwd, file);
  try {
    return { name: path.basename(abs), bytes: readFileSync(abs) };
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
  /** Called before each step ("prepare:<label>", "commit:backup:<label>", "commit:install:<label>", "rollback:…"); may throw. */
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
 * ZIP); on success the backups are removed. A failure removes what was newly installed, renames the backups
 * back, and reports the error. If a backup cannot be put back it is kept and its location is reported (exit 2).
 */
function writeTogether(targets: WriteTarget[], hooks: WriteHooks | undefined): void {
  const step = (name: string): void => hooks?.beforeStep?.(name);
  const tmps = new Map<WriteTarget, string>();
  const removeTmps = (): void => {
    for (const t of tmps.values()) if (existsSync(t)) rmSync(t, { force: true });
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
    removeTmps();
    throw prepareError(err);
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
    const kept: string[] = [];
    for (const t of [...installed].reverse()) {
      if (backups.has(t)) continue;
      try {
        step(`rollback:remove:${t.label}`);
        unlinkSync(t.path);
      } catch {
        // a new file without a previous one: leaving it is reported below through the error
      }
    }
    for (const [t, bak] of backups) {
      try {
        step(`rollback:restore:${t.label}`);
        renameSync(bak, t.path);
      } catch {
        kept.push(bak);
      }
    }
    removeTmps();
    const cause = err instanceof Error ? err.message : String(err);
    if (kept.length > 0) {
      throw new WriteError(`write failed (${cause}) and the previous file could not be restored; it is kept at: ${kept.join(", ")}`);
    }
    throw new WriteError(`write failed (${cause}); the previous files were restored`);
  }
  for (const bak of backups.values()) rmSync(bak, { force: true });
}

function prepareError(err: unknown): Error {
  if (err instanceof WriteError) return err;
  return new WriteError(`write failed before any file was replaced (${err instanceof Error ? err.message : String(err)})`);
}
