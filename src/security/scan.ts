/**
 * Built-in security scan (M1, ADR-0010; M1-R1 revisions). Scans the files git tracks plus the
 * untracked files git would not ignore, line by line (any size), for secret-shaped strings using the
 * shared pattern definitions (R-012); multi-line PEM private keys are found by a begin/end state
 * machine; a single line longer than MAX_LINE_BYTES is scanned as a sliding window so memory stays
 * bounded (M1-R2-004). Reports tracked .env files, untracked .env files that git does not ignore
 * (M1-R2-001) and missing .gitignore coverage (decided by git itself). Findings carry category, path
 * and line numbers only — never the matched value. Files that cannot be stat'ed or read are
 * ScanErrors (exit 2, fail closed); only ENOENT (deleted from the work tree) is skipped (M1-R2-002).
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { SCANNED_CATEGORIES, SECRET_PATTERNS, UNSCANNED_CATEGORIES, stripCanonicalMarkers } from "./patterns.ts";

export class ScanError extends Error {
  override readonly name = "ScanError";
}

export type FindingKind = "secret" | "tracked-env" | "untracked-env" | "gitignore";

export interface ScanFinding {
  kind: FindingKind;
  /** Secret category (secret findings only). */
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
const READ_CHUNK_BYTES = 64 * 1024;
/**
 * Sliding window for over-long lines (M1-R2-004). Both limits are measured in JS string length
 * (UTF-16 code units, at most one per input byte), so the retained text is at most
 * MAX_LINE_BYTES + LINE_OVERLAP code units ≈ 2 × (256 KiB + 4 KiB) bytes of memory whatever the
 * file size. LINE_OVERLAP must cover the longest match of a line-oriented pattern so that a match
 * straddling a window boundary is seen again, whole, at the start of the next window: the longest
 * scanned shapes are a JWT (three base64url segments, in practice well under 2 KiB) and a
 * url-credential (user:password, bounded by whitespace / "@"); 4 KiB leaves ample margin. A single
 * token longer than the overlap can be missed — documented in CONFIG_SPEC §5.3b.
 */
export const MAX_LINE_BYTES = 256 * 1024;
export const LINE_OVERLAP = 4 * 1024;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE_SUFFIXES = ["example", "sample", "template", "dist"];
/** Representative .env paths whose ignore status is asked from git (M1-R1-005). */
const GITIGNORE_PROBE_ENV = ".env";
const GITIGNORE_PROBE_VARIANTS = [".env.local", ".env.production", ".env.development"];

interface LineScanner {
  category: string;
  regex: RegExp;
}
interface BlockScanner {
  category: string;
  begin: RegExp;
  end: RegExp;
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
    else lineScanners.push({ category: p.category, regex: new RegExp(p.pattern.source, p.pattern.flags.includes("g") ? p.pattern.flags : `${p.pattern.flags}g`) });
  }

  for (const rel of tracked) {
    classifyEnvFile(rel, result);
    scanFile(absRoot, rel, lineScanners, blockScanners, result);
  }
  for (const rel of untracked) {
    // An untracked environment file is never read. Git itself has established that it is not
    // ignored (it is listed by --others --exclude-standard), so its existence is the finding
    // (M1-R2-001); example / sample / template / dist files stay informational.
    if (ENV_FILE.test(path.basename(rel))) {
      if (isExampleEnv(path.basename(rel))) result.exampleEnvFiles.push(rel);
      else result.findings.push({ kind: "untracked-env", file: rel, message: "environment file exists but is not ignored by git" });
      continue;
    }
    scanFile(absRoot, rel, lineScanners, blockScanners, result);
  }
  checkGitignore(absRoot, result);
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

