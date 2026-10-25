/**
 * Item 48 (v0.13.0, ADR-0036): the security scan finds the raw bidirectional controls U+202A–U+202E, U+2066–U+2069 and the line
 * separators U+2028, U+2029 in the content and in the names of the files it lists (tracked, and untracked but not ignored), once per
 * line and code point, and fails (exit 1). Only an allow rule that names the category (`bidi-control` / `line-separator`) suppresses
 * one; scanString and review-packet do not change. The cases are T1–T9 and T11–T13 of the design (T10 and T14 are in
 * parse-security.test.ts); the ones marked "guard" held before the change as well. Every forbidden character is built from its code
 * point, so this file contains none. Only T1 uses the new constants, so the guard cases still run against the code before the change.
 * v0.15.0 (item 49, ADR-0037) changed three expectations, as the batch1 design (final) §4.8 names them: T1 looks at the two categories of
 * layers (a)/(b) only, the T6 case of the direction marks and zero-width characters now finds them (layer (c)), and T9's line of what is
 * checked names the ten categories. Layer (c) itself is tested in regression-item49-raw-chars-layer-c.test.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { parseConfigText } from "../src/config/load.ts";
import { aggregate } from "../src/run-history/aggregate.ts";
import type { HistoryRun, ReadResult, RunCheck } from "../src/run-history/read.ts";
import { SECRET_CATEGORIES } from "../src/security/patterns.ts";
import { formatCodePoint, isForbiddenCodePoint, RAW_CHAR_CATEGORIES, SCANNED_RAW_RANGES, scannedRawCategory } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY, findAllowRule, LineAssembler, scanRepository, scanString, type ScanFinding, type ScanResult } from "../src/security/scan.ts";
import type { AllowRule, ResolvedSecurity } from "../src/types.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const PS = ch(0x2029);
/** The notation of a code point on the terminal and in --json (the backslash is built at run time). */
const shown = (cp: number): string => `${String.fromCharCode(92)}u{${cp.toString(16).toUpperCase()}}`;
/** The eleven code points of the design and their categories, written out (the guard cases do not use the new constants). */
const ELEVEN: ReadonlyArray<readonly [number, string]> = [
  [0x202a, "bidi-control"],
  [0x202b, "bidi-control"],
  [0x202c, "bidi-control"],
  [0x202d, "bidi-control"],
  [0x202e, "bidi-control"],
  [0x2066, "bidi-control"],
  [0x2067, "bidi-control"],
  [0x2068, "bidi-control"],
  [0x2069, "bidi-control"],
  [0x2028, "line-separator"],
  [0x2029, "line-separator"],
];
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const TODAY = "2026-10-19";
const PAST = "2020-01-01";
const BASE = { version: 1, project: { name: "item48" }, checks: [{ name: "x", kind: "custom", command: "true" }] };

interface Repo {
  parent: string;
  dir: string;
  git: (...args: string[]) => string;
  write: (rel: string, content: string | Buffer) => void;
  add: (...rels: string[]) => void;
}

/**
 * A git repository in a temporary parent directory (which also holds the configs, outside the scanned tree). The tracked .gitignore
 * covers the default .env probes, so no hygiene finding changes an exit code, unless `gitignore` says otherwise.
 */
function repo(opts: { gitignore?: string; root?: string } = {}): Repo {
  const t = makeTempDir("aiqh-item48-");
  cleanups.push(t.cleanup);
  const dir = path.join(t.dir, opts.root ?? "repo");
  mkdirSync(dir);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  const write = (rel: string, content: string | Buffer): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  };
  write(".gitignore", opts.gitignore ?? ".env\n.env.*\n");
  git("add", "--", ".gitignore");
  return { parent: t.dir, dir, git, write, add: (...rels) => void git("add", "--", ...rels) };
}

let configs = 0;
function configFile(r: Repo, allow: AllowRule[]): string {
  configs += 1;
  const file = path.join(r.parent, `config-${configs}.jsonc`);
  writeFileSync(file, JSON.stringify({ ...BASE, security: { allow } }));
  return file;
}

