/**
 * Built-in security scan (M1, ADR-0010; M1-R1 revisions). Scans the files git tracks plus the
 * untracked files git would not ignore, line by line (any size), for secret-shaped strings using the
 * shared pattern definitions (R-012); multi-line PEM private keys are found by a begin/end state
 * machine. Reports tracked .env files and missing .gitignore coverage.
 * Findings carry category, path and line numbers only — never the matched value.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { SCANNED_CATEGORIES, SECRET_PATTERNS, UNSCANNED_CATEGORIES, stripCanonicalMarkers } from "./patterns.ts";

export class ScanError extends Error {
  override readonly name = "ScanError";
}

export type FindingKind = "secret" | "tracked-env" | "gitignore";

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
  /** Tracked .env-style files that are example / template files (informational). */
  exampleEnvFiles: string[];
  scannedCategories: string[];
  unscannedCategories: Array<{ category: string; reason: string }>;
}

const BINARY_PROBE_BYTES = 8 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE_SUFFIXES = ["example", "sample", "template", "dist"];

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
    // An untracked environment file is never read; the .gitignore finding below covers it.
    if (ENV_FILE.test(path.basename(rel))) continue;
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

function scanFile(absRoot: string, rel: string, lineScanners: LineScanner[], blockScanners: BlockScanner[], result: ScanResult): void {
  const abs = path.join(absRoot, rel);
  let stat;
  try {
    stat = lstatSync(abs);
  } catch {
    return; // in the index but deleted from the work tree: nothing to read
  }
  if (!stat.isFile()) return; // symlinks / submodules are not scanned
  const open: Array<{ scanner: BlockScanner; beginLine: number }> = [];
  let lineNo = 0;
  const binary = readLines(abs, rel, (rawLine) => {
    lineNo += 1;
    const line = stripCanonicalMarkers(rawLine);
    for (const s of lineScanners) {
      s.regex.lastIndex = 0;
      if (s.regex.test(line)) result.findings.push({ kind: "secret", category: s.category, file: rel, line: lineNo, endLine: lineNo, message: `${s.category}-shaped string` });
    }
    for (const b of blockScanners) {
      const idx = open.findIndex((o) => o.scanner === b);
      if (idx === -1) {
        if (b.begin.test(line)) {
          if (b.end.test(line)) result.findings.push({ kind: "secret", category: b.category, file: rel, line: lineNo, endLine: lineNo, message: `${b.category} block` });
          else open.push({ scanner: b, beginLine: lineNo });
        }
      } else if (b.end.test(line)) {
        const o = open[idx];
        if (o) result.findings.push({ kind: "secret", category: b.category, file: rel, line: o.beginLine, endLine: lineNo, message: `${b.category} block` });
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
  for (const o of open) result.findings.push({ kind: "secret", category: o.scanner.category, file: rel, line: o.beginLine, endLine: lineNo, message: `${o.scanner.category} block (no end marker)` });
}

/**
 * Read `abs` in 64 KiB chunks and call `onLine` for every line (CR LF and LF endings, no trailing
 * newline required). Returns true — without calling `onLine` — when the first 8 KiB contain a NUL
 * byte (binary file). Read errors are ScanErrors (fail closed).
 */
function readLines(abs: string, rel: string, onLine: (line: string) => void): boolean {
  let fd: number;
  try {
    fd = openSync(abs, "r");
  } catch (err) {
    throw new ScanError(`cannot read ${rel}: ${(err as Error).message}`);
  }
  const decoder = new StringDecoder("utf8");
  const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let pending = "";
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
      pending += decoder.write(buf.subarray(0, n));
      let start = 0;
      for (;;) {
        const nl = pending.indexOf("\n", start);
        if (nl === -1) break;
        onLine(pending.endsWith("\r", nl) ? pending.slice(start, nl - 1) : pending.slice(start, nl));
        start = nl + 1;
      }
      pending = pending.slice(start);
    }
    pending += decoder.end();
    if (pending.length > 0) onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
    return false;
  } finally {
    closeSync(fd);
  }
}

function classifyEnvFile(rel: string, result: ScanResult): void {
  const base = path.basename(rel);
  if (!ENV_FILE.test(base)) return;
  const suffix = base.slice(".env.".length);
  if (base !== ".env" && ENV_EXAMPLE_SUFFIXES.some((s) => suffix === s || suffix.startsWith(`${s}.`) || suffix.endsWith(`.${s}`))) {
    result.exampleEnvFiles.push(rel);
    return;
  }
  result.findings.push({ kind: "tracked-env", file: rel, message: "environment file is tracked by git" });
}

function checkGitignore(root: string, result: ScanResult): void {
  const file = path.join(root, ".gitignore");
  if (!existsSync(file)) {
    result.findings.push({ kind: "gitignore", file: ".gitignore", message: "no .gitignore: .env and .env.* are not ignored" });
    return;
  }
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => l.replace(/^\//, ""));
  const coversEnv = lines.some((l) => l === ".env" || l === ".env*" || l === "*.env");
  const coversEnvVariants = lines.some((l) => l === ".env.*" || l === ".env*");
  if (!coversEnv) result.findings.push({ kind: "gitignore", file: ".gitignore", message: ".gitignore does not ignore .env" });
  if (!coversEnvVariants) result.findings.push({ kind: "gitignore", file: ".gitignore", message: ".gitignore does not ignore .env.* (e.g. .env.local, .env.production)" });
}
