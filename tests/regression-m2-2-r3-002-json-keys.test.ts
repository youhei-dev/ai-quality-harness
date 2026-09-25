/**
 * M2-2-R3-002 (Medium, fixed in v0.5.4): safeJson() escaped and masked the string values of a JSON document but passed its
 * object keys to JSON.stringify as they were, so a key with U+202E came out raw and a secret-shaped key unmasked (v0.5.3;
 * no command's --json has a user-derived key). Now one function processes keys like values (raw characters as notation,
 * then the masker), and two keys of one object that become the same string are an error (fail closed; the CLI reports it
 * as an unexpected error, exit 2).
 * Forbidden characters, LF / TAB and secret shapes are built at run time.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { escapeForDisplay, safeJson, type LineMode } from "../src/output.ts";
import { maskDeep } from "../src/security/mask.ts";
import { isForbiddenCodePoint } from "../src/security/raw-chars.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const RLO = ch(0x202e);
const LF = ch(0x0a);
const TAB = ch(0x09);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const raw = (s: string): number => [...s].filter((c) => isForbiddenCodePoint(c.codePointAt(0) ?? 0)).length;
const notation = (cp: number): string => `\\u{${cp.toString(16).toUpperCase()}}`;

function tempDir(prefix: string): string {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  return t.dir;
}

describe("M2-2-R3-002: object keys go through the boundary like values", () => {
  it("a key with U+202E / U+2028 / U+2029 / CR is escaped", () => {
    for (const cp of [0x202e, 0x2028, 0x2029, 0x0d]) {
      const out = safeJson({ [`k${ch(cp)}x`]: "v", nested: [{ [`n${ch(cp)}`]: 1 }] });
      expect(raw(out), notation(cp)).toBe(0);
      expect(JSON.parse(out), notation(cp)).toEqual({ [`k${notation(cp)}x`]: "v", nested: [{ [`n${notation(cp)}`]: 1 }] });
    }
  });

  it("a key with LF / TAB: \\u{A} / \\u{9} in review-packet's escape mode, JSON's own \\n / \\t in the keep mode", () => {
    const key = `a${LF}b${TAB}c`;
    expect(JSON.parse(safeJson({ [key]: 1 }, "escape"))).toEqual({ [`a${notation(0x0a)}b${notation(0x09)}c`]: 1 });
    const keep = safeJson({ [key]: 1 }, "keep");
    expect(JSON.parse(keep)).toEqual({ [key]: 1 });
    // the key is one line of the JSON document
    expect(keep.split(LF)).toHaveLength(3);
  });

  it("a secret-shaped key is masked (also in a nested object)", () => {
    const out = safeJson({ [SECRET()]: SECRET(), inner: { [`id ${SECRET()}`]: true } });
    expect(out).not.toContain(SECRET());
    expect(JSON.parse(out)).toEqual({ "[REDACTED:aws]": "[REDACTED:aws]", inner: { "id [REDACTED:aws]": true } });
  });

  it("a key named __proto__ stays a key (the copy has no prototype)", () => {
    const value: unknown = JSON.parse('{"__proto__": {"a": 1}, "b": 2}');
    const parsed = JSON.parse(safeJson(value)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["__proto__", "b"]);
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toEqual({ a: 1 });
  });

  it("values keep their current output (v0.5.3: every string escaped, then maskDeep; keys identifiers)", () => {
    // v0.5.3's safeJson, rebuilt here: strings escaped (keys untouched), then maskDeep, then two-space indentation
    const escapeStrings = (v: unknown, mode: LineMode): unknown => {
      if (typeof v === "string") return escapeForDisplay(v, mode);
      if (Array.isArray(v)) return v.map((x: unknown) => escapeStrings(x, mode));
      if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapeStrings(x, mode)]));
      return v;
    };
    const v053 = (v: unknown, mode: LineMode): string => JSON.stringify(maskDeep(escapeStrings(v, mode)), null, 2);
    const value = {
      root: `/tmp/作業/dir${RLO}x`,
      findings: [{ file: `a${TAB}b${LF}c.ts`, line: 1, message: `x ${SECRET()}`, endLine: undefined }],
      configText: `// comment${LF}{${LF}  "version": 1${LF}}${LF}`,
      count: 3,
      ok: true,
      none: null,
      empty: [],
      obj: {},
    };
    for (const mode of ["keep", "escape"] as const) expect(safeJson(value, mode), mode).toBe(v053(value, mode));
    expect(safeJson(value)).toBe(v053(value, "keep"));
  });
});

describe("M2-2-R3-002: a key collision is fail closed", () => {
  it("a key that becomes another key after escaping throws (nothing is returned)", () => {
    expect(() => safeJson({ [`a${RLO}`]: 1, [`a${notation(0x202e)}`]: 2 })).toThrow(/two object keys are the same after escaping and masking/);
    expect(() => safeJson({ list: [{ [`k${LF}`]: 1, [`k${notation(0x0a)}`]: 2 }] }, "escape")).toThrow(/two object keys/);
    // different keys that stay different are fine
    expect(JSON.parse(safeJson({ [`a${RLO}`]: 1, b: 2 }))).toEqual({ [`a${notation(0x202e)}`]: 1, b: 2 });
  });

  it("two secret-shaped keys that are masked alike throw, and so does a key that equals the mask", () => {
    expect(() => safeJson({ [SECRET()]: 1, [fake("AKIA", "ZXCVBNMASDFGHJKL")]: 2 })).toThrow(/two object keys/);
    expect(() => safeJson({ "[REDACTED:aws]": 1, [SECRET()]: 2 })).toThrow(/two object keys/);
  });
});

// ---------------------------------------------------------------------------------------------------
// control: the keys of every command's --json are aiqh's own identifiers, also with user-derived values in the output

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Every object key of a parsed JSON value. */
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out);
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

