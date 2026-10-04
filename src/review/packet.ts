/**
 * Review packet builder (M2-1, ADR-0014). Builds a Markdown packet for an independent reviewer from a
 * commit range, using only facts that git and the verify report record mechanically: the request and
 * previous review supplied by a human, commit messages, the changed-file list, per-file diffs, the full
 * sources at <to>, selected documents and the verify result of <to>. There are no hand-written
 * sections and no conclusion by the implementer.
 *
 * Fail closed: every input is checked for invalid UTF-8, forbidden raw characters (raw-chars.ts) and
 * secret-shaped strings (the shared scanner) before the packet is assembled, and the assembled packet
 * is checked again as a whole. Option values that are rendered are checked by the caller before this
 * module is called (runReviewPacket, M2-1-R2-006). Any finding means no packet (exit 1). Findings carry a
 * source label, a line and a category or code point — never the value or the line content.
 *
 * The inspection goes on to the end when there are findings (ADR-0015, M2-1-R3-002): an input that cannot
 * be obtained is an InspectionError (exit 2, with the findings known so far), an error that does not stop
 * the inspection (a size limit, a --doc that is not a file, …) is a DeferredError (exit 2 only without
 * findings). A value with a finding is Rejected and is never passed to git: the step that needs it is skipped.
 *
 * git is run without a shell (argument arrays), paths are read with -z, contents come from blobs
 * (`git cat-file`), and every option that user or repository configuration could change is given
 * explicitly, so the same range, inputs, aiqh version and git version give the same bytes.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ResolvedSecurity } from "../types.ts";
import { decodeUtf8Strict, findRawChars, formatCodePoint, isForbiddenCodePoint } from "../security/raw-chars.ts";
import { findAllowRule, scanString, type ScanFinding } from "../security/scan.ts";
import { REJECTED, UncheckedValueError, assertChecked, checkValue, settled, type Checked, type Rejected } from "./checked.ts";
import { DeferredError, InspectionError } from "./outcome.ts";

/** Lock files: full source and diff are left out by default (name-status, stat and SHA-256 stay). */
export const LOCK_FILE_NAMES: readonly string[] = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
];

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
export const DEFAULT_MAX_PACKET_BYTES = 4 * 1024 * 1024;
/** `--label`: lower-case letters, digits, "." and "-" only. */
export const LABEL_PATTERN = /^[a-z0-9.-]{1,64}$/;
const SHORT = 12;
const TRAILER = /^(co-authored-by|claude-session):/i;

export type PacketFindingKind = "secret" | "oversized-candidate" | "raw-char" | "invalid-utf8";

/** A reason not to write the packet. Never contains the value or the line content. */
export interface PacketFinding {
  kind: PacketFindingKind;
  /** Where the text came from, e.g. `full source src/a.ts`, `diff src/a.ts`, `commit 1a2b… message`, `request`. */
  source: string;
  /** 1-based line within the source (or within the packet for stage "packet" findings without a source). */
  line: number | null;
  /** Secret category, or the code point ("U+2028") for raw characters. */
  detail: string | null;
  /**
   * For a diff line: the file line it shows — `path:line` in <to>, or `path@from:line` for a removed line
   * that exists only in <from> (M2-1 SP3 #1). Null for other sources and for diff header lines.
   */
  location: string | null;
  /** "input": found while checking one input; "packet": found in the assembled packet. */
  stage: "input" | "packet";
}

export interface Suppression {
  source: string;
  path: string;
  line: number;
  category: string;
  rule: number;
}

/**
 * Options for inspectPacket. The values that are rendered are checked by the caller through the option
 * inventory of runReviewPacket (M2-1 R2): Checked, or Rejected when the value has a finding (ADR-0015) — a
 * Rejected range stops the steps that use it (its form, the refs and everything that depends on <from> / <to>;
 * the work tree, the root, the human inputs and latest.json as far as it does not depend on <to> are still
 * inspected, M2-2-R1-001), a Rejected document is not looked up, a Rejected label is not shape-checked.
 */
export interface PacketOptions {
  /** Directory inside the repository. */
  cwd: string;
  /** `<from>..<to>`. */
  range: Checked | Rejected;
  label?: Checked | Rejected;
  /** Human-written request: file contents (already read) and the name to show. */
  request?: { name: Checked | Rejected; bytes: Uint8Array };
  reviews?: Array<{ name: Checked | Rejected; bytes: Uint8Array }>;
  /** Repository paths whose content at <to> is included in full. */
  docs?: Array<Checked | Rejected>;
  /** `pattern`: the --exclude value as given, matched in memory only; `shown`: the checked value that is rendered. */
  excludes?: Array<{ pattern: string; shown: Checked | Rejected }>;
  maxFileBytes?: number;
  maxPacketBytes?: number;
  security: ResolvedSecurity;
  toolVersion: string;
  /** YYYY-MM-DD used for allow-rule expiry (tests); default today. */
  today?: string;
  /** Findings the caller made before (option values); they come first in the result. */
  findings?: PacketFinding[];
}

export type ChangeKind = "text" | "binary" | "lock" | "excluded" | "submodule" | "deleted";

export interface ChangedFile {
  status: Checked | Rejected;
  path: Checked | Rejected;
  oldPath: Checked | Rejected | null;
  kind: ChangeKind;
  /** The --exclude glob that matched (kind "excluded"). */
  excludedBy: Checked | Rejected | null;
  size: number | null;
  sha256: Checked | Rejected | null;
  added: number | null;
  deleted: number | null;
}

/** What git gave for the range (null in PacketInspection when the range has a finding: the steps that use it did not run). */
export interface PacketGit {
  fromSha: string;
  toSha: string;
  commits: number;
  files: ChangedFile[];
}

/**
 * Everything that was inspected (ADR-0015). The caller adds its own findings and deferred errors, decides
 * (decideOutcome), and calls render only when there is no finding.
 */
export interface PacketInspection {
  findings: PacketFinding[];
  deferred: DeferredError[];
  git: PacketGit | null;
  /** The repository root (known even when the range has a finding: it does not depend on the range, M2-2-R1-001). */
  root: string;
  /** The --label value, or the first 12 hex digits of <to>; null when there is neither. */
  label: Checked | Rejected | null;
  suppressed: Suppression[];
  render: () => PacketRender;
}

export interface PacketRender {
  text: string;
  /** Findings in the assembled packet (stage "packet"). */
  findings: PacketFinding[];
  /** The packet over --max-packet-bytes. */
  deferred: DeferredError[];
}

// ---------------------------------------------------------------------------------------------------
// git

interface GitRun {
  status: number;
  stdout: Buffer;
  stderr: string;
}

/** Environment for git: fixed locale and time zone; no variables that change diff output. */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", TZ: "UTC", GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" };
  delete env.GIT_EXTERNAL_DIFF;
  delete env.GIT_DIFF_OPTS;
  delete env.LANG;
  delete env.LANGUAGE;
  return env;
}

function runGit(cwd: string, args: string[], maxBuffer = 256 * 1024 * 1024): GitRun {
  // core.precomposeunicode=false: paths are used as stored in the tree. With true (the macOS default of
  // `git init`) git turns an NFD pathspec into NFC, the :(literal) pathspec misses the file and its diff
  // comes back empty (M2-1-R1-001).
  const r = spawnSync("git", ["-c", "core.quotePath=true", "-c", "core.precomposeunicode=false", "-c", "diff.suppressBlankEmpty=false", "-c", "diff.noprefix=false", ...args], {
    cwd,
    env: gitEnv(),
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer,
    timeout: 120_000,
    killSignal: "SIGKILL",
  });
  if (r.error) throw new InspectionError(`git could not be run: ${r.error.message}`);
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr.toString("utf8").split("\n")[0] ?? "" };
}

