/**
 * Built-in security scan (M1, ADR-0010; revised by the M1 reviews and M2-0). Scans the files git
 * tracks plus the untracked files git would not ignore, line by line (any size), for secret-shaped
 * strings using the shared pattern definitions (R-012); multi-line PEM private keys are found by a
 * begin/end state machine; a single line longer than maxLineBytes is scanned as a sliding window
 * whose candidate prefixes are carried over (M2-0 / M1-R3-001) so memory stays bounded. Reports
 * tracked .env files, untracked .env files git does not ignore and missing .gitignore coverage
 * (decided by git itself, counting only tracked .gitignore rules). Findings carry category, path
 * and line numbers only — never the matched value. Files that cannot be stat'ed or
 * read are ScanErrors (exit 2, fail closed); only ENOENT is skipped.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { SCANNED_CATEGORIES, SECRET_PATTERNS, UNSCANNED_CATEGORIES, stripCanonicalMarkers, type SecretPattern } from "./patterns.ts";

export class ScanError extends Error {
  override readonly name = "ScanError";
}

export type FindingKind = "secret" | "oversized-candidate" | "tracked-env" | "untracked-env" | "gitignore";

export interface ScanFinding {
  kind: FindingKind;
  /** Secret category (secret / oversized-candidate findings only). */
  category?: string;
  /** Repository-relative path (".gitignore" for gitignore findings). */
  file: string;
  /** 1-based line (secret findings only; the BEGIN line for a PEM block). */
  line?: number;
  /** Last line of a multi-line block (PEM); equals `line` for single-line findings. */
  endLine?: number;
  message: string;
}

export interface ScanResult {
  root: string;
  filesTracked: number;
  /** Untracked files that git would not ignore (`git ls-files --others --exclude-standard`). */
  filesUntracked: number;
  filesScanned: number;
  skippedBinary: number;
  findings: ScanFinding[];
  /** Tracked or untracked .env-style files that are example / template files (informational). */
  exampleEnvFiles: string[];
  scannedCategories: string[];
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
const ENV_EXAMPLE_SUFFIXES = ["example", "sample", "template", "dist"];
/** Representative .env paths whose ignore status is asked from git (M1-R1-005). */
const GITIGNORE_PROBES = [".env", ".env.local", ".env.production", ".env.development"];

interface LineScanner {
  category: string;
  regex: RegExp;
  pattern: SecretPattern;
}
interface BlockScanner {
  category: string;
  begin: RegExp;
  end: RegExp;
}
/** Where the next window should start (M2-0 / M1-R3-001). */
export interface CarryDecision {
  start: number;
  category: string | null;
}

/** Scan the git repository at `root`. Throws ScanError when `root` is not inside a work tree or a file cannot be read. */
export function scanRepository(root: string): ScanResult {
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
    exampleEnvFiles: [],
    scannedCategories: [...SCANNED_CATEGORIES],
    unscannedCategories: UNSCANNED_CATEGORIES.map((u) => ({ ...u })),
  };
  const lineScanners: LineScanner[] = [];
  const blockScanners: BlockScanner[] = [];
  for (const p of SECRET_PATTERNS) {
    if (!p.scan) continue;
    if (p.scanMode === "block" && p.block) blockScanners.push({ category: p.category, begin: p.block.begin, end: p.block.end });
    else lineScanners.push({ category: p.category, pattern: p, regex: new RegExp(p.pattern.source, p.pattern.flags.includes("g") ? p.pattern.flags : `${p.pattern.flags}g`) });
  }
  const ctx: FileScanContext = { lineScanners, blockScanners, result };