const rawOf = (r: ScanResult): ScanFinding[] => r.findings.filter((f) => f.kind === "raw-char");

async function scanText(dir: string, configPath?: string): Promise<{ code: number; out: string; lines: string[] }> {
  const lines: string[] = [];
  const code = await runSecurityScan({ cwd: dir, configPath, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, out: lines.join("\n"), lines };
}

async function scanJson(r: Repo, allow: AllowRule[]): Promise<{ code: number; json: ScanResult }> {
  const lines: string[] = [];
  const code = await runSecurityScan({ cwd: r.dir, json: true, configPath: configFile(r, allow), log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, json: JSON.parse(lines.join("\n")) as ScanResult };
}

/** The finding of a raw character in a name: no line, no end line (common to T7 and T7a–T7g). */
function nameFinding(file: string, cp: number, category = "bidi-control"): ScanFinding {
  const codePoint = formatCodePoint(cp);
  return { kind: "raw-char", category, file, codePoint, message: `raw ${category} character ${codePoint} in the path` };
}

describe("T1: the scanned set", () => {
  it("T1: eleven code points (9 bidi-control, 2 line-separator), all in FORBIDDEN_RANGES and one UTF-16 unit each; the others are not in these two categories (layer (c), item 49); no name shared with the secret categories", () => {
    const all = SCANNED_RAW_RANGES.filter(([, , c]) => c === "bidi-control" || c === "line-separator").flatMap(([lo, hi, category]) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, category] as const));
    expect(all).toEqual(ELEVEN);
    for (const [cp, category] of all) {
      expect(isForbiddenCodePoint(cp)).toBe(true);
      expect(scannedRawCategory(cp)).toBe(category);
      expect(cp).toBeLessThanOrEqual(0xffff);
    }
    expect(all.filter(([, c]) => c === "bidi-control")).toHaveLength(9);
    expect(all.filter(([, c]) => c === "line-separator")).toHaveLength(2);
    for (const cp of [0x200e, 0x200f, 0x061c, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x0d]) expect(["bidi-control", "line-separator"]).not.toContain(scannedRawCategory(cp));
    for (const cp of [0x09, 0x0a]) expect(scannedRawCategory(cp)).toBeNull();
    expect(RAW_CHAR_CATEGORIES.slice(0, 2)).toEqual(["bidi-control", "line-separator"]);
    expect(RAW_CHAR_CATEGORIES.filter((c) => SECRET_CATEGORIES.includes(c))).toEqual([]);
  });
});

