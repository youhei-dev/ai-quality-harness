/**
 * Review packet builder (M2-1, ADR-0014). Builds a Markdown packet for an independent reviewer from a
 * commit range, using only facts that git and the verify report record mechanically: the request and
 * previous review supplied by a human, commit messages, the changed-file list, per-file diffs, the full
 * sources at <to>, selected documents and the verify result of <to>. There are no hand-written
 * sections and no conclusion by the implementer.
 *
 * Fail closed: every input is checked for invalid UTF-8, forbidden raw characters (raw-chars.ts) and
 * secret-shaped strings (the shared scanner) before the packet is assembled, and the assembled packet
 * is checked again as a whole. Any finding means no packet (exit 1). Usage, git and size-limit
 * problems are PacketErrors (exit 2). Findings carry a source label, a line and a category or code
 * point — never the value or the line content.
 *
 * git is run without a shell (argument arrays), paths are read with -z, contents come from blobs
 * (`git cat-file`), and every option that user or repository configuration could change is given
 * explicitly, so the same range, inputs, aiqh version and git version give the same bytes.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ResolvedSecurity, VerificationReport } from "../types.ts";
import { decodeUtf8Strict, findRawChars, formatCodePoint, isForbiddenCodePoint } from "../security/raw-chars.ts";
import { findAllowRule, scanString, type ScanFinding } from "../security/scan.ts";

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

export class PacketError extends Error {
  override readonly name = "PacketError";
}

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

export interface PacketOptions {
  /** Directory inside the repository. */
  cwd: string;
  /** `<from>..<to>`. */
  range: string;
  label?: string;
  /** Human-written request: file contents (already read) and the name to show. */
  request?: { name: string; bytes: Uint8Array };
  reviews?: Array<{ name: string; bytes: Uint8Array }>;
  /** Repository paths whose content at <to> is included in full. */
  docs?: string[];
  excludes?: string[];
  maxFileBytes?: number;
  maxPacketBytes?: number;
  security: ResolvedSecurity;
  toolVersion: string;
  /** YYYY-MM-DD used for allow-rule expiry (tests); default today. */
  today?: string;
}

export type ChangeKind = "text" | "binary" | "lock" | "excluded" | "submodule" | "deleted";

export interface ChangedFile {
  status: string;
  path: string;
  oldPath: string | null;
  kind: ChangeKind;
  /** The --exclude glob that matched (kind "excluded"). */
  excludedBy: string | null;
  size: number | null;
  sha256: string | null;
  added: number | null;
  deleted: number | null;
}

export interface PacketResult {
  ok: true;
  text: string;
  label: string;
  fromSha: string;
  toSha: string;
  root: string;
  commits: number;
  files: ChangedFile[];
  suppressed: Suppression[];
}

export interface PacketRejected {
  ok: false;
  findings: PacketFinding[];
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
  if (r.error) throw new PacketError(`git could not be run: ${r.error.message}`);
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr.toString("utf8").split("\n")[0] ?? "" };
}

function gitOk(cwd: string, args: string[], what: string, maxBuffer?: number): Buffer {
  const r = runGit(cwd, args, maxBuffer);
  if (r.status !== 0) throw new PacketError(`${what} failed (git exit ${r.status}): ${r.stderr}`);
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

function resolveCommit(root: string, ref: string, side: string): { sha: string; tagObject: string | null } {
  if (ref.length === 0) throw new PacketError(`--range: the ${side} revision is empty`);
  const commit = runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]);
  if (commit.status !== 0) throw new PacketError(`--range: ${side} revision ${JSON.stringify(ref)} does not name a commit`);
  const sha = commit.stdout.toString("utf8").trim();
  const obj = runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", ref]).stdout.toString("utf8").trim();
  return { sha, tagObject: obj.length > 0 && obj !== sha ? obj : null };
}

// ---------------------------------------------------------------------------------------------------
// rendering helpers

/**
 * Content of an inline code span (M2-1-R1-004): LF, TAB, backslash and backtick become `\\n` `\\t` `\\\\` `` \\` ``,
 * other control / separator / bidi characters `\\u{HEX}`. No backtick is left, so one backtick on each side
 * always delimits the span, and no line break can start a heading or a table row.
 */