function gitOk(cwd: string, args: string[], what: string, maxBuffer?: number): Buffer {
  const r = runGit(cwd, args, maxBuffer);
  if (r.status !== 0) throw new InspectionError(`${what} failed (git exit ${r.status}): ${r.stderr}`);
  return r.stdout;
}

/**
 * Split git's -z output at NUL bytes, keeping each field as bytes (M2-1-R1-001): paths are decoded
 * strictly by the caller, never with Buffer#toString("utf8"), which would turn invalid bytes into U+FFFD.
 */
function splitZ(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      out.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start));
  return out;
}

/**
 * The message for `git rev-parse --is-inside-work-tree` not answering "true". When git answered "no" (exit 0 with "false",
 * or its own "fatal: not a git repository", the first stderr line under LC_ALL=C) the message is the plain one; any other
 * failure (a refusal such as "dubious ownership", a crash) is not "not a work tree" and keeps git's own words (backlog 8, O3).
 */
function notInsideWorkTree(cwd: string, r: GitRun): string {
  const answered = r.status === 0 || (r.status === 128 && r.stderr.startsWith("fatal: not a git repository"));
  return answered ? `not inside a git work tree: ${cwd}` : `could not tell whether ${cwd} is inside a git work tree (git exit ${r.status}${r.stderr.length > 0 ? `: ${r.stderr}` : ""})`;
}

/**
 * The commit a revision names, and the tag object when the revision is an annotated tag. The revision is read once, to an
 * object name, and the commit is that object's (an object name does not change): the two never come from different states of
 * a ref that moved between the git calls, and a git call that fails is an error, never "no tag object" (backlog 8, P3).
 */
function resolveCommit(root: string, ref: string, side: string): { sha: string; tagObject: string | null } {
  if (ref.length === 0) throw new InspectionError(`--range: the ${side} revision is empty`);
  const doesNotName = (): InspectionError => new InspectionError(`--range: ${side} revision ${JSON.stringify(ref)} does not name a commit`);
  // `rev-parse --verify --quiet` exits 1, silently, for a name that is not valid. Any other status is git failing, not the
  // revision being absent: it keeps git's own words (backlog 8, O3; ADR-0022).
  const failed = (r: GitRun): InspectionError =>
    r.status === 1 ? doesNotName() : new InspectionError(`--range: ${side} revision ${JSON.stringify(ref)} could not be resolved (git exit ${r.status}${r.stderr.length > 0 ? `: ${r.stderr}` : ""})`);
  const named = runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", ref]);
  const obj = named.stdout.toString("utf8").trim();
  if (named.status !== 0) throw failed(named);
  if (obj.length === 0) throw doesNotName();
  const peeled = runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${obj}^{commit}`]);
  if (peeled.status !== 0) throw failed(peeled);
  const sha = peeled.stdout.toString("utf8").trim();
  if (sha.length === 0) throw doesNotName();
  return { sha, tagObject: obj !== sha ? obj : null };
}

// ---------------------------------------------------------------------------------------------------
// rendering helpers

/**
 * Content of an inline code span (M2-1-R1-004, M2-1-R2-005): LF, TAB and backslash become `\\n` `\\t` `\\\\`,
 * a backtick (U+0060) and other control / separator / bidi characters the ASCII notation `\\u{HEX}`. No U+0060 is
 * left (a backslash does not escape inside a CommonMark code span, so `` \\` `` would still close it), so one backtick
 * on each side always delimits the span, and no line break can start a heading or a table row.
 */
function escapeInline(s: string): string {
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    if (cp === 0x0a) out += "\\n";
    else if (cp === 0x09) out += "\\t";
    else if (cp === 0x5c) out += "\\\\";
    else if (cp === 0x60 || cp < 0x20 || isForbiddenCodePoint(cp)) out += `\\u{${cp.toString(16).toUpperCase()}}`;
    else out += c;
  }
  return out;
}

declare const mdBrand: unique symbol;

/** Packet text written by aiqh: fixed text and rendered values (M2-1 R2). Only md and the renderers create it. */
export type Md = string & { readonly [mdBrand]: true };

/**
 * Every Md created in this process (M2-2, M2-1-R3-004): md, joinMd and the Builder accept an interpolated or
 * added string only if it is here, so a string that reached them through `any` or an assertion stops the
 * packet (UncheckedValueError, fail closed) instead of being written.
 */
const issuedMd = new Set<string>();

/** The only place that creates the Md brand (the structure test allows no other; callers: the renderers below). */
function issueMd(text: string): Md {
  issuedMd.add(text);
  return text as Md;
}

/** Run-time proof that `text` was created by md or a renderer (M2-1-R3-004). */
function assertMd(text: Md): Md {
  if (typeof text !== "string" || !issuedMd.has(text)) throw new UncheckedValueError("internal: packet text that was not built by md or a renderer");
  return text;
}

/**
 * Template for packet text (M2-1 R2). Only fixed text, rendered fragments (Md: inlineCode, cellCode,
 * plainOrCode, other md results) and numbers can be interpolated. A string cannot — neither an unchecked one
 * nor a Checked one, which may still hold LF or backticks — so every value goes through a renderer, and a
 * value that bypasses them is a type error, and at run time an UncheckedValueError (M2-1-R3-004). md is used
 * only as a tag: a direct call with a forged strings array is rejected (a tag's strings array is frozen and has `raw`).
 */
export function md(strings: TemplateStringsArray, ...values: ReadonlyArray<Md | number>): Md {
  if (!Object.isFrozen(strings) || !Array.isArray(strings.raw)) throw new UncheckedValueError("internal: md is a template tag");
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += (typeof v === "number" ? String(v) : assertMd(v)) + (strings[i + 1] ?? "");
  });
  return issueMd(out);
}

function joinMd(parts: readonly Md[], separator: Md): Md {
  return issueMd(parts.map(assertMd).join(assertMd(separator)));
}

/** Inline code for paths, globs, file names, labels and other user / JSON strings (also the only dynamic text in headings). */
export function inlineCode(s: Checked): Md {
  return issueMd(`\`${escapeInline(assertChecked(s))}\``);
}

/** Paths are rendered as inline code (kept as a name for the call sites and tests). */
export const renderPath = inlineCode;

/** Inline code inside a table cell: as inlineCode, plus `|` escaped (GFM splits cells before code spans). */
function cellCode(s: Checked): Md {
  return issueMd(`\`${escapeInline(assertChecked(s)).replace(/\|/g, "\\|")}\``);
}

/** Characters shown as plain text: SHAs, versions, times, labels, status letters, `true` / `null`. */
const PLAIN = /^[A-Za-z0-9 ._:+()/-]*$/;

/** A value shown as plain text when it has only PLAIN characters, otherwise as inline code. */
function plainOrCode(s: Checked): Md {
  return PLAIN.test(assertChecked(s)) ? issueMd(s) : inlineCode(s);
}