describe("T2–T6: the content of the files the scan reads", () => {
  it("T2: each of the eleven in a tracked file: one finding per line with kind, category, file, line and code point; the CLI exits 1", async () => {
    const r = repo();
    r.write("src/eleven.ts", ELEVEN.map(([cp], i) => `const s${i} = "a${ch(cp)}b";\n`).join(""));
    r.add("src/eleven.ts");
    expect(rawOf(scanRepository(r.dir))).toStrictEqual(
      ELEVEN.map(([cp, category], i) => ({ kind: "raw-char", category, file: "src/eleven.ts", line: i + 1, endLine: i + 1, codePoint: formatCodePoint(cp), message: `raw ${category} character ${formatCodePoint(cp)}` })),
    );
    expect((await scanText(r.dir)).code).toBe(1);
  });

  it("T3: one finding per line and code point; two code points on a line are two findings; U+2028 does not start a new line", () => {
    const r = repo();
    r.write("a.txt", `x${RLO}y${RLO}z${RLO}\n${RLO}${LRI}\nm${ch(0x2028)}n\nlast${RLO}\n`);
    r.add("a.txt");
    expect(rawOf(scanRepository(r.dir)).map((f) => [f.line, f.codePoint])).toEqual([
      [1, "U+202E"],
      [2, "U+202E"],
      [2, "U+2066"],
      [3, "U+2028"],
      [4, "U+202E"],
    ]);
  });

  it("T4: a character that two overlapping windows of a long line see, and one across the 64 KiB read chunks: exactly one finding each", () => {
    const r = repo();
    const long = `${"x".repeat(2000)}${RLO}${"y".repeat(10)}`;
    r.write("long.txt", long);
    // The three bytes of U+202E are bytes 65535–65537: the first read chunk ends inside the character.
    r.write("chunk.txt", `${"x".repeat(65535)}${RLO}\nnext\n`);
    r.add("long.txt", "chunk.txt");
    const limits = { maxLineBytes: 1024, lineOverlap: 256, maxCarryBytes: 512 };
    let windows = 0;
    const a = new LineAssembler((line) => {
      if (line.includes(RLO)) windows += 1;
    }, limits);
    a.push(long);
    a.end();
    expect(windows).toBe(2); // the case is real: the same character is in two windows
    const security: ResolvedSecurity = { ...DEFAULT_SECURITY, maxLineBytes: limits.maxLineBytes, lineOverlapBytes: limits.lineOverlap, maxCarryBytes: limits.maxCarryBytes };
    expect(rawOf(scanRepository(r.dir, security)).map((f) => [f.file, f.line, f.codePoint])).toEqual([
      ["chunk.txt", 1, "U+202E"],
      ["long.txt", 1, "U+202E"],
    ]);
  });

  it("T5 (1): the content of an untracked file that git does not ignore", () => {
    const r = repo();
    r.write("untracked.txt", `a${RLO}b\n`);
    expect(rawOf(scanRepository(r.dir)).map((f) => [f.file, f.line, f.codePoint])).toEqual([["untracked.txt", 1, "U+202E"]]);
  });

  it("T5 (2) guard: the content of an untracked file that git ignores is not read", () => {
    const r = repo({ gitignore: ".env\n.env.*\nignored/\n" });
    r.write("ignored/file.txt", `a${RLO}b\n`);
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toEqual([]);
    expect(res.filesUntracked).toBe(0);
  });

  it("T5 (3) guard: an untracked .env that git does not ignore is not read: no raw-char finding, one untracked-env finding", () => {
    const r = repo({ gitignore: "ignored/\n" });
    r.write(".env", `KEY=a${RLO}b\n`);
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toEqual([]);
    expect(res.findings.filter((f) => f.kind === "untracked-env").map((f) => f.file)).toEqual([".env"]);
  });

  it("T6 guard: a binary file (NUL in the first 8 KiB) is not read", () => {
    const r = repo();
    r.write("bin.dat", Buffer.concat([Buffer.from([0]), Buffer.from(`a${RLO}b\n`)]));
    r.add("bin.dat");
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toEqual([]);
    expect(res.skippedBinary).toBe(1);
  });

  it("T6: after a byte that is not valid UTF-8, a U+202E is still found, on its line", () => {
    const r = repo();
    r.write("bad.txt", Buffer.concat([Buffer.from("ok\n"), Buffer.from([0xff, 0x20]), Buffer.from(`x${RLO}\n`)]));
    r.add("bad.txt");
    expect(rawOf(scanRepository(r.dir)).map((f) => [f.file, f.line, f.codePoint])).toEqual([["bad.txt", 2, "U+202E"]]);
  });

  it("T6 guard (a known limit): a UTF-16LE file with a BOM is binary, so its U+202E is not seen", () => {
    const r = repo();
    r.write("utf16.txt", Buffer.from(`${ch(0xfeff)}a${RLO}b\n`, "utf16le"));
    r.add("utf16.txt");
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toEqual([]);
    expect(res.skippedBinary).toBe(1);
  });

  it("T6 guard: a leading BOM and CRLF line ends are not findings", () => {
    const r = repo();
    r.write("bom.txt", `${ch(0xfeff)}title\n`);
    r.write("crlf.txt", "one\r\ntwo\r\n");
    r.add("bom.txt", "crlf.txt");
    expect(rawOf(scanRepository(r.dir))).toEqual([]);
  });

  it("T6 (v0.15.0): the direction marks U+200E, U+200F, U+061C and the zero-width U+200B, U+200D are found as layer (c) (item 49)", () => {
    const r = repo();
    r.write("marks.txt", [0x200e, 0x200f, 0x061c, 0x200b, 0x200d].map((cp) => `a${ch(cp)}b\n`).join(""));
    r.add("marks.txt");
    expect(rawOf(scanRepository(r.dir)).map((f) => [f.line, f.codePoint, f.category])).toEqual([
      [1, "U+200E", "bidi-mark"],
      [2, "U+200F", "bidi-mark"],
      [3, "U+061C", "bidi-mark"],
      [4, "U+200B", "zero-width"],
      [5, "U+200D", "zero-width"],
    ]);
  });
});