  for (const rel of tracked) {
    classifyEnvFile(rel, result, ENV_EXAMPLE_SUFFIXES);
    scanFile(absRoot, rel, ctx);
  }
  for (const rel of untracked) {
    // An untracked environment file is never read. Git itself has established that it is not
    // ignored (it is listed by --others --exclude-standard), so its existence is the finding
    // (M1-R2-001); example / sample / template / dist files stay informational.
    if (ENV_FILE.test(path.basename(rel))) {
      if (isExampleEnv(path.basename(rel), ENV_EXAMPLE_SUFFIXES)) result.exampleEnvFiles.push(rel);
      else result.findings.push({ kind: "untracked-env", file: rel, message: "environment file exists but is not ignored by git" });
      continue;
    }
    scanFile(absRoot, rel, ctx);
  }
  checkGitignore(absRoot, result, GITIGNORE_PROBES);
  return result;
}

function listFiles(root: string, extra: string[]): string[] {
  let out: string;
  try {
    out = execFileSync("git", ["ls-files", "-z", ...extra], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new ScanError(`not a git repository (or git failed): ${root} (${(err as Error).message.split("\n")[0]})`);
  }
  return out.split("\0").filter((f) => f.length > 0);
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
  result: ScanResult;
}

/** Complete matches of a line scanner in `text`. */
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
    out.push({ start: m.index, end: m.index + m[0].length, finding: true });
  }
  return out;
}

/**
 * Candidate prefix to carry into the next window (M2-0 / M1-R3-001): for every line scanner, the
 * last anchor not covered by a complete match whose remainder consists only of characters the
 * pattern may continue with, or a complete match that reaches the window end; the earliest such
 * position across scanners wins. `null` when nothing may continue.
 */
