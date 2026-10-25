/**
 * Built-in security scan (M1, ADR-0010; revised by the M1 reviews and M2-0). Scans the files git
 * tracks plus the untracked files git would not ignore, line by line (any size), for secret-shaped
 * strings using the shared pattern definitions (R-012); multi-line PEM private keys are found by a
 * begin/end state machine; a single line longer than maxLineBytes is scanned as a sliding window
 * whose candidate prefixes are carried over (M2-0 / M1-R3-001, M2-0-R2-001: bounded anchors, minimum
 * overlap, earliest unresolved anchor, `partial` resolution; M2-0-R3-001: every body is anchor + rest —
 * ADR-0013) so memory stays bounded. Reports
 * tracked .env files, untracked .env files git does not ignore and missing .gitignore coverage
 * (decided by git itself, counting only tracked .gitignore rules). Raw bidi controls and line
 * separators (ADR-0036) and the invisible characters of layer (c) (ADR-0037; raw-chars.ts
 * SCANNED_RAW_RANGES) are findings in the lines of the files it reads and in the names of every
 * listed path, except U+200D, U+FE0F and tags inside a complete RGI emoji sequence (counted, never
 * findings); they are checked beside the secret patterns, never through scanString. `security.allow` rules suppress secret-shaped findings, and raw characters
 * only by a rule that names their category; every suppression is recorded (M2-0 §7). Findings carry
 * category, path and line numbers only — never the matched value. Files that cannot be stat'ed or
 * read are ScanErrors (exit 2, fail closed); only ENOENT is skipped.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { AllowRule, ResolvedSecurity } from "../types.ts";
import { windowLimitsProblem } from "../config/window-limits.ts";
import { SCANNED_CATEGORIES, SECRET_PATTERNS, UNSCANNED_CATEGORIES, stripCanonicalMarkers, type SecretPattern } from "./patterns.ts";
import { decideRawChars, formatCodePoint, RAW_CHAR_CATEGORIES, SCANNED_RAW_RANGES, type RawCharWindow } from "./raw-chars.ts";

export class ScanError extends Error {
  override readonly name = "ScanError";
}

export type FindingKind = "secret" | "oversized-candidate" | "tracked-env" | "untracked-env" | "gitignore" | "raw-char";

export interface ScanFinding {
  kind: FindingKind;
  /** Secret category (secret / oversized-candidate findings), or raw-character category (raw-char findings: RAW_CHAR_CATEGORIES). */
  category?: string;
  /** Repository-relative path (".gitignore" for gitignore findings). */
  file: string;
  /** 1-based line (secret findings and raw characters in the content; the BEGIN line for a PEM block). A raw character in the path has none. */
  line?: number;
  /** Last line of a multi-line block (PEM); equals `line` for single-line findings. */
  endLine?: number;
  /** The code point of a raw-char finding, as "U+202E". */
  codePoint?: string;
  message: string;
}

/** A finding suppressed by `security.allow`; `rule` is the 0-based index into the allow list. */
export interface SuppressedFinding extends ScanFinding {
  rule: number;
}

export interface ScanResult {
  root: string;
  filesTracked: number;
  /** Untracked files that git would not ignore (`git ls-files --others --exclude-standard`). */
  filesUntracked: number;
  filesScanned: number;
  skippedBinary: number;
  /** Findings that remain after `security.allow` (decide the exit code). */
  findings: ScanFinding[];
  /** Findings suppressed by an active allow rule (never hidden). */
  suppressed: SuppressedFinding[];
  /** Allow rules as configured, with how often each one was used. */
  allowUsage: Array<{ rule: number; path: string; category: string | null; line: number | null; reason: string; expires: string | null; count: number; expired: boolean }>;
  /** Indices of active rules that suppressed nothing (config rot). */
  unusedAllows: number[];
  /** Indices of rules whose `expires` date has passed (inactive). */
  expiredAllows: number[];
  /** Tracked or untracked .env-style files that are example / template files (informational). */
  exampleEnvFiles: string[];
  scannedCategories: string[];
  /** The raw characters this version finds, by category (ADR-0036, ADR-0037). */
  scannedRawChars: Array<{ category: string; codePoints: string[] }>;
  /** Occurrences of U+200D, U+FE0F and tags left out inside complete RGI emoji sequences, by position (ADR-0037 I7, I9); never findings, not touched by allow rules. */
  rawCharsExempted: number;
  unscannedCategories: Array<{ category: string; reason: string }>;
}