describe("T7, T7a–T7g: the names of the listed paths", () => {
  it("T7 (1): a tracked file whose name has U+202E: a finding without line and end line", () => {
    const r = repo();
    const name = `k${RLO}.ts`;
    r.write(name, "export const k = 1;\n");
    r.add(name);
    expect(rawOf(scanRepository(r.dir))).toStrictEqual([nameFinding(name, 0x202e)]);
  });

  it("T7 (2): the terminal line shows the name in notation, without a line number", async () => {
    const r = repo();
    const name = `k${RLO}.ts`;
    r.write(name, "export const k = 1;\n");
    r.add(name);
    const res = await scanText(r.dir);
    expect(res.code).toBe(1);
    expect(res.lines).toContain(`  [raw-char] k${shown(0x202e)}.ts U+202E bidi-control (in the path)`);
  });

  it("T7 (3): --json has no line and no end line for the name", async () => {
    const r = repo();
    const name = `k${RLO}.ts`;
    r.write(name, "export const k = 1;\n");
    r.add(name);
    const { code, json } = await scanJson(r, []);
    expect(code).toBe(1);
    const found = rawOf(json);
    expect(found.map((f) => [f.file, f.codePoint, f.category])).toEqual([[`k${shown(0x202e)}.ts`, "U+202E", "bidi-control"]]);
    expect(found.map((f) => ["line" in f, "endLine" in f])).toEqual([[false, false]]);
  });

  it("T7 (4) guard: a U+202E in the path of the root directory is not a finding", () => {
    const r = repo({ root: `root${RLO}dir` });
    r.write("a.ts", "export const a = 1;\n");
    r.add("a.ts");
    expect(rawOf(scanRepository(r.dir))).toEqual([]);
  });

  it("T7a: a tracked binary file: the name is a finding, the content is not read", () => {
    const r = repo();
    const name = `b${RLO}.bin`;
    r.write(name, Buffer.concat([Buffer.from([0]), Buffer.from(`a${RLO}\n`)]));
    r.add(name);
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toStrictEqual([nameFinding(name, 0x202e)]);
    expect(res.skippedBinary).toBe(1);
  });

  it("T7b: an untracked .env that git does not ignore: the name is a finding besides untracked-env; the content is not read", () => {
    const r = repo({ gitignore: "ignored/\n" });
    const name = `.env.${RLO}local`;
    r.write(name, `KEY=a${RLO}b\n`);
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toStrictEqual([nameFinding(name, 0x202e)]);
    expect(res.findings.filter((f) => f.kind === "untracked-env").map((f) => f.file)).toEqual([name]);
  });

  it("T7c: a tracked symbolic link: the name is a finding; the link is not followed (the target has no finding)", () => {
    const r = repo();
    const name = `l${RLO}nk`;
    r.write("target.txt", "plain\n");
    symlinkSync("target.txt", path.join(r.dir, name));
    r.add("target.txt", name);
    expect(rawOf(scanRepository(r.dir))).toStrictEqual([nameFinding(name, 0x202e)]);
  });

  it("T7d: a submodule (gitlink) whose name has U+2066: the name is a finding", () => {
    const r = repo();
    r.git("commit", "-q", "-m", "base");
    const name = `sub${LRI}`;
    r.git("update-index", "--add", "--cacheinfo", `160000,${r.git("rev-parse", "HEAD").trim()},${name}`);
    mkdirSync(path.join(r.dir, name));
    expect(rawOf(scanRepository(r.dir))).toStrictEqual([nameFinding(name, 0x2066)]);
  });

  it("T7e: a tracked path deleted from the work tree: the name is a finding, and the missing file is no error", () => {
    const r = repo();
    const name = `gone${RLO}.txt`;
    r.write(name, "plain\n");
    r.add(name);
    r.git("commit", "-q", "-m", "base");
    unlinkSync(path.join(r.dir, name));
    expect(rawOf(scanRepository(r.dir))).toStrictEqual([nameFinding(name, 0x202e)]);
  });

  it("T7f: an untracked file that git does not ignore, with U+2029 in its name: a line-separator finding; its content has none", () => {
    const r = repo();
    const name = `u${PS}.txt`;
    r.write(name, "plain\n");
    expect(rawOf(scanRepository(r.dir))).toStrictEqual([nameFinding(name, 0x2029, "line-separator")]);
  });

  it("T7g guard: an untracked file that git ignores is not listed, so its name is not seen", () => {
    const r = repo({ gitignore: ".env\n.env.*\nignored/\n" });
    r.write(`ignored/i${RLO}.txt`, "plain\n");
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toEqual([]);
    expect(res.filesUntracked).toBe(0);
  });
});