function scanFile(absRoot: string, rel: string, lineScanners: LineScanner[], blockScanners: BlockScanner[], result: ScanResult): void {
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
  const binary = readLines(abs, rel, (rawLine, no) => {
    lineNo = no;
    const line = stripCanonicalMarkers(rawLine);
    for (const s of lineScanners) {
      s.regex.lastIndex = 0;
      if (s.regex.test(line)) push({ kind: "secret", category: s.category, file: rel, line: lineNo, endLine: lineNo, message: `${s.category}-shaped string` }, `${s.category}:${lineNo}`);
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
  });
  if (binary) {
    result.skippedBinary += 1;
    return;
  }
  result.filesScanned += 1;
  // A block that never ended (truncated PEM) is still a finding: fail closed.
  for (const o of open) push({ kind: "secret", category: o.scanner.category, file: rel, line: o.beginLine, endLine: lineNo, message: `${o.scanner.category} block (no end marker)` }, `block:${o.scanner.category}:${o.beginLine}:${lineNo}`);
}

/**
 * Splits streamed text into lines for the scanners (pure, testable; M1-R2-004). A complete line is
 * delivered once with its 1-based number. A line that grows past MAX_LINE_BYTES without a newline
 * is delivered in windows: the retained text is emitted with the current line number, the last
 * LINE_OVERLAP characters are kept and prefixed to the next window (so `continued` windows repeat
 * that overlap), and the line number does not advance until a newline arrives. Memory held is at
 * most MAX_LINE_BYTES + LINE_OVERLAP code units (see the constants above).
 */
export class LineAssembler {
  private pending = "";
  private lineNo = 1;
  private continued = false;
  private readonly onLine: (line: string, lineNo: number, continued: boolean) => void;
  constructor(onLine: (line: string, lineNo: number, continued: boolean) => void) {
    this.onLine = onLine; // no parameter properties: erasableSyntaxOnly
  }

  /** Characters currently retained (for tests: never above MAX_LINE_BYTES + LINE_OVERLAP after push). */
  get pendingLength(): number {
    return this.pending.length;
  }

  push(text: string): void {
    this.pending += text;
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
    while (this.pending.length > MAX_LINE_BYTES) {
      // Over-long line: scan the window now, keep only the overlap, same line number.
      this.onLine(this.pending, this.lineNo, this.continued);
      this.continued = true;
      this.pending = this.pending.slice(this.pending.length - LINE_OVERLAP);
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
function readLines(abs: string, rel: string, onLine: (line: string, lineNo: number, continued: boolean) => void): boolean {
  let fd: number;
  try {
    fd = openSync(abs, "r");
  } catch (err) {
    throw new ScanError(`cannot read ${rel}: ${(err as Error).message}`);
  }
  const decoder = new StringDecoder("utf8");
  const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  const lines = new LineAssembler(onLine);
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

/** ".env.example" / ".env.sample" / ".env.template" / ".env.dist" (and dotted variants) carry no secrets by convention. */
function isExampleEnv(base: string): boolean {
  if (base === ".env") return false;
  const suffix = base.slice(".env.".length);
  return ENV_EXAMPLE_SUFFIXES.some((s) => suffix === s || suffix.startsWith(`${s}.`) || suffix.endsWith(`.${s}`));
}

function classifyEnvFile(rel: string, result: ScanResult): void {
  const base = path.basename(rel);
  if (!ENV_FILE.test(base)) return;
  if (isExampleEnv(base)) {
    result.exampleEnvFiles.push(rel);
    return;
  }
  result.findings.push({ kind: "tracked-env", file: rel, message: "environment file is tracked by git" });
}

/**
 * .gitignore coverage is decided by git itself (M1-R1-005): `git check-ignore --no-index -v -n` for
 * representative paths. A path counts as protected only when the matching rule comes from a
 * *tracked* .gitignore file of the repository (M2-0 / M1-R3-004) and is not a negation; matches
 * from the user's global excludes file (disabled here), from .git/info/exclude or from an untracked
 * .gitignore are clone-specific and do not count.
 */
function checkGitignore(root: string, result: ScanResult): void {
  if (!existsSync(path.join(root, ".gitignore"))) {
    result.findings.push({ kind: "gitignore", file: ".gitignore", message: "no .gitignore: .env and .env.* are not ignored" });
    return;
  }
  const probes = [GITIGNORE_PROBE_ENV, ...GITIGNORE_PROBE_VARIANTS];
  const protectedPaths = gitIgnoredByRepoRules(root, probes);
  if (!protectedPaths.has(GITIGNORE_PROBE_ENV)) result.findings.push({ kind: "gitignore", file: ".gitignore", message: ".gitignore does not ignore .env" });
  const unprotected = GITIGNORE_PROBE_VARIANTS.filter((p) => !protectedPaths.has(p));
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