const git = (dir: string, ...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });

function repoAt(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.local\n.env.production\n.env.development\nartifacts/\n");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git(dir, "add", "--", ".gitignore", "a.ts");
  git(dir, "commit", "-q", "-m", "base");
  return git(dir, "rev-parse", "HEAD").trim();
}

async function jsonOf(run: (log: (l: string) => void, logError: (l: string) => void) => Promise<number>): Promise<{ code: number; json: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run((l) => out.push(l), (l) => err.push(l));
  return { code, json: out.join("\n"), err: err.join("\n") };
}

function identifierKeysOnly(json: string): void {
  const keys = keysOf(JSON.parse(json));
  expect(keys.length).toBeGreaterThan(10);
  expect(keys.filter((k) => !IDENTIFIER.test(k))).toEqual([]);
  expect(raw(json)).toBe(0);
}

describe("M2-2-R3-002 control: every command's --json has identifier keys only (user-derived values in the output)", () => {
  it("security-scan --json: a folder and file names with U+202E, findings, an allow rule that suppresses and one that is unused, an .env example", async () => {
    const t = tempDir("aiqh-r3-002-");
    const dir = path.join(t, `scan${RLO}dir`);
    repoAt(dir);
    writeFileSync(path.join(dir, `k${RLO}.ts`), `export const k = "${SECRET()}";\n`);
    writeFileSync(path.join(dir, `s${RLO}.ts`), `export const s = "${SECRET()}";\n`);
    writeFileSync(path.join(dir, ".env.example"), "X=1\n");
    git(dir, "add", "--", `k${RLO}.ts`, `s${RLO}.ts`, ".env.example");
    writeFileSync(path.join(dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: `p${RLO}` }, checks: [{ name: "c", kind: "unit", command: "node -e 0" }], security: { allow: [{ path: "s*.ts", category: "aws", reason: "fixture key built at run time", expires: "2099-01-01" }, { path: "never/**", reason: "unused rule" }] } }));
    const r = await jsonOf((log, logError) => runSecurityScan({ cwd: dir, json: true, log, logError }));
    expect(r.code).toBe(1);
    identifierKeysOnly(r.json);
    const parsed = JSON.parse(r.json) as { findings: unknown[]; suppressed: unknown[]; unusedAllows: unknown[] };
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.suppressed.length).toBeGreaterThan(0);
    expect(parsed.unusedAllows.length).toBeGreaterThan(0);
  });

  it("init --json: package.json with U+202E in its name and in the keys of scripts and dependencies", async () => {
    const dir = path.join(tempDir("aiqh-r3-002-"), `init${RLO}dir`);
    mkdirSync(dir);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `n${RLO}`, scripts: { [`s${RLO}`]: "x", test: `vitest${RLO}` }, dependencies: { [`d${RLO}`]: "1" }, devDependencies: { vitest: "1", eslint: "1", typescript: "1" } }));
    writeFileSync(path.join(dir, "tsconfig.json"), "{}");
    writeFileSync(path.join(dir, "package-lock.json"), "{}");
    const r = await jsonOf((log, logError) => runInit({ cwd: dir, json: true, toolVersion: "t", log, logError }));
    expect(r.code).toBe(0);
    identifierKeysOnly(r.json);
  });

  it("review-packet --json: a changed file and the request file name with U+202E (findings)", async () => {
    const t = tempDir("aiqh-r3-002-");
    const dir = path.join(t, `rp${RLO}dir`);
    const base = repoAt(dir);
    writeFileSync(path.join(dir, `f${RLO}.ts`), "export const f = 1;\n");
    git(dir, "add", "--", `f${RLO}.ts`);
    git(dir, "commit", "-q", "-m", "f");
    writeFileSync(path.join(t, `req${RLO}.md`), "request\n");
    const r = await jsonOf((log, logError) => runReviewPacket({ cwd: dir, range: `${base}..HEAD`, label: "p", request: path.join(t, `req${RLO}.md`), json: true, toolVersion: "t", log, logError }));
    expect(r.code).toBe(1);
    identifierKeysOnly(r.json);
    expect((JSON.parse(r.json) as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
  });
});