describe("T8, T8a–T8f: security.allow and raw characters", () => {
  it("T8: only a rule that names the category suppresses; a rule with a line only that line, never a name; an expired rule nothing; bidi-control no secret; the schema takes both categories", async () => {
    expect(() => parseConfigText(JSON.stringify({ ...BASE, security: { allow: [{ path: "a", category: "bidi-control", reason: "r" }, { path: "b", category: "line-separator", reason: "r" }] } }))).not.toThrow();
    const r = repo();
    const name = `tests/n${RLO}.ts`;
    r.write("tests/a.ts", `one${RLO}\ntwo${RLO}\n`);
    r.write(name, "plain\n");
    r.add("tests/a.ts", name);
    const where = (list: ScanFinding[]): Array<[string, number | null]> => list.filter((f) => f.kind === "raw-char").map((f) => [f.file, f.line ?? null]);
    const all: Array<[string, number | null]> = [["tests/a.ts", 1], ["tests/a.ts", 2], [`tests/n${shown(0x202e)}.ts`, null]];

    const named = await scanJson(r, [{ path: "tests/**", category: "bidi-control", reason: "intended" }]);
    expect(named.code).toBe(0);
    expect(where(named.json.suppressed)).toEqual(all);
    expect(named.json.suppressed.map((s) => s.rule)).toEqual([0, 0, 0]);
    expect(named.json.allowUsage.map((u) => u.count)).toEqual([3]);
    expect(named.json.unusedAllows).toEqual([]);

    const noCategory = await scanJson(r, [{ path: "tests/**", reason: "secrets in tests" }]);
    expect(noCategory.code).toBe(1);
    expect(where(noCategory.json.findings)).toEqual(all);
    expect(noCategory.json.suppressed).toEqual([]);
    expect(noCategory.json.unusedAllows).toEqual([0]);

    const otherCategory = await scanJson(r, [{ path: "tests/**", category: "line-separator", reason: "intended" }]);
    expect(otherCategory.code).toBe(1);
    expect(where(otherCategory.json.findings)).toEqual(all);
    expect(otherCategory.json.unusedAllows).toEqual([0]);

    const oneLine = await scanJson(r, [{ path: "tests/**", category: "bidi-control", line: 1, reason: "intended" }]);
    expect(oneLine.code).toBe(1);
    expect(where(oneLine.json.suppressed)).toEqual([["tests/a.ts", 1]]);
    expect(where(oneLine.json.findings)).toEqual([["tests/a.ts", 2], [`tests/n${shown(0x202e)}.ts`, null]]);

    const expired = await scanJson(r, [{ path: "tests/**", category: "bidi-control", reason: "intended", expires: PAST }]);
    expect(expired.code).toBe(1);
    expect(where(expired.json.findings)).toEqual(all);
    expect(expired.json.expiredAllows).toEqual([0]);

    const s = repo();
    s.write("src/key.ts", `export const k = "${SECRET()}";\n`);
    s.add("src/key.ts");
    const secret = await scanJson(s, [{ path: "**", category: "bidi-control", reason: "intended" }]);
    expect(secret.code).toBe(1);
    expect(secret.json.findings.map((f) => [f.kind, f.file])).toEqual([["secret", "src/key.ts"]]);
    expect(secret.json.unusedAllows).toEqual([0]);
  });

  it("T8a: a rule without a category first, one that names bidi-control second: only the second suppresses, and only it is counted", async () => {
    const r = repo();
    r.write("tests/new.ts", `x${RLO}\n`);
    r.add("tests/new.ts");
    const res = await scanJson(r, [
      { path: "tests/**", reason: "secrets in tests" },
      { path: "tests/**", category: "bidi-control", reason: "intended" },
    ]);
    expect(res.code).toBe(0);
    expect(res.json.suppressed.map((s) => [s.kind, s.file, s.line, s.rule])).toEqual([["raw-char", "tests/new.ts", 1, 1]]);
    expect(res.json.allowUsage.map((u) => u.count)).toEqual([0, 1]);
    expect(res.json.unusedAllows).toEqual([0]);
  });

  it("T8b: the rule that names bidi-control is for another path: nothing suppresses (the rule without a category does not stand in)", async () => {
    const r = repo();
    r.write("tests/new.ts", `x${RLO}\n`);
    r.add("tests/new.ts");
    const res = await scanJson(r, [
      { path: "tests/**", reason: "secrets in tests" },
      { path: "docs/approved.txt", category: "bidi-control", reason: "intended" },
    ]);
    expect(res.code).toBe(1);
    expect(res.json.findings.map((f) => [f.kind, f.file, f.line])).toEqual([["raw-char", "tests/new.ts", 1]]);
    expect(res.json.suppressed).toEqual([]);
    expect(res.json.allowUsage.map((u) => u.count)).toEqual([0, 0]);
    expect(res.json.unusedAllows).toEqual([0, 1]);
  });

  it("T8c: the rule that names bidi-control has expired: nothing suppresses; it is expired, not unused", async () => {
    const r = repo();
    r.write("tests/new.ts", `x${RLO}\n`);
    r.add("tests/new.ts");
    const res = await scanJson(r, [
      { path: "tests/**", reason: "secrets in tests" },
      { path: "tests/**", category: "bidi-control", reason: "intended", expires: PAST },
    ]);
    expect(res.code).toBe(1);
    expect(res.json.findings.map((f) => [f.kind, f.file, f.line])).toEqual([["raw-char", "tests/new.ts", 1]]);
    expect(res.json.suppressed).toEqual([]);
    expect(res.json.expiredAllows).toEqual([1]);
    expect(res.json.unusedAllows).toEqual([0]);
  });

  it("T8d: a secret and a U+202E in one file; the rule without a category suppresses the secret only; usage, unused and expired agree", async () => {
    const r = repo();
    r.write("tests/new.ts", `export const k = "${SECRET()}";\nconst x = "a${RLO}b";\n`);
    r.add("tests/new.ts");
    const allow: AllowRule[] = [
      { path: "tests/**", reason: "secrets in tests" },
      { path: "docs/**", category: "bidi-control", reason: "intended" },
      { path: "tests/**", category: "bidi-control", reason: "intended", expires: PAST },
    ];
    const res = await scanJson(r, allow);
    expect(res.code).toBe(1);
    expect(res.json.suppressed.map((s) => [s.kind, s.file, s.line, s.rule])).toEqual([["secret", "tests/new.ts", 1, 0]]);
    expect(res.json.findings.map((f) => [f.kind, f.file, f.line])).toEqual([["raw-char", "tests/new.ts", 2]]);
    expect(res.json.allowUsage.map((u) => u.count)).toEqual([1, 0, 0]);
    expect(res.json.unusedAllows).toEqual([1]);
    expect(res.json.expiredAllows).toEqual([2]);
    const text = await scanText(r.dir, configFile(r, allow));
    expect(text.lines.filter((l) => l.startsWith("  [allowed] "))).toEqual(["  [allowed] tests/new.ts:1 aws by rule #1"]);
    expect(text.out).not.toContain(SECRET());
  });

  const content: ScanFinding = { kind: "raw-char", category: "bidi-control", file: "tests/new.ts", line: 3, endLine: 3, codePoint: "U+202E", message: "raw bidi-control character U+202E" };
  const inName: ScanFinding = { kind: "raw-char", category: "bidi-control", file: `tests/n${RLO}.ts`, codePoint: "U+202E", message: "raw bidi-control character U+202E in the path" };

  it("T8e: findAllowRule returns the rule that names the category, past an earlier rule without one or with a line", () => {
    expect(findAllowRule([{ path: "tests/**", reason: "r" }, { path: "tests/**", category: "bidi-control", reason: "r" }], content, TODAY)).toBe(1);
    expect(findAllowRule([{ path: "tests/**", category: "bidi-control", line: 1, reason: "r" }, { path: "tests/**", category: "bidi-control", reason: "r" }], inName, TODAY)).toBe(1);
  });

  it("T8f guard: findAllowRule gives -1 for a rule without a category, another category, an expired rule, another line, a line on a name; a secret as before", () => {
    expect(findAllowRule([{ path: "tests/**", reason: "r" }], content, TODAY)).toBe(-1);
    expect(findAllowRule([{ path: "tests/**", category: "line-separator", reason: "r" }], content, TODAY)).toBe(-1);
    expect(findAllowRule([{ path: "tests/**", category: "bidi-control", reason: "r", expires: "2026-01-01" }], content, TODAY)).toBe(-1);
    expect(findAllowRule([{ path: "tests/**", category: "bidi-control", line: 4, reason: "r" }], content, TODAY)).toBe(-1);
    expect(findAllowRule([{ path: "tests/**", category: "bidi-control", line: 1, reason: "r" }], inName, TODAY)).toBe(-1);
    const shaped: ScanFinding = { kind: "secret", category: "aws", file: "tests/new.ts", line: 1, endLine: 1, message: "aws-shaped string" };
    expect(findAllowRule([{ path: "tests/**", reason: "r" }, { path: "tests/**", category: "bidi-control", reason: "r" }], shaped, TODAY)).toBe(0);
    expect(findAllowRule([{ path: "tests/**", category: "bidi-control", reason: "r" }], shaped, TODAY)).toBe(-1);
  });
});