function fenceFor(content: string): string {
  let longest = 0;
  for (const m of content.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

const LANG: Record<string, string> = {
  ".ts": "ts", ".tsx": "tsx", ".mts": "ts", ".cts": "ts", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx",
  ".json": "json", ".jsonc": "jsonc", ".md": "markdown", ".py": "python", ".yml": "yaml", ".yaml": "yaml",
  ".sh": "sh", ".toml": "toml", ".css": "css", ".html": "html",
};

function langOf(p: string): string {
  return LANG[path.extname(p).toLowerCase()] ?? "text";
}

function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

// ---------------------------------------------------------------------------------------------------
// the packet under construction, with a line → source map for the whole-packet check

/**
 * Maps a 0-based line within a segment to the repository path / line it came from (for allow rules).
 * `side` is set for diff lines: "new" = the line in <to>, "old" = a removed line in <from>.
 */
type LineOrigin = (i: number) => { path: string; line: number; side?: "new" | "old" } | null;

interface Segment {
  startLine: number;
  lines: number;
  source: string;
  origin: LineOrigin | null;
}

class Builder {
  private readonly parts: string[] = [];
  private line = 1;
  readonly segments: Segment[] = [];

  /** Template text (headings, tables written by aiqh), built with md. */
  add(text: Md): void {
    this.push(assertMd(text));
  }

  /** Template text attributed to a source (the Verification section), so that a packet line can be traced back to it. */
  addSource(text: Md, source: string, origin: LineOrigin | null): void {
    this.pushSource(assertMd(text), source, origin);
  }

  /**
   * A fenced block for an input's content (checked by checkText with the allow rules, and again as part of
   * the packet); the fence is longer than any backtick run inside.
   */
  fenced(content: string, lang: string, source: string, origin: LineOrigin | null): void {
    const fence = fenceFor(content);
    this.push(`${fence}${lang}\n`);
    this.pushSource(content, source, origin);
    if (content.length > 0 && !content.endsWith("\n")) this.push("\n");
    this.push(`${fence}\n`);
    if (content.length > 0 && !content.endsWith("\n")) this.push("(no newline at end of file)\n");
  }

  private push(text: string): void {
    this.parts.push(text);
    this.line += (text.match(/\n/g) ?? []).length;
  }

  private pushSource(text: string, source: string, origin: LineOrigin | null): void {
    const lines = lineCount(text);
    this.segments.push({ startLine: this.line, lines, source, origin });
    this.push(text);
  }

  text(): string {
    return this.parts.join("");
  }

  segmentAt(line: number): Segment | null {
    for (const s of this.segments) if (line >= s.startLine && line < s.startLine + s.lines) return s;
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// checks

interface Checker {
  findings: PacketFinding[];
  suppressed: Suppression[];
  security: ResolvedSecurity;
  today: string | undefined;
}

/** Decode strictly; an invalid sequence is a finding and gives null. */
function decode(ck: Checker, bytes: Uint8Array, source: string): string | null {
  const d = decodeUtf8Strict(bytes);
  if (d.ok) return d.text;
  ck.findings.push({ kind: "invalid-utf8", source, line: d.line, detail: null, location: null, stage: "input" });
  return null;
}

/**
 * checkValue for a value that is rendered (M2-1 R2): findings go to `ck` with `source` (and `location`; `line`
 * false leaves the line out, as for paths); a rejected value becomes REJECTED so that checking can go on.
 */
function checkInto(ck: Checker, value: string, source: string, at: { location?: string; line?: false } = {}): Checked | Rejected {
  const r = checkValue(value, ck.security);
  if (r.ok) return r.value;
  for (const f of r.findings) ck.findings.push({ kind: f.kind, source, line: at.line === false ? null : f.line, detail: f.detail, location: at.location ?? null, stage: "input" });
  return REJECTED;
}

/** Raw characters and secret-shaped strings in one input; allow rules use `origin` (repository path / line). */
function checkText(ck: Checker, text: string, source: string, origin: LineOrigin | null, stage: "input" | "packet" = "input"): void {
  const locate = (line: number): string | null => {
    const at = origin ? origin(line - 1) : null;
    if (!at?.side) return null;
    return at.side === "old" ? `${at.path}@from:${at.line}` : `${at.path}:${at.line}`;
  };
  for (const h of findRawChars(text)) ck.findings.push({ kind: "raw-char", source, line: h.line, detail: formatCodePoint(h.codePoint), location: locate(h.line), stage });
  for (const f of scanString(text, ck.security)) {
    const line = f.line ?? 1;
    const at = origin ? origin(line - 1) : null;
    if (at) {
      const probe: ScanFinding = { ...f, file: at.path, line: at.line };
      const rule = findAllowRule(ck.security.allow, probe, ck.today);
      if (rule !== -1) {
        if (stage === "input") ck.suppressed.push({ source, path: at.path, line: at.line, category: f.category ?? f.kind, rule });
        continue;
      }
    }
    ck.findings.push({ kind: f.kind === "oversized-candidate" ? "oversized-candidate" : "secret", source, line, detail: f.category ?? null, location: locate(line), stage });
  }
}

/** Diff line → path / line in the new file (" " and "+") or the old file ("-"); header lines map to nothing. */
function diffOrigin(diff: string, newPath: string, oldPath: string): LineOrigin {
  const map: Array<{ path: string; line: number; side: "new" | "old" } | null> = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const l of diff.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[2]);
      inHunk = true;
      map.push(null);
      continue;
    }
    if (inHunk && l.startsWith("+")) map.push({ path: newPath, line: newLine++, side: "new" });
    else if (inHunk && l.startsWith("-")) map.push({ path: oldPath, line: oldLine++, side: "old" });
    else if (inHunk && l.startsWith(" ")) {
      map.push({ path: newPath, line: newLine++, side: "new" });
      oldLine++;
    } else map.push(null);
  }
  return (i) => map[i] ?? null;
}

// ---------------------------------------------------------------------------------------------------
// build

interface RawChange {
  status: Checked | Rejected;
  path: Checked | Rejected;
  oldPath: Checked | Rejected | null;
  /**
   * The strictly decoded path (null when it is not valid UTF-8). Matched in memory only (--exclude, lock file
   * names, numstat, allow rules); a path with a finding is Rejected and is never passed to git (ADR-0015).
   */
  pathText: string | null;
  oldPathText: string | null;
  /** The path as git gave it (the sort key). */
  pathBytes: Buffer;
  /** `git diff --raw entry N`: names the change in findings and messages when its path is Rejected. */
  where: string;
  oldMode: string;
  newMode: string;
  oldBlob: string;
  newBlob: string;
}

function parseRaw(buf: Buffer, ck: Checker): RawChange[] {
  const parts = splitZ(buf);
  const out: RawChange[] = [];
  for (let i = 0; i < parts.length; ) {
    const meta = (parts[i] ?? Buffer.alloc(0)).toString("latin1");
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/.exec(meta);
    if (!m) throw new InspectionError("unexpected git diff --raw output");
    const letter = m[5] ?? "";
    const where = `git diff --raw entry ${out.length + 1}`;
    const blobs = { oldMode: m[1] ?? "", newMode: m[2] ?? "", oldBlob: m[3] ?? "", newBlob: m[4] ?? "", where };
    if (letter === "R" || letter === "C") {
      const oldPath = decodePath(ck, parts[i + 1], where);
      const newPath = decodePath(ck, parts[i + 2], where);
      out.push({ status: checkInto(ck, `${letter}${m[6] ?? ""}`, "git diff --raw status"), path: newPath.value, pathText: newPath.text, pathBytes: parts[i + 2] ?? Buffer.alloc(0), oldPath: oldPath.value, oldPathText: oldPath.text, ...blobs });
      i += 3;
    } else {
      const p = decodePath(ck, parts[i + 1], where);
      out.push({ status: checkInto(ck, letter, "git diff --raw status"), path: p.value, pathText: p.text, pathBytes: parts[i + 1] ?? Buffer.alloc(0), oldPath: null, oldPathText: null, ...blobs });
      i += 2;
    }
  }
  return out;
}

/**
 * A path from git, decoded strictly (M2-1-R1-001). Invalid UTF-8 is an `invalid-utf8` finding, a valid path
 * with a forbidden raw character (anything of raw-chars.ts; LF and TAB are allowed in paths) is a `raw-char`
 * finding and a secret-shaped path a `secret` finding (M2-1-R2-007: a path is rendered in the metadata, so it
 * is checked like other rendered values), all with the source `path`; the value is never reported. A path with
 * a finding is Rejected (ADR-0015): the inspection goes on, but never with that path as a pathspec.
 */
function decodePath(ck: Checker, bytes: Buffer | undefined, where: string): { value: Checked | Rejected; text: string | null } {
  const d = decodeUtf8Strict(bytes ?? Buffer.alloc(0));
  if (!d.ok) {
    ck.findings.push({ kind: "invalid-utf8", source: "path", line: null, detail: null, location: where, stage: "input" });
    return { value: REJECTED, text: null };
  }
  return { value: checkInto(ck, d.text, "path", { location: where, line: false }), text: d.text };
}

/** Decode -z paths without reporting (numstat keys are only matched against paths already checked). */
function quietPath(bytes: Buffer | undefined): string | null {
  const d = decodeUtf8Strict(bytes ?? Buffer.alloc(0));
  return d.ok ? d.text : null;
}

function parseNumstat(buf: Buffer): Map<string, { added: number | null; deleted: number | null }> {
  const parts = splitZ(buf);
  const out = new Map<string, { added: number | null; deleted: number | null }>();
  for (let i = 0; i < parts.length; ) {
    const field = parts[i] ?? Buffer.alloc(0);
    const t1 = field.indexOf(0x09);
    const t2 = t1 === -1 ? -1 : field.indexOf(0x09, t1 + 1);
    const a = field.subarray(0, t1).toString("latin1");
    const d = field.subarray(t1 + 1, t2).toString("latin1");
    const counts = { added: a === "-" ? null : Number(a), deleted: d === "-" ? null : Number(d) };
    if (t2 === field.length - 1) {
      const p = quietPath(parts[i + 2]);
      if (p !== null) out.set(p, counts);
      i += 3;
    } else {
      const p = quietPath(field.subarray(t2 + 1));
      if (p !== null) out.set(p, counts);
      i += 1;
    }
  }
  return out;
}

const ZERO = /^0+$/;

function blobBytes(root: string, blob: string, size: number): Buffer {
  return gitOk(root, ["cat-file", "blob", blob], `reading blob ${blob.slice(0, SHORT)}`, size + 1024 * 1024);
}

function blobSize(root: string, blob: string): number {
  return Number(gitOk(root, ["cat-file", "-s", blob], `sizing blob ${blob.slice(0, SHORT)}`).toString("utf8").trim());
}

const DIFF_FLAGS = [
  "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--text", "--no-relative", "--diff-algorithm=myers", "--indent-heuristic",
  "-U3", "--inter-hunk-context=0", "--src-prefix=a/", "--dst-prefix=b/", "--full-index", "-M50%",
];

function utcIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(".000Z", "Z");
}

