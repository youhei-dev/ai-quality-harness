import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

    const bytes = Buffer.from(built.text, "utf8");
    atomicWrite(output, bytes);
    summary.output = output;
    summary.bytes = bytes.length;
    summary.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (zipPath !== null) {
      const zip = createStoredZip([{ name: path.basename(output), data: bytes }]);
      atomicWrite(zipPath, zip);
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
    if (err instanceof PacketError || err instanceof ConfigError || err instanceof ZipError || err instanceof InputError) return fail(err.message);
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

/** Write to a temporary file in the same directory, then rename; on failure nothing replaces the target. */
function atomicWrite(target: string, data: Uint8Array): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}