describe("T9: the terminal output", () => {
  it("T9: the findings line ends with raw characters: N; the [raw-char] lines; the line of what is checked; no text of the line; no :undefined", async () => {
    const r = repo();
    const name = `src/n${PS}.ts`;
    r.write("src/a.ts", `const before = "WORDBEFORE${RLO}WORDAFTER";\n`);
    r.write(name, "plain\n");
    r.add("src/a.ts", name);
    const plain = await scanText(r.dir);
    expect(plain.code).toBe(1);
    const checked = plain.lines.findIndex((l) => l.startsWith("raw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029), bidi-mark ("));
    expect(checked).toBeGreaterThan(0);
    expect(plain.lines[checked - 1]).toMatch(/^scanned categories: /);
    expect(plain.lines).toContain("findings: 2 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 2)");
    expect(plain.lines.filter((l) => l.startsWith("  [raw-char] "))).toEqual(["  [raw-char] src/a.ts:1 U+202E bidi-control", `  [raw-char] src/n${shown(0x2029)}.ts U+2029 line-separator (in the path)`]);
    expect(plain.out).not.toContain("WORDBEFORE");
    expect(plain.out).not.toContain("WORDAFTER");

    const allowed = await scanText(
      r.dir,
      configFile(r, [
        { path: "src/a.ts", category: "bidi-control", reason: "intended" },
        { path: "src/n*", category: "line-separator", reason: "intended" },
      ]),
    );
    expect(allowed.code).toBe(0);
    expect(allowed.lines).toContain("findings: 0 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 0)");
    expect(allowed.lines.filter((l) => l.startsWith("  [allowed] "))).toEqual(["  [allowed] src/a.ts:1 bidi-control by rule #1", `  [allowed] src/n${shown(0x2029)}.ts line-separator by rule #2`]);
    expect(allowed.out).not.toContain("undefined");
  });
});

