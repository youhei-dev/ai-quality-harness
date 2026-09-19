/**
 * Built-in security scan (M1, ADR-0010). Scans the files tracked by git plus the untracked files git
 * would not ignore (M1-R1-001) for secret-shaped strings using the shared pattern definitions
 * (R-012), reports committed .env files and missing .gitignore coverage. Findings carry category,
 * path and line only — never the matched value.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
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
  /** 1-based line (secret findings only). */
  line?: number;
  message: string;
}

export interface ScanResult {
  root: string;
  filesTracked: number;
  /** Untracked files that git would not ignore (`git ls-files --others --exclude-standard`). */
  filesUntracked: number;
  filesScanned: number;
  skippedBinary: number;
  skippedLarge: number;
  findings: ScanFinding[];
  /** Tracked .env-style files that are example / template files (informational). */
  exampleEnvFiles: string[];
  scannedCategories: string[];
  unscannedCategories: Array<{ category: string; reason: string }>;
}

export const MAX_FILE_BYTES = 1024 * 1024;
const BINARY_PROBE_BYTES = 8 * 1024;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE_SUFFIXES = ["example", "sample", "template", "dist"];

/** Scan the git repository at `root`. Throws ScanError when `root` is not inside a work tree. */
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
    skippedLarge: 0,
    findings: [],
    exampleEnvFiles: [],
    scannedCategories: [...SCANNED_CATEGORIES],
    unscannedCategories: UNSCANNED_CATEGORIES.map((u) => ({ ...u })),
  };
  const scanners = SECRET_PATTERNS.filter((p) => p.scan).map((p) => ({
    category: p.category,
    regex: new RegExp(p.pattern.source, p.pattern.flags.includes("g") ? p.pattern.flags : `${p.pattern.flags}g`),
  }));

  for (const rel of tracked) {
    classifyEnvFile(rel, result);
    scanFile(absRoot, rel, scanners, result);
  }
  for (const rel of untracked) {
    // An untracked environment file is never read; the .gitignore finding below covers it.
    if (ENV_FILE.test(path.basename(rel))) continue;
    scanFile(absRoot, rel, scanners, result);
  }
  checkGitignore(absRoot, result);
  return result;
}

function scanFile(absRoot: string, rel: string, scanners: Array<{ category: string; regex: RegExp }>, result: ScanResult): void {
  {
    const abs = path.join(absRoot, rel);
    let stat;
    try {
      stat = lstatSync(abs);
    } catch {
      return; // deleted but still in the index
    }
    if (!stat.isFile()) return; // symlinks / submodules are not scanned
    if (stat.size > MAX_FILE_BYTES) {
      result.skippedLarge += 1;
      return;
    }
    const buf = readFileSync(abs);
    if (buf.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
      result.skippedBinary += 1;
      return;
    }
    result.filesScanned += 1;
    const lines = buf.toString("utf8").split(/\r?\n/);
    for (const [i, rawLine] of lines.entries()) {
      const line = stripCanonicalMarkers(rawLine);
      for (const s of scanners) {
        s.regex.lastIndex = 0;
        if (s.regex.test(line)) {
          result.findings.push({
            kind: "secret",
            category: s.category,
            file: rel,
            line: i + 1,
            message: `${s.category}-shaped string`,
          });
        }
      }
    }
  }
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