const BINARY_PROBE_BYTES = 8 * 1024;
/** Must not exceed maxCarryBytes: the bound on a window's length is maxLineBytes + max(chunk, carry). */
const READ_CHUNK_BYTES = 64 * 1024;
/**
 * Sliding window for over-long lines (M1-R2-004, M2-0 / M1-R3-001). All limits are measured in JS
 * string length (UTF-16 code units, at most one per input byte), so the retained text is at most
 * maxLineBytes + maxCarryBytes code units ≈ 2 × (256 KiB + 64 KiB) bytes of memory whatever the
 * file size. A window is scanned as soon as the retained text exceeds maxLineBytes; what is carried
 * into the next window is the candidate prefix (an anchor of a scanned pattern that no complete
 * match covers, followed only by characters the pattern may continue with, or a match that reaches
 * the window end), never less than lineOverlapBytes and never more than maxCarryBytes — a longer
 * candidate cannot be scanned completely and is reported as an "oversized-candidate" finding
 * (fail closed) instead of being dropped.
 */
export const MAX_LINE_BYTES = 256 * 1024;
export const LINE_OVERLAP = 4 * 1024;
export const MAX_CARRY_BYTES = 64 * 1024;
const ENV_FILE = /^\.env(\..+)?$/;

/** Defaults of the `security` config section = the M1 behaviour (M2-0 §8). */
export const DEFAULT_SECURITY: Readonly<ResolvedSecurity> = Object.freeze({
  allow: [],
  envProbePaths: [".env", ".env.local", ".env.production", ".env.development"],
  exampleEnvSuffixes: ["example", "sample", "template", "dist"],
  maxLineBytes: MAX_LINE_BYTES,
  lineOverlapBytes: LINE_OVERLAP,
  maxCarryBytes: MAX_CARRY_BYTES,
});

interface LineScanner {
  category: string;
  regex: RegExp;
  pattern: SecretPattern;
  partialSticky: RegExp;
}
interface BlockScanner {
  category: string;
  pattern: SecretPattern;
  begin: RegExp;
  end: RegExp;
  partialSticky: RegExp;
}
/** Where the next window should start (M2-0 / M1-R3-001). */
export interface CarryDecision {
  start: number;
  category: string | null;
}

/** Scan the git repository at `root`. Throws ScanError when `root` is not inside a work tree or a file cannot be read. */
export function scanRepository(root: string, security: ResolvedSecurity = DEFAULT_SECURITY): ScanResult {
  const absRoot = path.resolve(root);
  const tracked = listFiles(absRoot, []);
  const untracked = listFiles(absRoot, ["--others", "--exclude-standard"]);
  const result: ScanResult = {
    root: absRoot,
    filesTracked: tracked.length,
    filesUntracked: untracked.length,
    filesScanned: 0,
    skippedBinary: 0,
    findings: [],
    suppressed: [],
    allowUsage: [],
    unusedAllows: [],
    expiredAllows: [],
    exampleEnvFiles: [],
    scannedCategories: [...SCANNED_CATEGORIES],
    scannedRawChars: RAW_CHAR_CATEGORIES.map((category) => ({ category, codePoints: scannedCodePoints(category).map(formatCodePoint) })),
    rawCharsExempted: 0,
    unscannedCategories: UNSCANNED_CATEGORIES.map((u) => ({ ...u })),
  };
  const { lineScanners, blockScanners } = buildScanners();
  const ctx: FileScanContext = { lineScanners, blockScanners, security, result };

  // The name of every listed path is checked first, whether its content is then read or not (binary, .env, link, submodule, gone).
  for (const rel of tracked) {
    checkPathName(rel, result);
    classifyEnvFile(rel, result, security.exampleEnvSuffixes);
    scanFile(absRoot, rel, ctx);
  }
  for (const rel of untracked) {
    checkPathName(rel, result);
    // An untracked environment file is never read. Git itself has established that it is not
    // ignored (it is listed by --others --exclude-standard), so its existence is the finding
    // (M1-R2-001); example / sample / template / dist files stay informational.
    if (ENV_FILE.test(path.basename(rel))) {
      if (isExampleEnv(path.basename(rel), security.exampleEnvSuffixes)) result.exampleEnvFiles.push(rel);
      else result.findings.push({ kind: "untracked-env", file: rel, message: "environment file exists but is not ignored by git" });
      continue;
    }
    scanFile(absRoot, rel, ctx);
  }
  checkGitignore(absRoot, result, security.envProbePaths);
  applyAllow(result, security.allow);
  return result;
}

/**
 * The paths `git ls-files -z` lists, each once, in git's order. An unmerged path is listed once per stage (1, 2, 3) but is one file
 * in the work tree, so its name and content are checked once (I48-I-R1-001; without --deduplicate, so no newer git is needed).
 */