function escapeInline(s: string): string {
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    if (cp === 0x0a) out += "\\n";
    else if (cp === 0x09) out += "\\t";
    else if (cp === 0x5c) out += "\\\\";
    else if (cp === 0x60) out += "\\`";
    else if (cp < 0x20 || isForbiddenCodePoint(cp)) out += `\\u{${cp.toString(16).toUpperCase()}}`;
    else out += c;
  }
  return out;
}

/** Inline code for paths, globs, file names, labels and other user / JSON strings (also the only dynamic text in headings). */
export function inlineCode(s: string): string {
  return `\`${escapeInline(s)}\``;
}

/** Paths are rendered as inline code (kept as a name for the call sites and tests). */
export const renderPath = inlineCode;

/** Inline code inside a table cell: as inlineCode, plus `|` escaped (GFM splits cells before code spans). */
function cellCode(s: string): string {
  return `\`${escapeInline(s).replace(/\|/g, "\\|")}\``;
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

  /** Template text (headings, tables written by aiqh). */
  add(text: string): void {
    this.parts.push(text);
    this.line += (text.match(/\n/g) ?? []).length;
  }

  /** Text that came from an input: recorded so that a packet line can be traced back to its source. */
  addSource(text: string, source: string, origin: LineOrigin | null): void {
    const lines = lineCount(text);
    this.segments.push({ startLine: this.line, lines, source, origin });
    this.add(text);
  }

  /** A fenced block for an input; the fence is longer than any backtick run inside. */
  fenced(content: string, lang: string, source: string, origin: LineOrigin | null): void {
    const fence = fenceFor(content);
    this.add(`${fence}${lang}\n`);
    this.addSource(content, source, origin);
    if (content.length > 0 && !content.endsWith("\n")) this.add("\n");
    this.add(`${fence}\n`);
    if (content.length > 0 && !content.endsWith("\n")) this.add("(no newline at end of file)\n");
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

/** Raw characters only (no secret scan: secrets in option values are caught by the whole-packet check). */
function rawCharsOnly(ck: Checker, value: string, source: string): void {
  for (const h of findRawChars(value)) ck.findings.push({ kind: "raw-char", source, line: h.line, detail: formatCodePoint(h.codePoint), location: null, stage: "input" });
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
  status: string;
  path: string;
  oldPath: string | null;
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
    if (!m) throw new PacketError("unexpected git diff --raw output");
    const letter = m[5] ?? "";
    const where = `git diff --raw entry ${out.length + 1}`;
    if (letter === "R" || letter === "C") {
      const oldPath = decodePath(ck, parts[i + 1], where);
      const newPath = decodePath(ck, parts[i + 2], where);
      out.push({ status: `${letter}${m[6] ?? ""}`, oldPath, path: newPath, oldMode: m[1] ?? "", newMode: m[2] ?? "", oldBlob: m[3] ?? "", newBlob: m[4] ?? "" });
      i += 3;
    } else {
      out.push({ status: letter, oldPath: null, path: decodePath(ck, parts[i + 1], where), oldMode: m[1] ?? "", newMode: m[2] ?? "", oldBlob: m[3] ?? "", newBlob: m[4] ?? "" });
      i += 2;
    }
  }
  return out;
}

/**
 * A path from git, decoded strictly (M2-1-R1-001). Invalid UTF-8 is an `invalid-utf8` finding and a valid
 * path with a forbidden raw character (anything of raw-chars.ts; LF and TAB are allowed in paths) is a
 * `raw-char` finding, both with the source `path`; the value is never reported. On a finding the returned
 * placeholder only keeps the build going until the findings are reported (nothing is written).
 */
function decodePath(ck: Checker, bytes: Buffer | undefined, where: string): string {
  const d = decodeUtf8Strict(bytes ?? Buffer.alloc(0));
  if (!d.ok) {
    ck.findings.push({ kind: "invalid-utf8", source: "path", line: null, detail: null, location: where, stage: "input" });
    return `<invalid path: ${where}>`;
  }
  for (const h of findRawChars(d.text)) ck.findings.push({ kind: "raw-char", source: "path", line: null, detail: formatCodePoint(h.codePoint), location: where, stage: "input" });
  return d.text;
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

/** Build the packet text, or the findings that stop it. Throws PacketError for usage / git / size problems. */
export function buildPacket(opts: PacketOptions): PacketResult | PacketRejected {
  const maxFile = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxPacket = opts.maxPacketBytes ?? DEFAULT_MAX_PACKET_BYTES;
  if (!Number.isSafeInteger(maxFile) || maxFile < 1) throw new PacketError("--max-file-bytes must be a positive integer");
  if (!Number.isSafeInteger(maxPacket) || maxPacket < 1) throw new PacketError("--max-packet-bytes must be a positive integer");
  if (opts.label !== undefined && !LABEL_PATTERN.test(opts.label)) {
    throw new PacketError("--label may contain only lower-case letters, digits, \".\" and \"-\" (1-64 characters)");
  }
  const m = /^(.*?)\.\.(.*)$/.exec(opts.range);
  if (!m || opts.range.includes("...")) throw new PacketError("--range must have the form <from>..<to>");

  const inside = runGit(opts.cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.toString("utf8").trim() !== "true") throw new PacketError(`not inside a git work tree: ${opts.cwd}`);
  const root = gitOk(opts.cwd, ["rev-parse", "--show-toplevel"], "finding the repository root").toString("utf8").trim();

  // Resolve both ends once; everything below uses the SHAs only.
  const from = resolveCommit(root, m[1] ?? "", "from");
  const to = resolveCommit(root, m[2] ?? "", "to");
  const anc = runGit(root, ["merge-base", "--is-ancestor", from.sha, to.sha]);
  if (anc.status === 1) throw new PacketError(`--range: ${from.sha.slice(0, SHORT)} is not an ancestor of ${to.sha.slice(0, SHORT)}`);
  if (anc.status !== 0) throw new PacketError(`--range: ancestry check failed: ${anc.stderr}`);
  const commits = gitOk(root, ["rev-list", "--reverse", "--topo-order", `${from.sha}..${to.sha}`], "listing commits").toString("utf8").split("\n").filter((l) => l.length > 0);
  if (commits.length === 0) throw new PacketError("--range contains no commits");
  const label = opts.label ?? to.sha.slice(0, SHORT);

  const ck: Checker = { findings: [], suppressed: [], security: opts.security, today: opts.today };
  const excludes = opts.excludes ?? [];
  // Metadata from options is rendered escaped (M2-1-R1-004); raw characters in it are still findings (fail closed).
  excludes.forEach((g, i) => rawCharsOnly(ck, g, `--exclude pattern ${i + 1}`));
  if (opts.request) rawCharsOnly(ck, opts.request.name, "request file name");
  (opts.reviews ?? []).forEach((r, i) => rawCharsOnly(ck, r.name, `review file name ${i + 1}`));
  const matchExclude = (p: string): string | null => excludes.find((g) => path.matchesGlob(p, g)) ?? null;

  // ---- changes (two-point tree comparison from..to)
  const raw = parseRaw(gitOk(root, ["diff", "--raw", "-z", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--no-relative", "-M50%", from.sha, to.sha], "listing changes"), ck);
  const numstat = parseNumstat(gitOk(root, ["diff", "--numstat", "-z", "--text", "--no-ext-diff", "--no-textconv", "--no-relative", "-M50%", from.sha, to.sha], "counting changes"));
  raw.sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));

  interface Prepared {
    file: ChangedFile;
    content: string | null;
    diff: string | null;
  }
  const prepared: Prepared[] = [];
  const tooLarge: string[] = [];
  for (const r of raw) {
    const deleted = r.status === "D";
    const counts = numstat.get(r.path) ?? { added: null, deleted: null };
    const file: ChangedFile = { status: r.status, path: r.path, oldPath: r.oldPath, kind: "text", excludedBy: null, size: null, sha256: null, added: counts.added, deleted: counts.deleted };
    const blob = deleted ? r.oldBlob : r.newBlob;
    const mode = deleted ? r.oldMode : r.newMode;
    const excludedBy = matchExclude(r.path) ?? (r.oldPath !== null ? matchExclude(r.oldPath) : null);
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
      file.sha256 = sha256(blobBytes(root, blob, file.size));
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const size = blobSize(root, blob);
    file.size = size;
    const isLock = LOCK_FILE_NAMES.includes(path.posix.basename(r.path));
    // A gitlink on the old side (submodule -> file) points to a commit, not a blob: that side is empty.
    const oldIsBlob = !ZERO.test(r.oldBlob) && !deleted && r.oldMode !== "160000";
    const oldSize = oldIsBlob ? blobSize(root, r.oldBlob) : 0;
    if (!isLock && (size > maxFile || oldSize > maxFile)) {
      tooLarge.push(`${r.path} (${Math.max(size, oldSize)} bytes)`);
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const bytes = blobBytes(root, blob, size);
    file.sha256 = sha256(bytes);
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
    const text = decode(ck, bytes, deleted ? `deleted file ${r.path}` : `full source ${r.path}`);
    const oldText = oldBytes.length > 0 ? decode(ck, oldBytes, `previous version of ${r.oldPath ?? r.path}`) : "";
    if (text === null || oldText === null) {
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    if (deleted) file.kind = "deleted";
    // Only strictly decoded paths reach this point (a path finding stops the packet before it is written).
    if (ck.findings.some((f) => f.source === "path")) {
      prepared.push({ file, content: null, diff: null });
      continue;
    }
    const pathspec = [`:(literal)${r.path}`, ...(r.oldPath !== null ? [`:(literal)${r.oldPath}`] : [])];
    const diffBytes = gitOk(root, [...DIFF_FLAGS, from.sha, to.sha, "--", ...pathspec], `diff of ${r.path}`);
    // A changed file always has a diff header at least (mode-only changes, pure renames and empty files
    // included), so an empty diff means the pathspec missed the file: never write a packet without it.
    if (diffBytes.length === 0) throw new PacketError(`git diff returned nothing for the changed file ${r.path} (status ${r.status}); nothing written`);
    const diff = decode(ck, diffBytes, `diff ${r.path}`);
    prepared.push({ file, content: deleted ? null : text, diff });
    if (!deleted) checkText(ck, text, `full source ${r.path}`, (i) => ({ path: r.path, line: i + 1 }));
    if (diff !== null) checkText(ck, diff, `diff ${r.path}`, diffOrigin(diff, r.path, r.oldPath ?? r.path));
  }
  if (tooLarge.length > 0) {
    throw new PacketError(`changed file larger than --max-file-bytes (${maxFile}): ${tooLarge.join(", ")}; raise the limit or leave it out with --exclude`);
  }

  // ---- commits
  interface CommitInfo {
    sha: string;
    subject: string;
    message: string;
    files: string[];
  }
  const commitInfos: CommitInfo[] = [];
  for (const sha of commits) {
    const rawCommit = gitOk(root, ["cat-file", "commit", sha], `reading commit ${sha.slice(0, SHORT)}`);
    const source = `commit ${sha.slice(0, SHORT)} message`;
    const decoded = decode(ck, commitMessage(rawCommit), source);
    const message = decoded === null ? "" : stripTrailers(decoded);
    if (decoded !== null) checkText(ck, message, source, null);
    const parents = gitOk(root, ["rev-list", "--parents", "-n", "1", sha], "reading parents").toString("utf8").trim().split(" ").slice(1);
    const treeArgs = parents.length === 0 ? ["diff-tree", "-r", "-z", "--name-only", "--no-renames", "--no-commit-id", "--root", sha] : ["diff-tree", "-r", "-z", "--name-only", "--no-renames", "--no-commit-id", parents[0] ?? "", sha];
    const files = splitZ(gitOk(root, treeArgs, "listing commit files")).map((p, k) => decodePath(ck, p, `commit ${sha.slice(0, SHORT)} file list entry ${k + 1}`));
    commitInfos.push({ sha, subject: message.split("\n")[0] ?? "", message, files });
  }

  // ---- human inputs and documents
  const request = opts.request ? { name: opts.request.name, text: decode(ck, opts.request.bytes, "request") } : null;
  if (request?.text) checkText(ck, request.text, "request", null);
  const reviews = (opts.reviews ?? []).map((r) => {
    const text = decode(ck, r.bytes, `review ${r.name}`);
    if (text !== null) checkText(ck, text, `review ${r.name}`, null);
    return { name: r.name, text };
  });
  const docs: Array<{ path: string; text: string | null }> = [];
  for (const d of opts.docs ?? []) {
    const ls = splitZ(gitOk(root, ["ls-tree", "-z", to.sha, "--", `:(literal)${d}`], `looking up --doc ${d}`)).map((e) => quietPath(e) ?? "");
    const entry = ls.find((e) => e.endsWith(`\t${d}`));
    const em = entry ? /^(\d{6}) blob ([0-9a-f]+)\t/.exec(entry) : null;
    if (!em) throw new PacketError(`--doc ${JSON.stringify(d)} is not a file at ${to.sha.slice(0, SHORT)}`);
    const blob = em[2] ?? "";
    const size = blobSize(root, blob);
    if (size > maxFile) throw new PacketError(`--doc ${d} is larger than --max-file-bytes (${size} > ${maxFile})`);
    const text = decode(ck, blobBytes(root, blob, size), `doc ${d}`);
    if (text !== null) checkText(ck, text, `doc ${d}`, (i) => ({ path: d, line: i + 1 }));
    docs.push({ path: d, text });
  }

  // ---- verify result of <to> (only when latest.json belongs to <to> and a clean tree)
  const verification = readVerification(ck, root, to.sha);

  if (ck.findings.length > 0) return { ok: false, findings: ck.findings };

  // ---- assemble
  const b = new Builder();
  const toCommit = gitOk(root, ["cat-file", "commit", to.sha], "reading <to>");
  const gitVersion = gitOk(root, ["--version"], "git --version").toString("utf8").trim();
  const files = prepared.map((p) => p.file);
  b.add(`# Review Packet — ${label}\n\n`);
  b.add("## Metadata\n\n");
  b.add(`- Range: \`${from.sha.slice(0, SHORT)}..${to.sha.slice(0, SHORT)}\` (commits in \`from..to\`; changes = \`git diff <from> <to>\`, a two-point tree comparison)\n`);
  b.add(`- Range as given: ${renderPath(opts.range)} (resolved once to the SHAs below)\n`);
  b.add(`- From: commit \`${from.sha}\`${from.tagObject ? ` (tag object \`${from.tagObject}\`)` : ""}\n`);
  b.add(`- To: commit \`${to.sha}\`${to.tagObject ? ` (tag object \`${to.tagObject}\`)` : ""}\n`);
  b.add(`- Committer time of <to>: ${committerTime(toCommit) ?? "unknown"} (UTC)\n`);
  b.add(`- Commits: ${commits.length}; changed files: ${files.length}\n`);
  b.add(`- Generated by: aiqh ${opts.toolVersion}; ${gitVersion}\n`);
  b.add(`- Options: label \`${label}\`; max file bytes ${maxFile}; max packet bytes ${maxPacket}`);
  b.add(excludes.length > 0 ? `; excludes ${excludes.map((g) => inlineCode(g)).join(", ")}` : "; excludes none");
  b.add(`; documents ${docs.length}; request ${request ? "given" : "none"}; previous reviews ${reviews.length}\n\n`);
  b.add("This packet contains no conclusion by the implementer about correctness. It holds the request and previous reviews as supplied by\n");
  b.add("a human, the commit messages, the changed-file list, per-file diffs, the full sources at <to>, selected documents and the verify\n");
  b.add("result that `aiqh verify` recorded for <to>. **Commit messages are written by the implementer (possibly an AI) and may contain its\n");
  b.add("explanations.** Every input was checked for invalid UTF-8, raw control / separator / bidi characters and secret-shaped strings.\n\n");

  b.add("# Request\n\n");
  if (request !== null && request.text !== null) {
    b.add(`Supplied by a human (${inlineCode(request.name)}), verbatim:\n\n`);
    b.fenced(request.text, "markdown", "request", null);
  } else b.add("Not supplied.\n");
  b.add("\n# Previous Reviews\n\n");
  if (reviews.length === 0) b.add("None supplied.\n");
  for (const r of reviews) {
    b.add(`## ${inlineCode(r.name)}\n\n`);
    b.fenced(r.text ?? "", "markdown", `review ${r.name}`, null);
    b.add("\n");
  }

  b.add("\n# Commits\n\n`git rev-list --reverse --topo-order <from>..<to>`. Messages without Co-Authored-By / Claude-Session trailers.\n\n");
  b.add("| # | Commit | Subject | Files |\n|---|---|---|---|\n");
  commitInfos.forEach((c, i) => b.add(`| ${i + 1} | \`${c.sha.slice(0, SHORT)}\` | ${cellCode(c.subject)} | ${c.files.length} |\n`));
  for (const c of commitInfos) {
    b.add(`\n## ${c.sha}\n\nFiles: ${c.files.length === 0 ? "none" : c.files.map(renderPath).join(", ")}\n\n`);
    b.fenced(c.message, "text", `commit ${c.sha.slice(0, SHORT)} message`, null);
  }

  b.add("\n# Changed Files\n\n`git diff --raw -M50% <from> <to>`, sorted by path. Kinds: text (full source and diff below), deleted (diff only),\n");
  b.add("binary (contains NUL; not shown), lock (not shown), excluded (by --exclude; not shown), submodule (not shown).\n\n");
  b.add("| # | Status | Path | Previous path | Kind | Bytes | + | - |\n|---|---|---|---|---|---|---|---|\n");
  files.forEach((f, i) => {
    const kind = `${f.kind === "excluded" ? `excluded (${cellCode(f.excludedBy ?? "")})` : f.kind}${f.status === "T" ? " (type change)" : ""}`;
    const counts = f.kind === "text" || f.kind === "deleted" ? [String(f.added ?? "-"), String(f.deleted ?? "-")] : ["-", "-"];
    b.add(`| ${i + 1} | ${f.status} | ${cellCode(f.path)} | ${f.oldPath !== null ? cellCode(f.oldPath) : ""} | ${kind} | ${f.size ?? "-"} | ${counts[0]} | ${counts[1]} |\n`);
  });

  b.add("\n# Diff\n\nPer file: `git diff --text --diff-algorithm=myers -U3 --full-index -M50% <from> <to> -- <path>`.\n");
  for (const p of prepared) {
    b.add(`\n## ${renderPath(p.file.path)}\n\n`);
    if (p.diff !== null) b.fenced(p.diff, "diff", `diff ${p.file.path}`, diffOrigin(p.diff, p.file.path, p.file.oldPath ?? p.file.path));
    else b.add(`Not shown (${p.file.kind}).\n`);
  }

  b.add("\n# Full Source of Changed Files\n\nContent at <to> of every changed text file (deleted, binary, lock, excluded and submodule entries have none).\n");
  for (const p of prepared) {
    if (p.content === null) continue;
    b.add(`\n## ${renderPath(p.file.path)} (${lineCount(p.content)} lines)\n\n`);
    b.fenced(p.content, langOf(p.file.path), `full source ${p.file.path}`, (i) => ({ path: p.file.path, line: i + 1 }));
  }

  b.add("\n# Documents\n\n");
  if (docs.length === 0) b.add("None selected (--doc).\n");
  for (const d of docs) {
    b.add(`## ${renderPath(d.path)} (at \`${to.sha.slice(0, SHORT)}\`)\n\n`);
    b.fenced(d.text ?? "", langOf(d.path), `doc ${d.path}`, (i) => ({ path: d.path, line: i + 1 }));
    b.add("\n");
  }

  b.add("\n# Verification\n\n");
  b.addSource(verification, "verification (artifacts/verification/latest.json)", null);

  b.add("\n# Integrity\n\nSHA-256 of the blob at <to> (or at <from> for deleted files).\n\n| Path | Bytes | SHA-256 |\n|---|---|---|\n");
  for (const f of files) b.add(`| ${cellCode(f.path)} | ${f.size ?? "-"} | ${f.sha256 ?? "-"} |\n`);
  b.add(`\nChecks before writing: invalid UTF-8 0, raw characters 0, secret-shaped strings 0 (after security.allow). Suppressed by security.allow: ${ck.suppressed.length}.\n`);
  for (const s of ck.suppressed) b.add(`- ${inlineCode(s.source)} → ${inlineCode(s.path)}:${s.line} ${inlineCode(s.category)} by rule #${s.rule + 1}\n`);

  const text = b.text();

  // ---- whole-packet check (stage 2)
  const packetCk: Checker = { findings: [], suppressed: [], security: opts.security, today: opts.today };
  const originOf: LineOrigin = (i) => {
    const seg = b.segmentAt(i + 1);
    return seg?.origin ? seg.origin(i + 1 - seg.startLine) : null;
  };
  checkText(packetCk, text, "packet", originOf, "packet");
  if (packetCk.findings.length > 0) {
    return {
      ok: false,
      findings: packetCk.findings.map((f) => {
        const seg = f.line !== null ? b.segmentAt(f.line) : null;
        return seg ? { ...f, source: seg.source, line: (f.line ?? seg.startLine) - seg.startLine + 1 } : { ...f, source: "packet template", line: f.line };
      }),
    };
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxPacket) throw new PacketError(`the packet would be ${bytes} bytes, more than --max-packet-bytes (${maxPacket}); nothing written`);
  return { ok: true, text, label, fromSha: from.sha, toSha: to.sha, root, commits: commits.length, files, suppressed: ck.suppressed };
}

function readVerification(ck: Checker, root: string, toSha: string): string {
  const file = path.join(root, "artifacts", "verification", "latest.json");
  if (!existsSync(file)) return "No verify result: `artifacts/verification/latest.json` does not exist.\n";
  const decoded = decode(ck, readFileSync(file), "verification (artifacts/verification/latest.json)");
  if (decoded === null) return "";
  let report: VerificationReport;
  try {
    report = JSON.parse(decoded) as VerificationReport;
  } catch {
    throw new PacketError("artifacts/verification/latest.json is not valid JSON");
  }
  const commit = report.git?.commit ?? null;
  const dirty = report.git?.dirty ?? null;
  if (commit !== toSha || dirty !== false) {
    return `No verify result for <to>: latest.json is for commit ${commit ? `\`${commit.slice(0, SHORT)}\`` : "unknown"} with dirty = ${String(dirty)} (included only for <to> on a clean tree).\n`;
  }
  const lines: string[] = [];
  lines.push(`\`aiqh verify\` result recorded in latest.json for \`${toSha.slice(0, SHORT)}\` (clean tree):\n\n`);
  lines.push(`- Verdict: ${inlineCode(String(report.verdict))}; exit code ${inlineCode(String(report.exitCode))}; tool ${inlineCode(`${String(report.tool?.name)} ${String(report.tool?.version)}`)}\n`);
  lines.push(`- Started: ${inlineCode(String(report.startedAt))}; finished: ${inlineCode(String(report.finishedAt))}\n\n`);
  lines.push("| Check | Kind | Required | Status | Exit code | Duration (ms) |\n|---|---|---|---|---|---|\n");
  for (const c of report.checks ?? []) {
    lines.push(`| ${cellCode(String(c.name))} | ${cellCode(String(c.kind))} | ${cellCode(String(c.required))} | ${cellCode(String(c.status))} | ${cellCode(String(c.exitCode))} | ${cellCode(String(c.durationMs))} |\n`);
  }
  const text = lines.join("");
  // The rendered table escapes raw characters (M2-1-R1-004), so the values are checked before rendering.
  const values = [report.verdict, report.exitCode, report.tool?.name, report.tool?.version, report.startedAt, report.finishedAt, ...(report.checks ?? []).flatMap((c) => [c.name, c.kind, c.required, c.status, c.exitCode, c.durationMs])];
  checkText(ck, values.map((v) => String(v)).join("\n"), "verification (artifacts/verification/latest.json)", null);
  return text;
}