describe("T11: aiqh history", () => {
  it("T11: runs with rawChars make a series after .gitignore; an earlier run without it is an unknown run, never 0", () => {
    const zero = { findings: 0, secretShaped: 0, oversizedCandidates: 0, trackedEnv: 0, untrackedEnv: 0, gitignore: 0, suppressed: 0, allowRulesUsed: 0, expiredAllowRules: 0, unusedAllowRules: 0 };
    const check = (counts: Record<string, number>): RunCheck => ({
      name: "security",
      kind: "security",
      required: true,
      status: "PASS",
      durationMs: 1000,
      timedOut: false,
      timeoutSec: 300,
      parsed: { tool: "aiqh-security-scan", status: "parsed", truncated: false, counts: new Map(Object.entries(counts)) },
    });
    const run = (n: number, counts: Record<string, number>): HistoryRun => {
      const startedAt = new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
      return { source: 1, file: `f${n}.json`, project: "alpha", toolVersion: "0.13.0", configSha256: "a".repeat(64), startedAt, startedMs: Date.parse(startedAt), durationMs: 1000, verdict: "PASSED", dirty: false, interrupted: false, checks: [check(counts)] };
    };
    const runs = [run(0, zero), run(1, { ...zero, rawChars: 0 })];
    const read: Extract<ReadResult, { ok: true }> = { ok: true, sources: [{ index: 1, historyFiles: 2, read: 2, unread: 0, duplicates: 0, ignored: 0, leftoverTemporary: 0 }], unread: [], runs };
    const a = aggregate(read, "0.13.0");
    if (!a.ok) throw new Error(a.kind);
    const counts = a.value.projects[0]?.counts ?? [];
    expect(counts.find((s) => s.key === "rawChars")?.days).toEqual([
      { day: "2026-01-01", value: null, unknownRuns: 1, truncated: false },
      { day: "2026-01-02", value: 0, unknownRuns: 0, truncated: false },
    ]);
    const keys = counts.map((s) => s.key);
    expect(keys.indexOf("rawChars")).toBe(keys.indexOf("gitignore") + 1);
  });
});