/** Committer time of a commit, from the raw object (only the timestamp is used; no names or e-mail addresses). */
function committerTime(rawCommit: Buffer): string | null {
  const head = rawCommit.toString("latin1").split("\n\n")[0] ?? "";
  const m = /^committer .* (\d+) [+-]\d{4}$/m.exec(head);
  return m ? utcIso(Number(m[1])) : null;
}

function commitMessage(rawCommit: Buffer): Buffer {
  const sep = rawCommit.indexOf("\n\n");
  return sep === -1 ? Buffer.alloc(0) : rawCommit.subarray(sep + 2);
}

function stripTrailers(message: string): string {
  const kept = message.split("\n").filter((l) => !TRAILER.test(l));
  while (kept.length > 0 && (kept[kept.length - 1] ?? "").trim() === "") kept.pop();
  return kept.join("\n");
}

/**
 * Inspect everything a packet would contain (ADR-0015): all paths, contents, commit messages, human inputs,
 * documents and the verify result, to the end even when there are findings. Returns the findings (the caller's
 * first), the deferred errors and a render function for the case without findings. Throws InspectionError, with
 * the findings known so far, when an input that must be inspected cannot be obtained.
 */
export function inspectPacket(opts: PacketOptions): PacketInspection {
  const ck: Checker = { findings: [...(opts.findings ?? [])], suppressed: [], security: opts.security, today: opts.today };
  try {
    return inspect(opts, ck);
  } catch (err) {
    if (err instanceof InspectionError) err.findings = [...ck.findings];
    throw err;
  }
}

/** The request and previous reviews (already read by the caller): decoded and checked. */
function checkHumanInputs(ck: Checker, opts: PacketOptions): { request: { name: Checked | Rejected; text: string | null } | null; reviews: Array<{ name: Checked | Rejected; text: string | null; source: string }> } {
  const request = opts.request ? { name: opts.request.name, text: decode(ck, opts.request.bytes, "request") } : null;
  if (request?.text) checkText(ck, request.text, "request", null);
  const reviews = (opts.reviews ?? []).map((r, i) => {
    // A review name with a finding is not part of a finding source (the source names the option instead).
    const source = typeof r.name === "string" ? `review ${r.name}` : `review ${i + 1}`;
    const text = decode(ck, r.bytes, source);
    if (text !== null) checkText(ck, text, source, null);
    return { name: r.name, text, source };
  });
  return { request, reviews };
}