export function carryCandidate(window: string, scanners: readonly LineScanner[]): CarryDecision | null {
  let best: CarryDecision | null = null;
  for (const s of scanners) {
    const matches = findMatches(s, window);
    let candidate = -1;
    for (const m of matches) if (m.end === window.length) candidate = Math.max(candidate, m.start);
    const anchor = s.pattern.anchor;
    if (anchor) {
      const re = new RegExp(anchor.start.source, anchor.start.flags.includes("g") ? anchor.start.flags : `${anchor.start.flags}g`);
      re.lastIndex = 0;
      for (;;) {
        const a = re.exec(window);
        if (a === null) break;
        if (a[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        const covered = matches.some((m) => m.start <= a.index && a.index < m.end);
        if (covered) continue;
        const cont = typeof anchor.continues === "function" ? anchor.continues(a) : anchor.continues;
        const rest = window.slice(a.index + a[0].length);
        const runs = new RegExp(`^(?:${cont.source})*$`, cont.flags.replace("g", "")).test(rest);
        if (runs) candidate = Math.max(candidate, a.index);
      }
    }
    if (candidate >= 0 && (best === null || candidate < best.start)) best = { start: candidate, category: s.category };
  }
  return best;
}

function scanFile(absRoot: string, rel: string, ctx: FileScanContext): void {
  const { lineScanners, blockScanners, result } = ctx;
  const abs = path.join(absRoot, rel);
  let stat;
  try {
    stat = lstatSync(abs);
  } catch (err) {
    if (classifyStatError(err) === "skip") return;
    throw new ScanError(`cannot stat ${rel}: ${(err as Error).message}`);
  }
  if (!stat.isFile()) return; // symlinks / submodules are not scanned
  const open: Array<{ scanner: BlockScanner; beginLine: number }> = [];
  const seen = new Set<string>(); // findings already reported (windows of one line overlap)
  let lineNo = 0;
  const push = (f: ScanFinding, key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    result.findings.push(f);
  };
  const onLine = (rawLine: string, no: number): void => {
    lineNo = no;
    const line = stripCanonicalMarkers(rawLine);
    for (const s of lineScanners) {
      if (findMatches(s, line).some((m) => m.finding)) {
        push({ kind: "secret", category: s.category, file: rel, line: lineNo, endLine: lineNo, message: `${s.category}-shaped string` }, `${s.category}:${lineNo}`);
      }
    }
    for (const b of blockScanners) {
      const idx = open.findIndex((o) => o.scanner === b);
      if (idx === -1) {
        if (b.begin.test(line)) {
          if (b.end.test(line)) push({ kind: "secret", category: b.category, file: rel, line: lineNo, endLine: lineNo, message: `${b.category} block` }, `block:${b.category}:${lineNo}:${lineNo}`);
          else open.push({ scanner: b, beginLine: lineNo });
        }
      } else if (b.end.test(line)) {
        const o = open[idx];
        if (o) push({ kind: "secret", category: b.category, file: rel, line: o.beginLine, endLine: lineNo, message: `${b.category} block` }, `block:${b.category}:${o.beginLine}:${lineNo}`);
        open.splice(idx, 1);
      }
    }
  };
  const binary = readLines(abs, rel, onLine, {
    carryFrom: (window) => carryCandidate(window, lineScanners) ?? { start: window.length, category: null },
    onOversizedCandidate: (category, no) => push({ kind: "oversized-candidate", category, file: rel, line: no, endLine: no, message: `${category} candidate longer than maxCarryBytes could not be scanned completely` }, `oversized:${category}:${no}`),
  });
  if (binary) {
    result.skippedBinary += 1;
    return;
  }
  result.filesScanned += 1;
  // A block that never ended (truncated PEM) is still a finding: fail closed.
  for (const o of open) push({ kind: "secret", category: o.scanner.category, file: rel, line: o.beginLine, endLine: lineNo, message: `${o.scanner.category} block (no end marker)` }, `block:${o.scanner.category}:${o.beginLine}:${lineNo}`);
}

export interface LineAssemblerOptions {
  maxLineBytes?: number;
  lineOverlap?: number;
  maxCarryBytes?: number;
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
 * advance until a newline arrives. `maxRetained` records the longest text ever held.
 */
export class LineAssembler {
  private pending = "";
  private lineNo = 1;
  private continued = false;
  private retainedMax = 0;
  private readonly onLine: (line: string, lineNo: number, continued: boolean) => void;
  private readonly opts: Required<Pick<LineAssemblerOptions, "maxLineBytes" | "lineOverlap" | "maxCarryBytes">> & LineAssemblerOptions;
  constructor(onLine: (line: string, lineNo: number, continued: boolean) => void, opts: LineAssemblerOptions = {}) {
    this.onLine = onLine; // no parameter properties: erasableSyntaxOnly
    this.opts = { ...opts, maxLineBytes: opts.maxLineBytes ?? MAX_LINE_BYTES, lineOverlap: opts.lineOverlap ?? LINE_OVERLAP, maxCarryBytes: opts.maxCarryBytes ?? MAX_CARRY_BYTES };
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
      this.onLine(line, this.lineNo, this.continued);
      this.continued = false;
      this.lineNo += 1;
      start = nl + 1;
    }
    this.pending = this.pending.slice(start);
    while (this.pending.length > this.opts.maxLineBytes) {
      // Over-long line: scan the window now, keep the candidate prefix (≥ overlap, ≤ carry cap), same line number.
      const window = this.pending;
      this.onLine(window, this.lineNo, this.continued);
      const floor = Math.max(0, window.length - this.opts.lineOverlap);
      const decision = this.opts.carryFrom?.(window) ?? { start: floor, category: null };
      let from = Math.min(decision.start, floor);
      if (window.length - from > this.opts.maxCarryBytes) {
        this.opts.onOversizedCandidate?.(decision.category ?? "unknown", this.lineNo);
        from = floor;
      }
      this.continued = true;
      this.pending = window.slice(from);
    }
  }

  end(): void {
    if (this.pending.length > 0) {
      const line = this.pending.endsWith("\r") ? this.pending.slice(0, -1) : this.pending;
      this.onLine(line, this.lineNo, this.continued);
    }
    this.pending = "";
  }
}

/**
 * Read `abs` in 64 KiB chunks and feed a LineAssembler (CR LF and LF endings, no trailing newline
 * required, windows for over-long lines). Returns true — without calling `onLine` — when the first
 * 8 KiB contain a NUL byte (binary file). Read errors are ScanErrors (fail closed).
 */
function readLines(abs: string, rel: string, onLine: (line: string, lineNo: number, continued: boolean) => void, opts: LineAssemblerOptions): boolean {
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