describe("T12, T13: scanString and review-packet do not change", () => {
  it("T12 guard: scanString (the path review-packet uses for secrets) finds nothing for each of the eleven", () => {
    for (const [cp] of ELEVEN) expect(scanString(`a${ch(cp)}b\n`)).toEqual([]);
  });

  it("T13: review-packet still rejects a raw U+202E with a bidi-control allow rule for every path (exit 1, raw-char)", async () => {
    const r = repo();
    r.git("commit", "-q", "-m", "base");
    const base = r.git("rev-parse", "HEAD").trim();
    r.write("docs/bidi.md", `x${RLO}y\n`);
    r.add("docs/bidi.md");
    r.git("commit", "-q", "-m", "bidi");
    const out: string[] = [];
    const err: string[] = [];
    const code = await runReviewPacket({
      cwd: r.dir,
      range: `${base}..HEAD`,
      label: "t13",
      configPath: configFile(r, [{ path: "**", category: "bidi-control", reason: "intended" }]),
      toolVersion: "0.0.0-test",
      today: TODAY,
      log: (l) => out.push(l),
      logError: (l) => err.push(l),
    });
    expect(code, err.join("\n")).toBe(1);
    expect(err.join("\n")).toMatch(/\[raw-char\] full source docs\/bidi\.md:1 U\+202E/);
    expect(err.join("\n")).toContain("REVIEW PACKET: not written (findings)");
  });
});