function inspect(opts: PacketOptions, ck: Checker): PacketInspection {
  const maxFile = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxPacket = opts.maxPacketBytes ?? DEFAULT_MAX_PACKET_BYTES;
  if (!Number.isSafeInteger(maxFile) || maxFile < 1) throw new InspectionError("--max-file-bytes must be a positive integer");
  if (!Number.isSafeInteger(maxPacket) || maxPacket < 1) throw new InspectionError("--max-packet-bytes must be a positive integer");
  // Errors that do not stop the inspection: reported only when there is no finding (ADR-0015).
  const deferred: DeferredError[] = [];
  // An invalid --label is deferred; a label with a finding is not shape-checked (its finding stands for it).
  if (typeof opts.label === "string" && !LABEL_PATTERN.test(opts.label)) {
    deferred.push(new DeferredError("--label may contain only lower-case letters, digits, \".\" and \"-\" (1-64 characters)"));
  }
  const range = opts.range;
  // The form of a range with a finding is not checked (its finding stands for it, as for --label).
  const m = typeof range === "string" ? /^(.*?)\.\.(.*)$/.exec(range) : null;
  if (typeof range === "string" && (!m || range.includes("..."))) throw new InspectionError("--range must have the form <from>..<to>");

  // The work tree and its root do not depend on the range: they are inspected even when it has a finding (M2-2-R1-001).
  const inside = runGit(opts.cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.toString("utf8").trim() !== "true") throw new InspectionError(notInsideWorkTree(opts.cwd, inside));
  const root = gitOk(opts.cwd, ["rev-parse", "--show-toplevel"], "finding the repository root").toString("utf8").trim();

  /** A value aiqh derives (SHA, hash, version, time) is checked like any other rendered value (M2-1 R2). */
  const derived = (value: string): Checked | Rejected => checkInto(ck, value, "packet metadata");

  if (typeof range !== "string" || !m) {
    // The range has a finding (m is null only then): the steps that use it — its refs and everything that depends on
    // <from> / <to> — are blocked by that finding and never get its value (ADR-0015 §3). What does not depend on the
    // range is still inspected, in the order of the full inspection: the human inputs, latest.json up to the point
    // where it would be matched against <to>, and the derived values that do not come from the range.
    checkHumanInputs(ck, opts);
    readLatest(ck, root, deferred);
    derived(opts.toolVersion);
    derived(gitOk(root, ["--version"], "git --version").toString("utf8").trim());
    return {
      findings: ck.findings,
      deferred,
      git: null,
      root,
      label: opts.label ?? null,
      suppressed: ck.suppressed,
      render: () => {
        throw new UncheckedValueError("internal: a packet without git (the range has a finding) cannot be rendered");
      },
    };
  }

  // Resolve both ends once; everything below uses the SHAs only.
  const from = resolveCommit(root, m[1] ?? "", "from");
  const to = resolveCommit(root, m[2] ?? "", "to");
  const anc = runGit(root, ["merge-base", "--is-ancestor", from.sha, to.sha]);
  if (anc.status === 1) throw new InspectionError(`--range: ${from.sha.slice(0, SHORT)} is not an ancestor of ${to.sha.slice(0, SHORT)}`);
  if (anc.status !== 0) throw new InspectionError(`--range: ancestry check failed: ${anc.stderr}`);
  const commits = gitOk(root, ["rev-list", "--reverse", "--topo-order", `${from.sha}..${to.sha}`], "listing commits").toString("utf8").split("\n").filter((l) => l.length > 0);
  if (commits.length === 0) throw new InspectionError("--range contains no commits");

  const label = opts.label ?? derived(to.sha.slice(0, SHORT));
  // Option values that are rendered (range, label, globs, documents, file names) were checked by the caller
  // before this function was called (M2-1-R2-006); a glob is matched as given, in memory only.
  const excludes = opts.excludes ?? [];
  const matchExclude = (p: string | null): Checked | Rejected | null => (p === null ? null : (excludes.find((g) => path.matchesGlob(p, g.pattern))?.shown ?? null));

  // ---- paths first (M2-1-R2-007): every path of the changed-file list and of each commit's file list is
  // decoded and checked. A path with a finding is Rejected and never becomes a pathspec; the inspection goes
  // on (ADR-0015: an input that cannot be obtained later is still an error, exit 2).
  const raw = parseRaw(gitOk(root, ["diff", "--raw", "-z", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--no-relative", "-M50%", from.sha, to.sha], "listing changes"), ck);
  const commitFiles = new Map<string, Array<Checked | Rejected>>();
  for (const sha of commits) {
    const parents = gitOk(root, ["rev-list", "--parents", "-n", "1", sha], "reading parents").toString("utf8").trim().split(" ").slice(1);
    const treeArgs = parents.length === 0 ? ["diff-tree", "-r", "-z", "--name-only", "--no-renames", "--no-commit-id", "--root", sha] : ["diff-tree", "-r", "-z", "--name-only", "--no-renames", "--no-commit-id", parents[0] ?? "", sha];
    commitFiles.set(sha, splitZ(gitOk(root, treeArgs, "listing commit files")).map((p, k) => decodePath(ck, p, `commit ${sha.slice(0, SHORT)} file list entry ${k + 1}`).value));
  }

  // ---- changes (two-point tree comparison from..to)
  const numstat = parseNumstat(gitOk(root, ["diff", "--numstat", "-z", "--text", "--no-ext-diff", "--no-textconv", "--no-relative", "-M50%", from.sha, to.sha], "counting changes"));
  raw.sort((a, b) => Buffer.compare(a.pathBytes, b.pathBytes));

  interface Prepared {
    file: ChangedFile;
    content: string | null;
    diff: string | null;
  }
  const prepared: Prepared[] = [];
  const tooLarge: string[] = [];
  for (const r of raw) {
    const deleted = r.status === "D";
    // A Rejected path is named by its entry in sources and messages, never by its value.
    const name = typeof r.path === "string" ? r.path : `(path of ${r.where})`;
    const oldName = r.oldPath === null ? name : typeof r.oldPath === "string" ? r.oldPath : `(previous path of ${r.where})`;
    const counts = (r.pathText !== null ? numstat.get(r.pathText) : undefined) ?? { added: null, deleted: null };
    const file: ChangedFile = { status: r.status, path: r.path, oldPath: r.oldPath, kind: "text", excludedBy: null, size: null, sha256: null, added: counts.added, deleted: counts.deleted };
    const blob = deleted ? r.oldBlob : r.newBlob;
    const mode = deleted ? r.oldMode : r.newMode;
    const excludedBy = matchExclude(r.pathText) ?? (r.oldPath !== null ? matchExclude(r.oldPathText) : null);
    // The displayed side decides (M2-1-R1-005): the old mode for a deletion, otherwise the new mode.
    if (mode === "160000") {
      file.kind = "submodule";
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    if (excludedBy !== null) {
      // Content is neither checked nor shown; only the blob's size and SHA-256 are recorded (M2-1 SP3 #6).
      file.kind = "excluded";
      file.excludedBy = excludedBy;
      file.size = blobSize(root, blob);
      file.sha256 = derived(sha256(blobBytes(root, blob, file.size)));
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const size = blobSize(root, blob);
    file.size = size;
    const isLock = r.pathText !== null && LOCK_FILE_NAMES.includes(path.posix.basename(r.pathText));
    // A gitlink on the old side (submodule -> file) points to a commit, not a blob: that side is empty.
    const oldIsBlob = !ZERO.test(r.oldBlob) && !deleted && r.oldMode !== "160000";
    const oldSize = oldIsBlob ? blobSize(root, r.oldBlob) : 0;
    if (!isLock && (size > maxFile || oldSize > maxFile)) {
      tooLarge.push(`${name} (${Math.max(size, oldSize)} bytes)`);
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const bytes = blobBytes(root, blob, size);
    file.sha256 = derived(sha256(bytes));
    if (isLock) {
      file.kind = "lock";
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const oldBytes = oldIsBlob ? blobBytes(root, r.oldBlob, oldSize) : Buffer.alloc(0);
    if (bytes.includes(0) || oldBytes.includes(0)) {
      file.kind = "binary";
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    // No NUL: the file is text and must be valid UTF-8 (invalid ⇒ finding, exit 1; --exclude to leave it out).
    const text = decode(ck, bytes, deleted ? `deleted file ${name}` : `full source ${name}`);
    const oldText = oldBytes.length > 0 ? decode(ck, oldBytes, `previous version of ${oldName}`) : "";
    if (text === null || oldText === null) {
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    if (deleted) file.kind = "deleted";
    if (typeof r.path !== "string" || (r.oldPath !== null && typeof r.oldPath !== "string")) {
      // The path has a finding: no pathspec is built from it (blocked by that finding). The content, read by
      // blob id, is still checked; allow rules see the decoded path in memory only.
      if (!deleted) checkText(ck, text, `full source ${name}`, (i) => ({ path: r.pathText ?? "", line: i + 1 }));
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const checkedPath = r.path;
    const pathspec = [`:(literal)${checkedPath}`, ...(r.oldPath !== null ? [`:(literal)${r.oldPath}`] : [])];
    const diffBytes = gitOk(root, [...DIFF_FLAGS, from.sha, to.sha, "--", ...pathspec], `diff of ${checkedPath}`);
    // A changed file always has a diff header at least (mode-only changes, pure renames and empty files
    // included), so an empty diff means the pathspec missed the file: never write a packet without it.
    if (diffBytes.length === 0) throw new InspectionError(`git diff returned nothing for the changed file ${checkedPath} (status ${typeof r.status === "string" ? r.status : "?"}); nothing written`);
    const diff = decode(ck, diffBytes, `diff ${checkedPath}`);
    prepared.push({ file, content: deleted ? null : text, diff });
    if (!deleted) checkText(ck, text, `full source ${checkedPath}`, (i) => ({ path: checkedPath, line: i + 1 }));
    if (diff !== null) checkText(ck, diff, `diff ${checkedPath}`, diffOrigin(diff, checkedPath, r.oldPath ?? checkedPath));
  }
  if (tooLarge.length > 0) {
    deferred.push(new DeferredError(`changed file larger than --max-file-bytes (${maxFile}): ${tooLarge.join(", ")}; raise the limit or leave it out with --exclude`));
  }

  // ---- commits
  interface CommitInfo {
    sha: string;
    full: Checked | Rejected;
    short: Checked | Rejected;
    subject: Checked | Rejected;
    message: string;
    files: Array<Checked | Rejected>;
  }
  const commitInfos: CommitInfo[] = [];
  for (const sha of commits) {
    const rawCommit = gitOk(root, ["cat-file", "commit", sha], `reading commit ${sha.slice(0, SHORT)}`);
    const source = `commit ${sha.slice(0, SHORT)} message`;
    const decoded = decode(ck, commitMessage(rawCommit), source);
    const message = decoded === null ? "" : stripTrailers(decoded);
    const before = ck.findings.length;
    if (decoded !== null) checkText(ck, message, source, null);
    // The subject is rendered in a table: Checked on its own, but only when the message had no finding (no duplicate).
    const subject = decoded !== null && ck.findings.length === before ? checkInto(ck, message.split("\n")[0] ?? "", source) : REJECTED;
    commitInfos.push({ sha, full: derived(sha), short: derived(sha.slice(0, SHORT)), subject, message, files: commitFiles.get(sha) ?? [] });
  }

  // ---- human inputs and documents
  const { request, reviews } = checkHumanInputs(ck, opts);
  const docs: Array<{ path: Checked; text: string | null }> = [];
  for (const d of opts.docs ?? []) {
    // A document path with a finding is not looked up (blocked by that finding).
    if (typeof d !== "string") continue;
    const ls = splitZ(gitOk(root, ["ls-tree", "-z", to.sha, "--", `:(literal)${d}`], `looking up --doc ${d}`)).map((e) => quietPath(e) ?? "");
    const entry = ls.find((e) => e.endsWith(`\t${d}`));
    const em = entry ? /^(\d{6}) blob ([0-9a-f]+)\t/.exec(entry) : null;
    if (!em) {
      deferred.push(new DeferredError(`--doc ${JSON.stringify(d)} is not a file at ${to.sha.slice(0, SHORT)}`));
      continue;
    }
    const blob = em[2] ?? "";
    const size = blobSize(root, blob);
    if (size > maxFile) {
      deferred.push(new DeferredError(`--doc ${d} is larger than --max-file-bytes (${size} > ${maxFile})`));
      continue;
    }
    const text = decode(ck, blobBytes(root, blob, size), `doc ${d}`);
    if (text !== null) checkText(ck, text, `doc ${d}`, (i) => ({ path: d, line: i + 1 }));
    docs.push({ path: d, text });
  }

  // ---- verify result of <to> (only when latest.json belongs to <to> and a clean tree)
  const verification = verificationFor(ck, readLatest(ck, root, deferred), to.sha, deferred);

  // ---- the other values that are rendered, derived by aiqh (checked like the rest; M2-1 R2)
  const toCommit = gitOk(root, ["cat-file", "commit", to.sha], "reading <to>");
  const meta = {
    range: derived(`${from.sha.slice(0, SHORT)}..${to.sha.slice(0, SHORT)}`),
    from: derived(from.sha),
    fromTag: from.tagObject !== null ? derived(from.tagObject) : null,
    to: derived(to.sha),
    toTag: to.tagObject !== null ? derived(to.tagObject) : null,
    toShort: derived(to.sha.slice(0, SHORT)),
    time: derived(committerTime(toCommit) ?? "unknown"),
    tool: derived(opts.toolVersion),
    git: derived(gitOk(root, ["--version"], "git --version").toString("utf8").trim()),
  };
  const suppressed = ck.suppressed.map((s) => ({ source: derived(s.source), path: derived(s.path), category: derived(s.category), line: s.line, rule: s.rule }));
  const files = prepared.map((p) => p.file);

  // ---- assemble (only without findings): only md, the renderers and numbers (M2-1 R2); every value is settled
  // (Checked) here, and a Rejected one would be an internal error.
  const render = (): PacketRender => {
    const S = settled;
    const b = new Builder();
    const dash = md`-`;
    const KIND: Record<ChangeKind, Md> = { text: md`text`, binary: md`binary`, lock: md`lock`, excluded: md`excluded`, submodule: md`submodule`, deleted: md`deleted` };
    const L = S(label);
    b.add(md`# Review Packet — ${plainOrCode(L)}\n\n`);
    b.add(md`## Metadata\n\n`);
    b.add(md`- Range: ${inlineCode(S(meta.range))} (commits in \`from..to\`; changes = \`git diff <from> <to>\`, a two-point tree comparison)\n`);
    b.add(md`- Range as given: ${renderPath(range)} (resolved once to the SHAs below)\n`);
    b.add(md`- From: commit ${inlineCode(S(meta.from))}${meta.fromTag !== null ? md` (tag object ${inlineCode(S(meta.fromTag))})` : md``}\n`);
    b.add(md`- To: commit ${inlineCode(S(meta.to))}${meta.toTag !== null ? md` (tag object ${inlineCode(S(meta.toTag))})` : md``}\n`);
    b.add(md`- Committer time of <to>: ${plainOrCode(S(meta.time))} (UTC)\n`);
    b.add(md`- Commits: ${commits.length}; changed files: ${files.length}\n`);
    b.add(md`- Generated by: aiqh ${plainOrCode(S(meta.tool))}; ${plainOrCode(S(meta.git))}\n`);
    b.add(md`- Options: label ${inlineCode(L)}; max file bytes ${maxFile}; max packet bytes ${maxPacket}`);
    b.add(excludes.length > 0 ? md`; excludes ${joinMd(excludes.map((g) => inlineCode(S(g.shown))), md`, `)}` : md`; excludes none`);
    b.add(md`; documents ${docs.length}; request ${request ? md`given` : md`none`}; previous reviews ${reviews.length}\n\n`);
    b.add(md`This packet contains no conclusion by the implementer about correctness. It holds the request and previous reviews as supplied by\n`);
    b.add(md`a human, the commit messages, the changed-file list, per-file diffs, the full sources at <to>, selected documents and the verify\n`);
    b.add(md`result that \`aiqh verify\` recorded for <to>. **Commit messages are written by the implementer (possibly an AI) and may contain its\n`);
    b.add(md`explanations.** Every input was checked for invalid UTF-8, raw control / separator / bidi characters and secret-shaped strings.\n\n`);

    b.add(md`# Request\n\n`);
    if (request !== null && request.text !== null) {
      b.add(md`Supplied by a human (${inlineCode(S(request.name))}), verbatim:\n\n`);
      b.fenced(request.text, "markdown", "request", null);
    } else b.add(md`Not supplied.\n`);
    b.add(md`\n# Previous Reviews\n\n`);
    if (reviews.length === 0) b.add(md`None supplied.\n`);
    for (const r of reviews) {
      b.add(md`## ${inlineCode(S(r.name))}\n\n`);
      b.fenced(r.text ?? "", "markdown", r.source, null);
      b.add(md`\n`);
    }

    b.add(md`\n# Commits\n\n\`git rev-list --reverse --topo-order <from>..<to>\`. Messages without Co-Authored-By / Claude-Session trailers.\n\n`);
    b.add(md`| # | Commit | Subject | Files |\n|---|---|---|---|\n`);
    commitInfos.forEach((c, i) => b.add(md`| ${i + 1} | ${inlineCode(S(c.short))} | ${cellCode(S(c.subject))} | ${c.files.length} |\n`));
    for (const c of commitInfos) {
      b.add(md`\n## ${plainOrCode(S(c.full))}\n\nFiles: ${c.files.length === 0 ? md`none` : joinMd(c.files.map((f) => renderPath(S(f))), md`, `)}\n\n`);
      b.fenced(c.message, "text", `commit ${c.sha.slice(0, SHORT)} message`, null);
    }

    b.add(md`\n# Changed Files\n\n\`git diff --raw -M50% <from> <to>\`, sorted by path. Kinds: text (full source and diff below), deleted (diff only),\n`);
    b.add(md`binary (contains NUL; not shown), lock (not shown), excluded (by --exclude; not shown), submodule (not shown).\n\n`);
    b.add(md`| # | Status | Path | Previous path | Kind | Bytes | + | - |\n|---|---|---|---|---|---|---|---|\n`);
    files.forEach((f, i) => {
      const status = S(f.status);
      const kind = md`${f.kind === "excluded" && f.excludedBy !== null ? md`excluded (${cellCode(S(f.excludedBy))})` : KIND[f.kind]}${status === "T" ? md` (type change)` : md``}`;
      const shown = f.kind === "text" || f.kind === "deleted";
      const added = shown ? (f.added ?? dash) : dash;
      const removed = shown ? (f.deleted ?? dash) : dash;
      b.add(md`| ${i + 1} | ${plainOrCode(status)} | ${cellCode(S(f.path))} | ${f.oldPath !== null ? cellCode(S(f.oldPath)) : md``} | ${kind} | ${f.size ?? dash} | ${added} | ${removed} |\n`);
    });

    b.add(md`\n# Diff\n\nPer file: \`git diff --text --diff-algorithm=myers -U3 --full-index -M50% <from> <to> -- <path>\`.\n`);
    for (const p of prepared) {
      const filePath = S(p.file.path);
      b.add(md`\n## ${renderPath(filePath)}\n\n`);
      if (p.diff !== null) b.fenced(p.diff, "diff", `diff ${filePath}`, diffOrigin(p.diff, filePath, p.file.oldPath !== null ? S(p.file.oldPath) : filePath));
      else b.add(md`Not shown (${KIND[p.file.kind]}).\n`);
    }

    b.add(md`\n# Full Source of Changed Files\n\nContent at <to> of every changed text file (deleted, binary, lock, excluded and submodule entries have none).\n`);
    for (const p of prepared) {
      if (p.content === null) continue;
      const filePath = S(p.file.path);
      b.add(md`\n## ${renderPath(filePath)} (${lineCount(p.content)} lines)\n\n`);
      b.fenced(p.content, langOf(filePath), `full source ${filePath}`, (i) => ({ path: filePath, line: i + 1 }));
    }

    b.add(md`\n# Documents\n\n`);
    if (docs.length === 0) b.add(md`None selected (--doc).\n`);
    for (const d of docs) {
      b.add(md`## ${renderPath(d.path)} (at ${inlineCode(S(meta.toShort))})\n\n`);
      b.fenced(d.text ?? "", langOf(d.path), `doc ${d.path}`, (i) => ({ path: d.path, line: i + 1 }));
      b.add(md`\n`);
    }

    b.add(md`\n# Verification\n\n`);
    b.addSource(renderVerification(verification), "verification (artifacts/verification/latest.json)", null);

    b.add(md`\n# Integrity\n\nSHA-256 of the blob at <to> (or at <from> for deleted files).\n\n| Path | Bytes | SHA-256 |\n|---|---|---|\n`);
    for (const f of files) b.add(md`| ${cellCode(S(f.path))} | ${f.size ?? dash} | ${f.sha256 !== null ? plainOrCode(S(f.sha256)) : dash} |\n`);
    b.add(md`\nChecks before writing: invalid UTF-8 0, raw characters 0, secret-shaped strings 0 (after security.allow). Suppressed by security.allow: ${suppressed.length}.\n`);
    for (const s of suppressed) b.add(md`- ${inlineCode(S(s.source))} → ${inlineCode(S(s.path))}:${s.line} ${inlineCode(S(s.category))} by rule #${s.rule + 1}\n`);

    const text = b.text();

    // ---- whole-packet check (stage 2)
    const packetCk: Checker = { findings: [], suppressed: [], security: opts.security, today: opts.today };
    const originOf: LineOrigin = (i) => {
      const seg = b.segmentAt(i + 1);
      return seg?.origin ? seg.origin(i + 1 - seg.startLine) : null;
    };
    checkText(packetCk, text, "packet", originOf, "packet");
    const findings = packetCk.findings.map((f) => {
      const seg = f.line !== null ? b.segmentAt(f.line) : null;
      return seg ? { ...f, source: seg.source, line: (f.line ?? seg.startLine) - seg.startLine + 1 } : { ...f, source: "packet template", line: f.line };
    });
    const bytes = Buffer.byteLength(text, "utf8");
    const tooBig = bytes > maxPacket ? [new DeferredError(`the packet would be ${bytes} bytes, more than --max-packet-bytes (${maxPacket}); nothing written`)] : [];
    return { text, findings, deferred: tooBig };
  };

  return { findings: ck.findings, deferred, git: { fromSha: from.sha, toSha: to.sha, commits: commits.length, files }, root, label, suppressed: ck.suppressed, render };
}

/** The verify result of <to>, as checked values (rendered by renderVerification only when there is no finding). */
type Verification =
  | { kind: "absent" }
  /** Nothing is shown: invalid UTF-8 or a value with a finding (a finding says why), or not JSON / another shape (deferred). */
  | { kind: "none" }
  | { kind: "other"; commit: Checked | Rejected | null; dirty: Checked | Rejected }
  | {
      kind: "result";
      toShort: Checked | Rejected;
      verdict: Checked | Rejected;
      exitCode: Checked | Rejected;
      tool: Checked | Rejected;
      startedAt: Checked | Rejected;
      finishedAt: Checked | Rejected;
      checks: Array<Record<"name" | "kind" | "required" | "status" | "exitCode" | "durationMs", Checked | Rejected>>;
    };

/**
 * The part of latest.json that is rendered for <to> (M2-1-R3-003): objects where properties are read, values of
 * any type (they are rendered with String). A report of another shape is not rendered (deferred error).
 */
const U = z.unknown().optional();
const RENDERED_REPORT = z.object({
  verdict: U,
  exitCode: U,
  startedAt: U,
  finishedAt: U,
  tool: z.object({ name: U, version: U }).nullish(),
  checks: z.array(z.object({ name: U, kind: U, required: U, status: U, exitCode: U, durationMs: U })).nullish(),
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VERIFICATION_SOURCE = "verification (artifacts/verification/latest.json)";

/** latest.json as far as it can be inspected without <to>: absent, nothing to show (a finding or a deferred error says why), or parsed. */
type Latest = { kind: "absent" } | { kind: "none" } | { kind: "parsed"; text: string; value: unknown };

/**
 * The part of the verify result that does not depend on the range (M2-2-R1-001: also inspected when the range has a
 * finding). latest.json that does not exist (ENOENT) is "absent"; one that cannot be read for any other reason is an
 * InspectionError (exit 2 even with findings); invalid UTF-8 is a finding; text that is not JSON is checked whole
 * for raw characters and secret shapes and is then a deferred error (M2-1-R3-003: a finding in it is reported, exit 1).
 */
function readLatest(ck: Checker, root: string, deferred: DeferredError[]): Latest {
  const file = path.join(root, "artifacts", "verification", "latest.json");
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (err) {
    // Only ENOENT (the file or a parent directory does not exist) is "absent" (M2-2-R1-007): a file behind a parent
    // that cannot be traversed (EACCES), a parent that is a file (ENOTDIR), a symbolic link loop (ELOOP) or a
    // directory (EISDIR) cannot be inspected. existsSync() folded all of them into "does not exist".
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "absent" };
    throw new InspectionError(`cannot read artifacts/verification/latest.json: ${code ?? "error"}`);
  }
  const decoded = decode(ck, bytes, VERIFICATION_SOURCE);
  if (decoded === null) return { kind: "none" };
  try {
    return { kind: "parsed", text: decoded, value: JSON.parse(decoded) as unknown };
  } catch {
    return unusable(ck, decoded, "is not valid JSON", deferred);
  }
}

/** latest.json whose rendered part cannot be known: its whole text is checked, then it is a deferred error (M2-1-R3-003). */
function unusable(ck: Checker, text: string, reason: string, deferred: DeferredError[]): { kind: "none" } {
  checkText(ck, text, VERIFICATION_SOURCE, null);
  deferred.push(new DeferredError(`artifacts/verification/latest.json ${reason}`));
  return { kind: "none" };
}

/**
 * The part that depends on <to>: which values of latest.json are rendered. A report of <to> on a clean tree is
 * rendered as its result (its shape checked with zod, a report of another shape is unusable); anything else is
 * "No verify result for <to>", with its commit and dirty values checked like any other rendered value.
 */
function verificationFor(ck: Checker, latest: Latest, toSha: string, deferred: DeferredError[]): Verification {
  if (latest.kind !== "parsed") return latest;
  const source = VERIFICATION_SOURCE;
  const parsed = latest.value;
  // Not an object, no git object, another commit or a dirty tree: "No verify result for <to>" (as before).
  const git = isRecord(parsed) ? parsed.git : undefined;
  const commit: unknown = isRecord(git) ? (git.commit ?? null) : null;
  const dirty: unknown = isRecord(git) ? (git.dirty ?? null) : null;
  if (commit !== toSha || dirty !== false) {
    // latest.json's own values for another commit are rendered like any other value (found by the typed template, M2-1 R2)
    return { kind: "other", commit: commit !== null && commit !== "" ? checkInto(ck, String(commit).slice(0, SHORT), source) : null, dirty: checkInto(ck, String(dirty), source) };
  }
  const shaped = RENDERED_REPORT.safeParse(parsed);
  if (!shaped.success) return unusable(ck, latest.text, "does not have the shape of a verify result (tool an object, checks an array of objects)", deferred);
  const report = shaped.data;
  // The rendered table escapes raw characters (M2-1-R1-004), so the values are checked before rendering, as one
  // text (a finding's line is the value's line in it); each value is then Checked on its own for its renderer.
  const values = [report.verdict, report.exitCode, report.tool?.name, report.tool?.version, report.startedAt, report.finishedAt, ...(report.checks ?? []).flatMap((c) => [c.name, c.kind, c.required, c.status, c.exitCode, c.durationMs])];
  const before = ck.findings.length;
  checkText(ck, values.map((v) => String(v)).join("\n"), source, null);
  if (ck.findings.length > before) return { kind: "none" };
  const v = (value: unknown): Checked | Rejected => checkInto(ck, String(value), source);
  return {
    kind: "result",
    toShort: v(toSha.slice(0, SHORT)),
    verdict: v(report.verdict),
    exitCode: v(report.exitCode),
    tool: v(`${String(report.tool?.name)} ${String(report.tool?.version)}`),
    startedAt: v(report.startedAt),
    finishedAt: v(report.finishedAt),
    checks: (report.checks ?? []).map((c) => ({ name: v(c.name), kind: v(c.kind), required: v(c.required), status: v(c.status), exitCode: v(c.exitCode), durationMs: v(c.durationMs) })),
  };
}

/** The Verification section's text (only without findings: every value is settled). */
function renderVerification(ver: Verification): Md {
  const S = settled;
  switch (ver.kind) {
    case "absent":
      return md`No verify result: \`artifacts/verification/latest.json\` does not exist.\n`;
    case "none":
      return md``;
    case "other": {
      const shown = ver.commit !== null ? inlineCode(S(ver.commit)) : md`unknown`;
      return md`No verify result for <to>: latest.json is for commit ${shown} with dirty = ${plainOrCode(S(ver.dirty))} (included only for <to> on a clean tree).\n`;
    }
    case "result": {
      const parts: Md[] = [];
      parts.push(md`\`aiqh verify\` result recorded in latest.json for ${inlineCode(S(ver.toShort))} (clean tree):\n\n`);
      parts.push(md`- Verdict: ${inlineCode(S(ver.verdict))}; exit code ${inlineCode(S(ver.exitCode))}; tool ${inlineCode(S(ver.tool))}\n`);
      parts.push(md`- Started: ${inlineCode(S(ver.startedAt))}; finished: ${inlineCode(S(ver.finishedAt))}\n\n`);
      parts.push(md`| Check | Kind | Required | Status | Exit code | Duration (ms) |\n|---|---|---|---|---|---|\n`);
      for (const c of ver.checks) {
        parts.push(md`| ${cellCode(S(c.name))} | ${cellCode(S(c.kind))} | ${cellCode(S(c.required))} | ${cellCode(S(c.status))} | ${cellCode(S(c.exitCode))} | ${cellCode(S(c.durationMs))} |\n`);
      }
      return joinMd(parts, md``);
    }
  }
}