function listFiles(root: string, extra: string[]): string[] {
  let out: string;
  try {
    out = execFileSync("git", ["ls-files", "-z", ...extra], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // git also fails when the root itself is missing or not a directory (it is git's working directory): say that, in the words of
    // init's root check (backlog 24; backlog 8, O9). Only a healthy root leaves the failure to git.
    throw new ScanError(rootProblem(root) ?? `not a git repository (or git failed): ${root} (${(err as Error).message.split("\n")[0]})`);
  }
  return [...new Set(out.split("\0").filter((f) => f.length > 0))];
}

/** Why `root` cannot be scanned, or null when it is a directory. Only ENOENT is "not found" (ADR-0022). */
function rootProblem(root: string): string | null {
  try {
    return statSync(root).isDirectory() ? null : `not a directory: ${root}`;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? `directory not found: ${root}` : `directory cannot be examined: ${root} (${code ?? "unknown error"})`;
  }
}

/**
 * Only ENOENT means "in the index but deleted from the work tree" (nothing to scan). Every other
 * lstat failure (EACCES, EPERM, ELOOP, …) hides a file from the scan and is an error (M1-R2-002).
 */
export function classifyStatError(err: unknown): "skip" | "error" {
  return (err as NodeJS.ErrnoException | null)?.code === "ENOENT" ? "skip" : "error";
}

interface FileScanContext {
  lineScanners: LineScanner[];
  blockScanners: BlockScanner[];
  security: ResolvedSecurity;
  result: ScanResult;
}

/** Complete matches of a line scanner in `text`, with the value check applied for key-value style patterns. */
function findMatches(s: LineScanner, text: string): Array<{ start: number; end: number; finding: boolean }> {
  const out: Array<{ start: number; end: number; finding: boolean }> = [];
  s.regex.lastIndex = 0;
  for (;;) {
    const m = s.regex.exec(text);
    if (m === null) break;
    if (m[0].length === 0) {
      s.regex.lastIndex += 1;
      continue;
    }
    let finding = true;
    if (s.pattern.valueFilter && s.pattern.valueGroups) {
      const g = s.pattern.valueGroups.find((i) => m[i] !== undefined);
      const value = g === undefined ? undefined : m[g];
      finding = value !== undefined && g !== undefined && s.pattern.valueFilter(value, s.pattern.quotedGroups?.includes(g) ?? false);
    }
    out.push({ start: m.index, end: m.index + m[0].length, finding });
  }
  return out;
}

/** Sticky form of an anchor's `partial` (^…$ → …$ with the y flag) so the remainder need not be sliced. */
function stickyPartial(p: RegExp): RegExp {
  return new RegExp(p.source.replace(/^\^/, ""), `${p.flags.replace(/[gy]/g, "")}y`);
}

/**
 * Candidate prefix to carry into the next window (M2-0 / M1-R3-001, revised by M2-0-R2-001;
 * ADR-0013): for every scanner, a complete match that reaches the window end, or an anchor that no
 * complete match covers and whose remainder up to the window end still matches the pattern's
 * `partial` (a match cut off by the window end). The EARLIEST such position across all scanners is
 * carried, so a match that starts before another anchor is not lost. For block patterns a complete
 * BEGIN marker counts as coverage: the block state machine carries the block itself. `null` when
 * nothing may continue.
 */
export function carryCandidate(window: string, lineScanners: readonly LineScanner[], blockScanners: readonly BlockScanner[] = []): CarryDecision | null {
  let best: CarryDecision | null = null;
  const consider = (start: number, category: string): void => {
    if (best === null || start < best.start) best = { start, category };
  };
  const anchorsOf = (category: string, anchor: NonNullable<SecretPattern["anchor"]>, partialSticky: RegExp, covered: (i: number) => boolean): void => {
    const re = new RegExp(anchor.start.source, anchor.start.flags.includes("g") ? anchor.start.flags : `${anchor.start.flags}g`);
    re.lastIndex = 0;
    for (;;) {
      const a = re.exec(window);
      if (a === null) break;
      if (a[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (best !== null && a.index >= best.start) break; // a later anchor cannot beat the earliest candidate
      if (covered(a.index)) continue;
      partialSticky.lastIndex = a.index;
      if (partialSticky.test(window)) consider(a.index, category);
    }
  };
  for (const s of lineScanners) {
    const matches = findMatches(s, window);
    for (const m of matches) if (m.end === window.length) consider(m.start, s.category);
    if (s.pattern.anchor) anchorsOf(s.category, s.pattern.anchor, s.partialSticky, (i) => matches.some((m) => m.start <= i && i < m.end));
  }
  for (const b of blockScanners) {
    if (!b.pattern.anchor) continue;
    const begins: Array<{ start: number; end: number }> = [];
    const re = new RegExp(b.begin.source, `${b.begin.flags.replace("g", "")}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      begins.push({ start: m.index, end: m.index + m[0].length });
    }
    anchorsOf(b.category, b.pattern.anchor, b.partialSticky, (i) => begins.some((g) => g.start <= i && i < g.end));
  }
  return best;
}

/** Categories found on a whole line by the line scanners and single-line blocks — no windows (for the completeness tests). */
export function lineFindings(line: string): string[] {
  const { lineScanners, blockScanners } = buildScanners();
  const text = stripCanonicalMarkers(line);
  const out: string[] = [];
  for (const s of lineScanners) if (findMatches(s, text).some((m) => m.finding)) out.push(s.category);
  for (const b of blockScanners) if (b.begin.test(text) && b.end.test(text)) out.push(b.category);
  return out;
}

/**
 * The raw characters of one text fed in the given chunks through the path of a file — the LineAssembler with the secret carry, the
 * secret sink and the raw-character sink — without git or a file, for the tests of the windows (ADR-0037 I5, I6). `work` counts the
 * steps of the decisions; `onWindow` is called for each delivery that does not reach the end of its line. scanString is not this path.
 */
export function scanRawCharText(chunks: readonly string[], security: ResolvedSecurity = DEFAULT_SECURITY, work?: { steps: number }, onWindow?: () => void): { findings: ScanFinding[]; exempted: number } {
  const scanners = buildScanners();
  const sink = new FileScanSink("<string>", scanners.lineScanners, scanners.blockScanners);
  const raw = new RawCharSink("<string>", work);
  const lines = new LineAssembler((line, no, _continued, at) => {
    sink.onLine(line, no);
    raw.onLine(line, no, at);
    if (!at.final) onWindow?.();
  }, assemblerOptions(security, scanners, sink));
  for (const chunk of chunks) lines.push(chunk);
  lines.end();
  return { findings: raw.findings, exempted: raw.exempted };
}

/** Scan a string (fed in `chunkBytes` pieces) through the same pipeline as a file — no git, for tests. */
export function scanString(text: string, security: ResolvedSecurity = DEFAULT_SECURITY, chunkBytes = READ_CHUNK_BYTES): ScanFinding[] {
  const scanners = buildScanners();
  const sink = new FileScanSink("<string>", scanners.lineScanners, scanners.blockScanners);
  const lines = new LineAssembler((line, no) => sink.onLine(line, no), assemblerOptions(security, scanners, sink));
  for (let i = 0; i < text.length; i += chunkBytes) lines.push(text.slice(i, i + chunkBytes));
  lines.end();
  sink.finish();
  return sink.findings;
}

function buildScanners(): { lineScanners: LineScanner[]; blockScanners: BlockScanner[] } {
  const lineScanners: LineScanner[] = [];
  const blockScanners: BlockScanner[] = [];
  for (const p of SECRET_PATTERNS) {
    if (!p.scan) continue;
    const partialSticky = p.anchor ? stickyPartial(p.anchor.partial) : /(?!)/y;
    if (p.scanMode === "block" && p.block) blockScanners.push({ category: p.category, pattern: p, begin: p.block.begin, end: p.block.end, partialSticky });
    else {
      // The scanner uses its own regex only where the masker's must stay wider (M2-0-R3-002).
      const body = p.scanPattern ?? p.pattern;
      lineScanners.push({ category: p.category, pattern: p, regex: new RegExp(body.source, body.flags.includes("g") ? body.flags : `${body.flags}g`), partialSticky });
    }
  }
  return { lineScanners, blockScanners };
}

function assemblerOptions(security: ResolvedSecurity, scanners: { lineScanners: LineScanner[]; blockScanners: BlockScanner[] }, sink: FileScanSink): LineAssemblerOptions {
  return {
    maxLineBytes: security.maxLineBytes,
    lineOverlap: security.lineOverlapBytes,
    maxCarryBytes: security.maxCarryBytes,
    carryFrom: (window) => carryCandidate(window, scanners.lineScanners, scanners.blockScanners) ?? { start: window.length, category: null },
    onOversizedCandidate: (category, no) => sink.oversized(category, no),
  };
}

/** Per-file state of the line and block scanners; findings are de-duplicated by key (windows overlap). */
class FileScanSink {
  readonly findings: ScanFinding[] = [];
  private readonly seen = new Set<string>();
  private readonly open: Array<{ scanner: BlockScanner; beginLine: number }> = [];
  private lineNo = 0;
  private readonly rel: string;
  private readonly lineScanners: readonly LineScanner[];
  private readonly blockScanners: readonly BlockScanner[];
  constructor(rel: string, lineScanners: readonly LineScanner[], blockScanners: readonly BlockScanner[]) {
    this.rel = rel;
    this.lineScanners = lineScanners;
    this.blockScanners = blockScanners;
  }
  private push(f: ScanFinding, key: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.findings.push(f);
  }
  oversized(category: string, no: number): void {
    this.push({ kind: "oversized-candidate", category, file: this.rel, line: no, endLine: no, message: `${category} candidate longer than maxCarryBytes could not be scanned completely` }, `oversized:${category}:${no}`);
  }
  onLine(rawLine: string, no: number): void {
    this.lineNo = no;
    const rel = this.rel;
    const line = stripCanonicalMarkers(rawLine);
    for (const s of this.lineScanners) {
      if (findMatches(s, line).some((m) => m.finding)) {
        this.push({ kind: "secret", category: s.category, file: rel, line: no, endLine: no, message: `${s.category}-shaped string` }, `${s.category}:${no}`);
      }
    }
    for (const b of this.blockScanners) {
      const idx = this.open.findIndex((o) => o.scanner === b);
      if (idx === -1) {
        if (b.begin.test(line)) {
          if (b.end.test(line)) this.push({ kind: "secret", category: b.category, file: rel, line: no, endLine: no, message: `${b.category} block` }, `block:${b.category}:${no}:${no}`);
          else this.open.push({ scanner: b, beginLine: no });
        }
      } else if (b.end.test(line)) {
        const o = this.open[idx];
        if (o) this.push({ kind: "secret", category: b.category, file: rel, line: o.beginLine, endLine: no, message: `${b.category} block` }, `block:${b.category}:${o.beginLine}:${no}`);
        this.open.splice(idx, 1);
      }
    }
  }
  /** A block that never ended (truncated PEM) is still a finding: fail closed. */
  finish(): void {
    for (const o of this.open) this.push({ kind: "secret", category: o.scanner.category, file: this.rel, line: o.beginLine, endLine: this.lineNo, message: `${o.scanner.category} block (no end marker)` }, `block:${o.scanner.category}:${o.beginLine}:${this.lineNo}`);
    this.open.length = 0;
  }
}

/** The code points of a raw-character category, in the order of SCANNED_RAW_RANGES. */
function scannedCodePoints(category: string): number[] {
  const out: number[] = [];
  for (const [lo, hi, c] of SCANNED_RAW_RANGES) if (c === category) for (let cp = lo; cp <= hi; cp += 1) out.push(cp);
  return out;
}

/**
 * Raw characters in the lines of one file (ADR-0036, ADR-0037): each position is decided once (I6; the windows of a long line
 * overlap), and a finding is one per line and code point (I9). The positions decided on the current line are kept until a window
 * starts after them; nothing undecided is kept (a run left to the next window is in the text the next window repeats, I5 (c)). Kept
 * apart from FileScanSink, which scanString (and so review-packet) uses: the packet checks the whole forbidden set itself and must not
 * get these as secret findings.
 */
class RawCharSink {
  readonly findings: ScanFinding[] = [];
  exempted = 0;
  private readonly seen = new Set<string>();
  private readonly decided = new Set<number>();
  private lineNo = 0;
  private readonly rel: string;
  private readonly work: { steps: number } | undefined;
  /** Reused for every line (decideRawChars reads it during the call only). */
  private readonly window: RawCharWindow = { offset: 0, final: true, tailStart: 0, firstLine: false };
  private readonly isDecided = (p: number): boolean => this.decided.has(p);
  constructor(rel: string, work?: { steps: number }) {
    this.rel = rel;
    this.work = work;
  }
  onLine(line: string, no: number, at: LinePosition): void {
    if (no !== this.lineNo) {
      this.lineNo = no;
      if (this.decided.size > 0) this.decided.clear();
    } else {
      for (const p of this.decided) if (p < at.offset) this.decided.delete(p);
    }
    this.window.offset = at.offset;
    this.window.final = at.final;
    this.window.tailStart = at.tailStart;
    this.window.firstLine = no === 1;
    for (const d of decideRawChars(line, this.window, this.isDecided, this.work)) {
      this.decided.add(d.position);
      if (d.exempt) {
        this.exempted += 1;
        continue;
      }
      if (this.seen.has(`${no}:${d.codePoint}`)) continue;
      this.seen.add(`${no}:${d.codePoint}`);
      const codePoint = formatCodePoint(d.codePoint);
      this.findings.push({ kind: "raw-char", category: d.category, file: this.rel, line: no, endLine: no, codePoint, message: `raw ${d.category} character ${codePoint}` });
    }
  }
}

/** A path name is decided as one whole text: its ends are the ends of the run, and its first position is no BOM. */
const PATH_NAME: RawCharWindow = { offset: 0, final: true, tailStart: 0, firstLine: false };

/** Raw characters in a repository-relative path (ADR-0036 decision 5, ADR-0037): one finding per code point, without a line; positions left out are counted. */
function checkPathName(rel: string, result: ScanResult): void {
  const seen = new Set<number>();
  for (const d of decideRawChars(rel, PATH_NAME)) {
    if (d.exempt) {
      result.rawCharsExempted += 1;
      continue;
    }
    if (seen.has(d.codePoint)) continue;
    seen.add(d.codePoint);
    const codePoint = formatCodePoint(d.codePoint);
    result.findings.push({ kind: "raw-char", category: d.category, file: rel, codePoint, message: `raw ${d.category} character ${codePoint} in the path` });
  }
}

function scanFile(absRoot: string, rel: string, ctx: FileScanContext): void {
  const { lineScanners, blockScanners, security, result } = ctx;
  const abs = path.join(absRoot, rel);
  let stat;
  try {
    stat = lstatSync(abs);
  } catch (err) {
    if (classifyStatError(err) === "skip") return;
    throw new ScanError(`cannot stat ${rel}: ${(err as Error).message}`);
  }
  if (!stat.isFile()) return; // symlinks / submodules are not scanned
  const sink = new FileScanSink(rel, lineScanners, blockScanners);
  const raw = new RawCharSink(rel);
  const onLine = (line: string, no: number, _continued: boolean, at: LinePosition): void => {
    sink.onLine(line, no);
    raw.onLine(line, no, at);
  };
  const binary = readLines(abs, rel, onLine, assemblerOptions(security, { lineScanners, blockScanners }, sink));
  if (binary) {
    result.skippedBinary += 1;
    return;
  }
  result.filesScanned += 1;
  sink.finish();
  result.findings.push(...sink.findings, ...raw.findings);
  result.rawCharsExempted += raw.exempted;
}

/**
 * Where a delivered text lies in its line (ADR-0037 decision 5): its first unit's position in the line, whether it reaches the end
 * of the line, and — for a window that does not — where its guaranteed tail starts (window length − lineOverlap; the next window
 * starts at or before it). The raw-character check needs it (I5, I6); the secret scanners do not use it.
 */
export interface LinePosition {
  offset: number;
  final: boolean;
  tailStart: number;
}

export interface LineAssemblerOptions {
  maxLineBytes?: number;
  lineOverlap?: number;
  maxCarryBytes?: number;
  /**
   * Internal, for the regression test of the progress invariant only: skips the constructor's
   * check of the limits. Not reachable from the config or the CLI.
   */
  skipOptionValidation?: boolean;
  /** Decides where the next window starts; the assembler applies the overlap floor and the carry cap. */
  carryFrom?: (window: string) => CarryDecision;
  /** Called when a candidate would exceed maxCarryBytes (it is then cut to the overlap). */
  onOversizedCandidate?: (category: string, lineNo: number) => void;
}

/**
 * Splits streamed text into lines for the scanners (pure, testable; M1-R2-004, M2-0). A complete
 * line is delivered once with its 1-based number. A line that grows past maxLineBytes without a
 * newline is delivered in windows: the retained text is emitted with the current line number, the
 * carry (candidate prefix from `carryFrom`, at least the overlap, at most maxCarryBytes) is kept
 * and prefixed to the next window (`continued` windows repeat it), and the line number does not
 * advance until a newline arrives. Each delivery also says where it lies in its line (LinePosition).
 * `maxRetained` records the longest text ever held.
 */
export class LineAssembler {
  private pending = "";
  private lineNo = 1;
  private continued = false;
  /** Position of the pending text's first unit in its line (what the windows of the line dropped so far). */
  private offset = 0;
  private retainedMax = 0;
  private readonly onLine: (line: string, lineNo: number, continued: boolean, position: LinePosition) => void;
  private readonly opts: Required<Pick<LineAssemblerOptions, "maxLineBytes" | "lineOverlap" | "maxCarryBytes">> & LineAssemblerOptions;
  constructor(onLine: (line: string, lineNo: number, continued: boolean, position: LinePosition) => void, opts: LineAssemblerOptions = {}) {
    this.onLine = onLine; // no parameter properties: erasableSyntaxOnly
    this.opts = { ...opts, maxLineBytes: opts.maxLineBytes ?? MAX_LINE_BYTES, lineOverlap: opts.lineOverlap ?? LINE_OVERLAP, maxCarryBytes: opts.maxCarryBytes ?? MAX_CARRY_BYTES };
    // M2-0-R1-001, second layer: the config resolver rejects these limits already; a direct caller
    // gets the same rule enforced here, before any window is processed.
    if (!opts.skipOptionValidation) {
      const problem = windowLimitsProblem({ maxLineBytes: this.opts.maxLineBytes, lineOverlapBytes: this.opts.lineOverlap, maxCarryBytes: this.opts.maxCarryBytes });
      if (problem !== null) throw new ScanError(`invalid window limits: ${problem}`);
    }
  }

  /** Characters currently retained. */
  get pendingLength(): number {
    return this.pending.length;
  }
  /** Longest text held at any moment (for tests: ≤ maxLineBytes + max(push size, maxCarryBytes)). */
  get maxRetained(): number {
    return this.retainedMax;
  }

  push(text: string): void {
    this.pending += text;
    this.retainedMax = Math.max(this.retainedMax, this.pending.length);
    let start = 0;
    for (;;) {
      const nl = this.pending.indexOf("\n", start);
      if (nl === -1) break;
      const line = this.pending.endsWith("\r", nl) ? this.pending.slice(start, nl - 1) : this.pending.slice(start, nl);
      this.onLine(line, this.lineNo, this.continued, { offset: this.offset, final: true, tailStart: line.length });
      this.continued = false;
      this.offset = 0;
      this.lineNo += 1;
      start = nl + 1;
    }
    this.pending = this.pending.slice(start);
    while (this.pending.length > this.opts.maxLineBytes) {
      // Over-long line: scan the window now, keep the candidate prefix (≥ overlap, ≤ carry cap), same line number.
      const window = this.pending;
      const floor = Math.max(0, window.length - this.opts.lineOverlap);
      this.onLine(window, this.lineNo, this.continued, { offset: this.offset, final: false, tailStart: floor });
      const decision = this.opts.carryFrom?.(window) ?? { start: floor, category: null };
      let from = Math.min(decision.start, floor);
      if (window.length - from > this.opts.maxCarryBytes) {
        this.opts.onOversizedCandidate?.(decision.category ?? "unknown", this.lineNo);
        from = floor;
      }
      this.continued = true;
      this.offset += from;
      this.pending = window.slice(from);
      // M2-0-R1-001, third layer: every iteration must shrink the buffer; otherwise fail closed
      // (ScanError → exit 2) instead of looping forever.
      if (this.pending.length >= window.length) {
        throw new ScanError(`sliding window made no progress (line ${this.lineNo}: kept ${this.pending.length} of ${window.length} characters; limits line=${this.opts.maxLineBytes} overlap=${this.opts.lineOverlap} carry=${this.opts.maxCarryBytes})`);
      }
    }
  }

  end(): void {
    if (this.pending.length > 0) {
      const line = this.pending.endsWith("\r") ? this.pending.slice(0, -1) : this.pending;
      this.onLine(line, this.lineNo, this.continued, { offset: this.offset, final: true, tailStart: line.length });
    }
    this.pending = "";
    this.offset = 0;
  }
}

/**
 * Read `abs` in 64 KiB chunks and feed a LineAssembler (CR LF and LF endings, no trailing newline
 * required, windows for over-long lines). Returns true — without calling `onLine` — when the first
 * 8 KiB contain a NUL byte (binary file). Read errors are ScanErrors (fail closed).
 */
function readLines(abs: string, rel: string, onLine: (line: string, lineNo: number, continued: boolean, position: LinePosition) => void, opts: LineAssemblerOptions): boolean {
  let fd: number;
  try {
    fd = openSync(abs, "r");
  } catch (err) {
    throw new ScanError(`cannot read ${rel}: ${(err as Error).message}`);
  }
  const decoder = new StringDecoder("utf8");
  const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  const lines = new LineAssembler(onLine, opts);
  let first = true;
  try {
    for (;;) {
      let n: number;
      try {
        n = readSync(fd, buf, 0, buf.length, null);
      } catch (err) {
        throw new ScanError(`cannot read ${rel}: ${(err as Error).message}`);
      }
      if (n === 0) break;
      if (first) {
        first = false;
        if (buf.subarray(0, Math.min(n, BINARY_PROBE_BYTES)).includes(0)) return true;
      }
      lines.push(decoder.write(buf.subarray(0, n)));
    }
    lines.push(decoder.end());
    lines.end();
    return false;
  } finally {
    closeSync(fd);
  }
}

/** ".env.<suffix>" files whose suffix is an example / sample / template / dist variant carry no secrets by convention. */
function isExampleEnv(base: string, suffixes: readonly string[]): boolean {
  if (base === ".env") return false;
  const suffix = base.slice(".env.".length);
  return suffixes.some((s) => suffix === s || suffix.startsWith(`${s}.`) || suffix.endsWith(`.${s}`));
}

function classifyEnvFile(rel: string, result: ScanResult, suffixes: readonly string[]): void {
  const base = path.basename(rel);
  if (!ENV_FILE.test(base)) return;
  if (isExampleEnv(base, suffixes)) {
    result.exampleEnvFiles.push(rel);
    return;
  }
  result.findings.push({ kind: "tracked-env", file: rel, message: "environment file is tracked by git" });
}

/**
 * .gitignore coverage is decided by git itself (M1-R1-005): `git check-ignore --no-index -v -n` for
 * the configured probe paths. A path counts as protected only when the matching rule comes from a
 * *tracked* .gitignore file of the repository (M2-0 / M1-R3-004) and is not a negation; matches
 * from the user's global excludes file (disabled here), from .git/info/exclude or from an untracked
 * .gitignore are clone-specific and do not count.
 */
function checkGitignore(root: string, result: ScanResult, probes: readonly string[]): void {
  if (!existsSync(path.join(root, ".gitignore"))) {
    result.findings.push({ kind: "gitignore", file: ".gitignore", message: "no .gitignore: .env and .env.* are not ignored" });
    return;
  }
  const protectedPaths = gitIgnoredByRepoRules(root, [...probes]);
  const [first, ...variants] = probes;
  if (first !== undefined && !protectedPaths.has(first)) result.findings.push({ kind: "gitignore", file: ".gitignore", message: `.gitignore does not ignore ${first}` });
  const unprotected = variants.filter((p) => !protectedPaths.has(p));
  if (unprotected.length > 0) result.findings.push({ kind: "gitignore", file: ".gitignore", message: `.gitignore does not ignore .env.* (not ignored: ${unprotected.join(", ")})` });
}

/**
 * Which of `paths` git ignores by a non-negated rule of a *tracked* repository .gitignore (shared
 * with `aiqh init` for the artifacts/ proposal, M1-R2-005). Throws ScanError when git fails.
 */
export function gitIgnoredByRepoRules(root: string, paths: string[]): Set<string> {
  const args = ["-c", "core.excludesFile=/dev/null", "check-ignore", "--no-index", "-v", "-n", "--stdin", "-z"];
  let out: string;
  try {
    out = execFileSync("git", args, { cwd: root, encoding: "utf8", input: paths.map((p) => `${p}\0`).join(""), stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    const e = err as { status?: number; stdout?: string; message: string };
    if (e.status === 1 && typeof e.stdout === "string") out = e.stdout; // exit 1: no path is ignored
    else throw new ScanError(`git check-ignore failed: ${e.message.split("\n")[0]}`);
  }
  const fields = out.split("\0");
  const rows: Array<{ source: string; file: string }> = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [source, , pattern, file] = [fields[i] ?? "", fields[i + 1] ?? "", fields[i + 2] ?? "", fields[i + 3] ?? ""];
    if (source.length === 0 || pattern.startsWith("!")) continue;
    if (path.basename(source) !== ".gitignore") continue; // .git/info/exclude etc. are clone-specific
    rows.push({ source, file });
  }
  const sources = [...new Set(rows.map((r) => r.source))];
  const tracked = trackedPaths(root, sources);
  const protectedPaths = new Set<string>();
  for (const r of rows) if (tracked.has(r.source)) protectedPaths.add(r.file);
  return protectedPaths;
}

/** Which of `paths` are tracked by git (an untracked .gitignore does not exist in a clone). */
function trackedPaths(root: string, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  let out: string;
  try {
    out = execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    throw new ScanError(`git ls-files failed: ${(err as Error).message.split("\n")[0]}`);
  }
  return new Set(out.split("\0").filter((f) => f.length > 0));
}

/** Local calendar date as YYYY-MM-DD (expiry comparisons are string comparisons of ISO dates). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Apply `security.allow` (M2-0 §7): secret-shaped findings ("secret", "oversized-candidate") and raw
 * characters ("raw-char", only by a rule that names their category, ADR-0036) can be suppressed;
 * env / gitignore hygiene findings never are. The first active matching rule wins; suppressed
 * findings, rule usage, unused and expired rules are all recorded.
 */
function applyAllow(result: ScanResult, rules: readonly AllowRule[]): void {
  const today = todayIso();
  const usage = rules.map((r, i) => ({ rule: i, path: r.path, category: r.category ?? null, line: r.line ?? null, reason: r.reason, expires: r.expires ?? null, count: 0, expired: r.expires !== undefined && r.expires < today }));
  const kept: ScanFinding[] = [];
  for (const f of result.findings) {
    const idx = findAllowRule(rules, f, today);
    if (idx === -1) {
      kept.push(f);
      continue;
    }
    const u = usage[idx];
    if (u) u.count += 1;
    result.suppressed.push({ ...f, rule: idx });
  }
  result.findings = kept;
  result.allowUsage = usage;
  result.expiredAllows = usage.filter((u) => u.expired).map((u) => u.rule);
  result.unusedAllows = usage.filter((u) => !u.expired && u.count === 0).map((u) => u.rule);
}

/**
 * Index of the first active (not expired on `today`, YYYY-MM-DD) allow rule that suppresses `f`, or -1.
 * Secret-shaped findings can be suppressed by any matching rule; a raw character only by a rule that
 * names its category (ADR-0036 decision 8). That condition is part of the search, so a rule without
 * a category earlier in the list is passed over, not taken and then refused. Shared with
 * `aiqh review-packet` (M2-1, ADR-0014), which applies the rules to the repository path and line a
 * packet line came from (it passes secret-shaped findings only).
 */
export function findAllowRule(rules: readonly AllowRule[], f: ScanFinding, today: string = todayIso()): number {
  if (f.kind !== "secret" && f.kind !== "oversized-candidate" && f.kind !== "raw-char") return -1;
  return rules.findIndex((r) => !(r.expires !== undefined && r.expires < today) && (f.kind !== "raw-char" || r.category !== undefined) && allowMatches(r, f));
}

function allowMatches(rule: AllowRule, f: ScanFinding): boolean {
  if (rule.category !== undefined && rule.category !== f.category) return false;
  if (rule.line !== undefined && rule.line !== f.line) return false;
  return path.matchesGlob(f.file, rule.path);
}
