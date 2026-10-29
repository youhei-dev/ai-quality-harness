/**
 * Item 54 (v0.17.0, ADR-0039; batch2 design, final, §5): what aiqh passes to a review packet and shows at its exits is decided once —
 * the forbidden set (FORBIDDEN_RANGES, 75 code points, unchanged) and the characters the security scan's decision (ADR-0037) finds
 * outside a complete RGI emoji sequence. The decision is made on the original text, each line (split on LF) as one whole window; the
 * CR before an LF and the CR at the end of the text are not given to it, as LineAssembler does not deliver them (B2-D-R2-001). The
 * packet refuses these characters (security.allow does not apply, B2-Q10 A; --exclude takes a file out), the terminal and Markdown show
 * them as notation, and the JSON files write them as JSON escapes without changing the data (B2-D-R1-002; review-import too, B2-Q11 A).
 * The cases are N1–N8 of the design (§5.8), the linear work, and the two traps of a naive extension (four hex digits above U+FFFF, a
 * decision on the JSON text). Every raw character, every notation and every JSON escape is built at run time: this file holds none of
 * them. The new names are imported from modules that exist before the change, so on the base commit only the cases that use them fail.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewImport } from "../src/commands/review-import.ts";
import { runReviewPacket, type ReviewPacketOptions } from "../src/commands/review-packet.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { escapeForDisplay, safeJson, safeText } from "../src/output.ts";
import { buildReport } from "../src/report/build-report.ts";
import { writeReports } from "../src/report/write.ts";
import { checkValue } from "../src/review/checked.ts";
import { h } from "../src/run-history/html.ts";
import { escapeRawChars, escapeRawCharsAsJson, FORBIDDEN_RANGES, findDisplayRawChars, isExemptionCandidate, jsonForFile, rawCharDetail } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY, scanRawCharText } from "../src/security/scan.ts";
import type { ResolvedSecurity, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const BS = String.fromCharCode(92);
const ch = (...cps: number[]): string => String.fromCodePoint(...cps);
/** The notation of the terminal and Markdown for one code point: a backslash, "u{", the upper-case hex digits, "}". */
const shown = (cp: number): string => `${BS}u{${cp.toString(16).toUpperCase()}}`;
/** One JSON escape of a UTF-16 unit, with the lower-case hex digits JSON.stringify writes. */
const esc = (unit: number): string => `${BS}u${unit.toString(16).padStart(4, "0")}`;
const ZWSP = ch(0x200b);
const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const TAG_A = 0xe0041;
/** man, ZWJ, woman, ZWJ, girl */
const FAMILY = ch(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467);
/** woman, ZWJ, laptop */
const TECH = ch(0x1f469, ZWJ, 0x1f4bb);
/** warning sign, VS16 */
const WARN = ch(0x26a0, VS16);
/** the flag of England: black flag, the tags g b e n g, cancel tag */
const ENGLAND = ch(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
const KEYCAP = ch(0x31, VS16, 0x20e3);
const FLAG_JP = ch(0x1f1ef, 0x1f1f5);
const SKIN = ch(0x1f44d, 0x1f3fd);
/** A control, then the parts of a keycap: a keycap only if the control were a digit (the trap of a decision on the JSON text). */
const BROKEN_KEYCAP = ch(7, VS16, 0x20e3);
/** Small windows of the security scan (as item 49's L16): maxLineBytes 1,024, lineOverlapBytes 256, maxCarryBytes 256. */
const SMALL: ResolvedSecurity = { ...DEFAULT_SECURITY, maxLineBytes: 1024, lineOverlapBytes: 256, maxCarryBytes: 256 };
const FORBIDDEN: number[] = FORBIDDEN_RANGES.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));

/** `text` in pieces of about `size` UTF-16 units, never cut inside a surrogate pair. */
function chunksOf(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; ) {
    let j = Math.min(text.length, i + size);
    if (j < text.length && (text.charCodeAt(j - 1) & 0xfc00) === 0xd800) j += 1;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

const pair = (line: number, cp: number): string => `${line}:${cp.toString(16)}`;

/**
 * N8: one text, three ways. The exit's decision of the security scan's part (findDisplayRawChars, `scanned`) and the security check
 * (scanRawCharText, fed in `chunks`) give the same lines and code points; the candidates the exit leaves raw are the positions the
 * check leaves out; the packet's value check names the same lines and characters as the exit. Answers the number of pairs compared.
 */
function expectOneDecision(text: string, chunks: readonly string[] = [text], security: ResolvedSecurity = DEFAULT_SECURITY): number {
  const hits = findDisplayRawChars(text);
  const exit = [...new Set(hits.filter((x) => x.scanned).map((x) => pair(x.line, x.codePoint)))].sort();
  const scan = scanRawCharText(chunks, security);
  const check = [...new Set(scan.findings.map((f) => pair(f.line ?? 0, Number.parseInt((f.codePoint ?? "U+0").slice(2), 16))))].sort();
  expect(exit, "the lines and code points of the exit and of the security check").toEqual(check);
  const leftRaw = [...escapeRawChars(text)].filter((c) => isExemptionCandidate(c.codePointAt(0) ?? 0)).length;
  expect(leftRaw, "candidates left raw = positions the security check leaves out").toBe(scan.exempted);
  const v = checkValue(text, DEFAULT_SECURITY);
  const packet = v.ok ? [] : v.findings.filter((f) => f.kind === "raw-char").map((f) => `${f.line} ${String(f.detail)}`);
  expect(packet, "the packet's value check").toEqual(hits.map((x) => `${x.line} ${rawCharDetail(x)}`));
  return check.length;
}

describe("N8: one decision for the packet, the exits and the security check (design §5.6, ADR-0039 decision 1)", () => {
  it("N8: several lines, consecutive RGI sequences, sequences at the start and the end of lines, keycap parts, layer (c) outside sequences", () => {
    const text = [
      `${TECH}${FAMILY}${WARN}${ENGLAND} a${ZWSP}b`,
      `${FAMILY}x${ch(ZWJ)}y${KEYCAP}`,
      `${BROKEN_KEYCAP} 1${ch(VS16)} z${ch(0xad)}${ch(TAG_A)}${ch(0xe0100)}`,
      `${ch(0x200e)}${FLAG_JP}${SKIN}${ch(ZWJ)}`,
      `${ch(0x202e)}end${ENGLAND}`,
    ].join("\n");
    expect(expectOneDecision(text)).toBe(10);
    // RGI sequences stay as they are; everything decided is shown as notation (N5)
    const out = escapeRawChars(text);
    for (const s of [TECH, FAMILY, WARN, ENGLAND, KEYCAP, FLAG_JP, SKIN]) expect(out).toContain(s);
    for (const cp of [0x200b, ZWJ, 7, VS16, 0xad, TAG_A, 0xe0100, 0x200e, 0x202e]) expect(out).toContain(shown(cp));
  });

  it("N8 (B2-D-R2-001): CR LF, a lone CR, CR CR LF and a CR at the end — only the CR in the middle of a line is the security check's", () => {
    const cases: Array<[string, string, Array<[number, number, boolean, boolean]>]> = [
      ["CR LF", `a${ZWSP}b\r\nc\r\n`, [[1, 0x200b, false, true], [1, 0x0d, true, false], [2, 0x0d, true, false]]],
      ["a lone CR in a line", `a\rb\n`, [[1, 0x0d, true, true]]],
      ["CR CR LF", `a\r\r\nb`, [[1, 0x0d, true, true], [1, 0x0d, true, false]]],
      ["a CR at the end", `a\nb\r`, [[2, 0x0d, true, false]]],
      ["only a CR", "\r", [[1, 0x0d, true, false]]],
      ["CR LF after a sequence", `${FAMILY}\r\n${ZWSP}\r`, [[1, 0x0d, true, false], [2, 0x200b, false, true], [2, 0x0d, true, false]]],
    ];
    for (const [name, text, expected] of cases) {
      expectOneDecision(text);
      expect(findDisplayRawChars(text).map((x) => [x.line, x.codePoint, x.forbidden, x.scanned]), name).toEqual(expected);
    }
  });

  it("N8: the BOM that starts the text is left out of the decision as at the start of a file; a BOM later is the check's; both are forbidden", () => {
    const text = `${ch(0xfeff)}a${ZWSP}\n${ch(0xfeff)}b`;
    expectOneDecision(text);
    expect(findDisplayRawChars(text).map((x) => [x.line, x.column, x.codePoint, x.forbidden, x.scanned])).toEqual([
      [1, 1, 0xfeff, true, false],
      [1, 3, 0x200b, false, true],
      [2, 1, 0xfeff, true, true],
    ]);
  });

  it("N8 (B2-D-R2-001): a line longer than the windows, CR and LF in two pieces (the security check with small windows)", () => {
    const head = `a${ZWSP}${"-".repeat(1097)}`;
    expect(head.length).toBe(1099);
    expect(expectOneDecision(`${head}\r\nnext${ZWSP}\n`, [`${head}\r`, `\nnext${ZWSP}\n`], SMALL)).toBe(2);
    expect(expectOneDecision(`${head}\rx\n`, [`${head}\r`, "x\n"], SMALL)).toBe(2);
    // the same texts cut at every 97 units
    expectOneDecision(`${head}\r\n${head}\r\n`, chunksOf(`${head}\r\n${head}\r\n`, 97), SMALL);
    expectOneDecision(`${head}\r\r\n${FAMILY}\r`, chunksOf(`${head}\r\r\n${FAMILY}\r`, 97), SMALL);
  });

  it("N8: 400 texts from a fixed seed (sequences, consecutive sequences, ZWJ / VS16 / tags outside them, keycap parts, LF, CR, CR LF, BOM)", () => {
    let seed = 0x5eed54;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pieces = ["a", "b", "1", "#", " ", "日", ch(ZWJ), ch(VS16), ZWSP, ch(TAG_A), ch(0xe007f), ch(0xe0067), TECH, FAMILY, WARN, ENGLAND, KEYCAP, FLAG_JP, SKIN, "\n", "\r", "\r\n", "\t", ch(0xad), ch(0x200e), ch(7), ch(0x20e3), ch(0xe0100), ch(0xfeff), ch(0x1f3f4)];
    let pairs = 0;
    for (let n = 0; n < 400; n += 1) {
      let text = "";
      const length = Math.floor(random() * 40);
      for (let i = 0; i < length; i += 1) text += pieces[Math.floor(random() * pieces.length)] ?? "";
      pairs += expectOneDecision(text, chunksOf(text, 1 + Math.floor(random() * 30)));
    }
    expect(pairs).toBeGreaterThan(2000);
  });
});

describe("N1, N7: the exits show them as notation (ADR-0039 decision 4)", () => {
  it("N1: a line, a block, a JSON document and the dashboard; LF and TAB stay with keep; an RGI sequence stays (N5)", () => {
    const s = `a${ZWSP}b${ch(TAG_A)}\tc\n${FAMILY}${ch(0x202e)}`;
    const notation = `a${shown(0x200b)}b${shown(TAG_A)}`;
    expect(escapeForDisplay(s, "keep")).toBe(`${notation}\tc\n${FAMILY}${shown(0x202e)}`);
    expect(escapeForDisplay(s, "escape")).toBe(`${notation}${shown(9)}c${shown(10)}${FAMILY}${shown(0x202e)}`);
    expect(safeText(s)).toBe(escapeForDisplay(s, "escape"));
    expect(safeText(s, "block")).toBe(`${notation}${shown(9)}c\n${FAMILY}${shown(0x202e)}`);
    expect(String(h(s))).toBe(`${notation}${shown(9)}c${shown(10)}${FAMILY}${shown(0x202e)}`);
    expect(escapeRawChars(`${TECH}${ENGLAND}${KEYCAP}`)).toBe(`${TECH}${ENGLAND}${KEYCAP}`);
  });

  it("N7: the terminal's --json shows the value as a notation string (the terminal is a display; the file keeps the data)", () => {
    const doc = JSON.parse(safeJson({ [`k${ZWSP}`]: [`v${ch(ZWJ)}w`, FAMILY] })) as Record<string, unknown>;
    expect(doc).toEqual({ [`k${shown(0x200b)}`]: [`v${shown(ZWJ)}w`, FAMILY] });
  });

  it("N1, N7: aiqh security-scan shows a zero-width character in a path name as notation, in its lines and in its --json", async () => {
    const t = makeTempDir("aiqh-item54-");
    cleanups.push(t.cleanup);
    const dir = path.join(t.dir, "repo");
    mkdirSync(path.join(dir, "docs"), { recursive: true });
    const name = `docs/a${ZWSP}b.md`;
    writeFileSync(path.join(dir, name), "plain\n");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "--", name], { cwd: dir });
    const lines: string[] = [];
    expect(await runSecurityScan({ cwd: dir, log: (l) => lines.push(l), logError: (l) => lines.push(l) })).toBe(1);
    expect(lines).toContain(`  [raw-char] docs/a${shown(0x200b)}b.md U+200B zero-width (in the path)`);
    expect(lines.join("\n")).not.toContain(ZWSP);
    const json: string[] = [];
    expect(await runSecurityScan({ cwd: dir, json: true, log: (l) => json.push(l), logError: (l) => json.push(l) })).toBe(1);
    const doc = JSON.parse(json.join("\n")) as { findings: Array<{ kind: string; file: string; codePoint?: string }> };
    expect(doc.findings.filter((f) => f.kind === "raw-char").map((f) => [f.file, f.codePoint])).toEqual([[`docs/a${shown(0x200b)}b.md`, "U+200B"]]);
  });
});

interface Repo {
  parent: string;
  dir: string;
  git: (...args: string[]) => string;
  write: (rel: string, content: string) => void;
  commit: (message: string, ...rels: string[]) => string;
}
function repo(): Repo {
  const t = makeTempDir("aiqh-item54-");
  cleanups.push(t.cleanup);
  const dir = path.join(t.dir, "repo");
  mkdirSync(dir);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  const write = (rel: string, content: string): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  };
  const commit = (message: string, ...rels: string[]): string => {
    if (rels.length > 0) git("add", "--", ...rels);
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  write(".gitignore", ".env\n.env.*\n");
  return { parent: t.dir, dir, git, write, commit };
}

interface PacketRun {
  code: number;
  findings: Array<[string, string, number | null, string | null, string | null]>;
  written: boolean;
  output: string;
}
async function packet(r: Repo, base: string, o: Partial<ReviewPacketOptions> = {}): Promise<PacketRun> {
  const output = path.join(r.parent, "packet.md");
  const lines: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${base}..HEAD`, label: "n2", output, toolVersion: "0.0.0-test", today: "2026-10-29", json: true, log: (l) => lines.push(l), logError: () => {}, ...o });
  const doc = JSON.parse(lines.join("\n")) as { findings: Array<{ kind: string; source: string; line: number | null; detail: string | null; location: string | null }> };
  return { code, findings: doc.findings.map((f) => [f.kind, f.source, f.line, f.detail, f.location]), written: existsSync(output), output };
}

describe("N2: the review packet refuses them, in every input (ADR-0039 decision 2)", () => {
  it("N2: a zero-width character in a commit message: no packet, one raw-char finding with the code point and the category", async () => {
    const r = repo();
    const base = r.commit("base", ".gitignore");
    const sha = r.commit(`subject a${ZWSP}b`);
    const p = await packet(r, base);
    expect(p.code).toBe(1);
    expect(p.written).toBe(false);
    expect(p.findings).toEqual([["raw-char", `commit ${sha.slice(0, 12)} message`, 1, "U+200B zero-width", null]]);
  });

  it("N2: a tag character in the request and a zero-width character in a review: both refused", async () => {
    const r = repo();
    const base = r.commit("base", ".gitignore");
    r.commit("empty");
    writeFileSync(path.join(r.parent, "request.md"), `Please review.\nhidden${ch(TAG_A)}text\n`);
    writeFileSync(path.join(r.parent, "review-r1.md"), `Earlier finding${ZWSP}: none.\n`);
    const p = await packet(r, base, { request: "../request.md", review: ["../review-r1.md"] });
    expect(p.code).toBe(1);
    expect(p.written).toBe(false);
    expect(p.findings).toEqual([
      ["raw-char", "request", 2, "U+E0041 tag", null],
      ["raw-char", "review review-r1.md", 1, "U+200B zero-width", null],
    ]);
  });

  it("N2: a zero-width character on the old side of the diff (a file at the start of the range) is refused with its old line", async () => {
    const r = repo();
    r.write("docs/a.md", `one\nx${ZWSP}y\n`);
    const base = r.commit("base", ".gitignore", "docs/a.md");
    r.write("docs/a.md", "one\nplain\n");
    r.commit("fix", "docs/a.md");
    const p = await packet(r, base);
    expect(p.code).toBe(1);
    expect(p.findings).toEqual([["raw-char", "diff docs/a.md", 7, "U+200B zero-width", "docs/a.md@from:2"]]);
  });

  it("N2, B2-Q10 A: a security.allow rule that the security scan honours does not suppress it in the packet; --exclude takes the file out", async () => {
    const r = repo();
    const base = r.commit("base", ".gitignore");
    r.write("docs/zw.md", `x${ZWSP}y\n`);
    r.commit("zw", "docs/zw.md");
    const config = path.join(r.parent, "aiqh.config.jsonc");
    writeFileSync(config, JSON.stringify({ version: 1, project: { name: "n2" }, checks: [{ name: "x", kind: "custom", command: "true" }], security: { allow: [{ path: "docs/**", category: "zero-width", reason: "intended" }] } }));
    expect(await runSecurityScan({ cwd: r.dir, configPath: config, log: () => {}, logError: () => {} })).toBe(0);
    const refused = await packet(r, base, { configPath: config });
    expect(refused.code).toBe(1);
    expect(refused.written).toBe(false);
    expect(refused.findings).toEqual([
      ["raw-char", "full source docs/zw.md", 1, "U+200B zero-width", null],
      ["raw-char", "diff docs/zw.md", 7, "U+200B zero-width", "docs/zw.md:1"],
    ]);
    const excluded = await packet(r, base, { configPath: config, exclude: ["docs/zw.md"] });
    expect(excluded.code).toBe(0);
    expect(excluded.findings).toEqual([]);
    expect(excluded.written).toBe(true);
  });

  it("N2: a path option that resolves to a path with a zero-width character is refused; the message names the code point and the category only", async () => {
    const r = repo();
    const base = r.commit("base", ".gitignore");
    r.write("docs/plain.md", "plain\n");
    r.commit("plain", "docs/plain.md");
    const errors: string[] = [];
    const code = await runReviewPacket({ cwd: r.dir, range: `${base}..HEAD`, label: "n2", output: path.join(r.parent, `d${ZWSP}`, "packet.md"), toolVersion: "0.0.0-test", today: "2026-10-29", log: () => {}, logError: (l) => errors.push(l) });
    expect(code).toBe(2);
    expect(errors.join("\n")).toContain("--output: the resolved path contains U+200B zero-width; choose a path without control, separator, bidi or invisible characters");
    expect(errors.join("\n")).not.toContain(ZWSP);
  });

  it("N2, N6: the value check names an added character by its code point and category, a forbidden one by its code point as before", () => {
    expect(checkValue(`a${ZWSP}b\n${ch(0x202e)}`, DEFAULT_SECURITY)).toEqual({
      ok: false,
      findings: [
        { kind: "raw-char", line: 1, detail: "U+200B zero-width" },
        { kind: "raw-char", line: 2, detail: "U+202E" },
      ],
    });
    expect(checkValue(`${FAMILY} ${ENGLAND} ${KEYCAP}`, DEFAULT_SECURITY).ok).toBe(true);
  });

  it("N5: RGI sequences in a file, a commit message, the request and a review pass, and reach the packet as they are", async () => {
    const r = repo();
    const base = r.commit("base", ".gitignore");
    r.write("docs/emoji.md", `${FAMILY} ${ENGLAND}\n${KEYCAP} ${WARN} ${SKIN}\n`);
    r.commit(`emoji ${TECH}`, "docs/emoji.md");
    writeFileSync(path.join(r.parent, "request.md"), `Please review ${FLAG_JP}.\n`);
    writeFileSync(path.join(r.parent, "review-r1.md"), `none ${RAINBOW()}\n`);
    const p = await packet(r, base, { request: "../request.md", review: ["../review-r1.md"] });
    expect(p.code).toBe(0);
    expect(p.findings).toEqual([]);
    const md = readFileSync(p.output, "utf8");
    for (const s of [FAMILY, ENGLAND, KEYCAP, WARN, SKIN, TECH, FLAG_JP, RAINBOW()]) expect(md).toContain(s);
  });
});

/** The rainbow flag: white flag, VS16, ZWJ, rainbow. */
function RAINBOW(): string {
  return ch(0x1f3f3, VS16, ZWJ, 0x1f308);
}

/** Every string of a JSON value, keys included. */
function stringsOf(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(stringsOf);
  if (v !== null && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [k, ...stringsOf(x)]);
  return [];
}

describe("N4: the JSON files keep the data (ADR-0039 decision 3, B2-D-R1-002)", () => {
  const lone = `x${String.fromCharCode(0xd83d)}y${String.fromCharCode(0xde00)}`;
  const inputs: Array<[string, unknown]> = [
    ["plain text, numbers, booleans, null, empty containers", { a: "abc", b: "日本語", n: [1, -2.5, 0], t: true, z: null, e: [], o: {} }],
    ["a zero-width character in a key and a value", { [`k${ZWSP}ey`]: `v${ZWSP}`, ["k" + TECH]: 2 }],
    ["an array of strings, nested", [[`a${ZWSP}`, TECH], { x: [`${ch(0x202e)}rlo`] }]],
    ["a surrogate pair (not scanned) and lone halves", { s: ch(0x1f600), lone }],
    ["text that already holds backslash-u", { s: `${BS}u200B is text, ${BS}uE0041 too, and ${BS}u{200D}`, t: `${BS}${ZWSP}` }],
    ["ZWJ and VS16 inside and outside RGI sequences", { in: `${FAMILY}${WARN}`, out: `a${ch(ZWJ)}b${ch(VS16)}`, both: `${TECH}${ch(ZWJ)}` }],
    ["the flag of England and a stray tag above U+FFFF", { flag: ENGLAND, tag: `a${ch(TAG_A)}b`, vs: `c${ch(0xe0100)}d` }],
    ["strings over several lines with sequences at the line ends", { s: `${TECH}\n${ch(ZWJ)}${ch(0x1f4bb)}\r\nend${ZWSP}\n${WARN}` }],
    ["a control next to keycap parts", { s: BROKEN_KEYCAP, k: KEYCAP }],
    ["a __proto__ key and a toJSON key stay keys", JSON.parse(`{"__proto__": "p${esc(0x200b)}", "toJSON": 1}`) as unknown],
  ];
  for (const [name, value] of inputs) {
    it(`N4: ${name} — the parsed file is the data, no character the decision shows is left raw, the text is JSON.stringify's when nothing is shown`, () => {
      const text = jsonForFile(value);
      expect(JSON.parse(text)).toStrictEqual(JSON.parse(JSON.stringify(value)));
      expect(findDisplayRawChars(text)).toEqual([]);
      const shownSomewhere = stringsOf(value).some((s) => findDisplayRawChars(s).length > 0);
      if (!shownSomewhere) expect(text).toBe(JSON.stringify(value, null, 2));
      else expect(text).not.toBe(JSON.stringify(value, null, 2));
    });
  }

  it("N4 (a trap): a code point above U+FFFF is written as its surrogate pair, never as four hex digits that read back as two characters", () => {
    const text = jsonForFile({ s: `a${ch(TAG_A)}b` });
    expect(text).toContain(`a${esc(0xdb40)}${esc(0xdc41)}b`);
    expect(text).not.toContain(`${BS}ue0041`);
    expect((JSON.parse(text) as { s: string }).s).toBe(`a${ch(TAG_A)}b`);
  });

  it("N4 (a trap): the decision is on the value — U+FE0F after U+0007 is shown, although on the JSON text its escape's 7 would join a keycap", () => {
    const text = jsonForFile({ s: BROKEN_KEYCAP });
    expect(text).toContain(`"${esc(7)}${esc(VS16)}${ch(0x20e3)}"`);
    // what the naive decision on JSON.stringify's text would decide: nothing to show (the VS16 inside "7", VS16, U+20E3)
    expect(findDisplayRawChars(JSON.stringify(BROKEN_KEYCAP))).toEqual([]);
  });

  it("N6: a value with forbidden characters only is the text of before (JSON.stringify, then the forbidden set as escapes): C0 as JSON.stringify writes them", () => {
    const value = { all: FORBIDDEN.map((cp) => ch(cp)).join(""), list: [`x${ch(0x0d)}y${ch(0x85)}`, `${ch(0x2028)}${FAMILY}`] };
    const text = jsonForFile(value);
    expect(text).toBe(escapeRawCharsAsJson(JSON.stringify(value, null, 2)));
    expect(text).toContain(`x${BS}ry${esc(0x85)}`);
    expect(JSON.parse(text)).toEqual(value);
  });
});

function reportWith(stdout: string, name = "demo"): VerificationReport {
  return buildReport({
    config: { projectRoot: "/proj", configPath: "/proj/aiqh.config.jsonc", project: { name }, outputDir: "/proj/artifacts/verification", security: DEFAULT_SECURITY, checks: [] },
    results: [checkResult({ name: "unit", kind: "unit", status: "FAIL", exitCode: 1, command: "npm test", errorSummary: "exit code 1", stdoutTail: stdout, stderrTail: "" })],
    git: { commit: "0123456789abcdef", branch: "main", dirty: false },
    startedAt: new Date("2026-10-29T00:00:00.000Z"),
    finishedAt: new Date("2026-10-29T00:00:01.000Z"),
    toolVersion: "0.17.0",
    runId: "54545454-5454-4545-8545-545454545454",
  });
}

describe("N4, N1: the verify report files (latest.json and history as JSON escapes, latest.md as notation)", () => {
  it("N4, N1, N5: a check's output and the project name with a zero-width character, a tag and an RGI sequence", () => {
    const report = reportWith(`out a${ZWSP}b ${ch(TAG_A)} ${FAMILY}\nnext\r\n`, `p${ZWSP}`);
    const t = makeTempDir("aiqh-item54-");
    cleanups.push(t.cleanup);
    const paths = writeReports(report, path.join(t.dir, "out"));
    const data = JSON.parse(JSON.stringify(report)) as unknown;
    for (const file of [paths.latestJson, paths.history]) {
      const text = readFileSync(file, "utf8");
      expect(text).toBe(`${jsonForFile(report)}\n`);
      expect(text).toContain(`out a${esc(0x200b)}b ${esc(0xdb40)}${esc(0xdc41)} ${FAMILY}${BS}nnext${BS}r${BS}n`);
      expect(findDisplayRawChars(text)).toEqual([]);
      expect(JSON.parse(text)).toStrictEqual(data);
    }
    const md = readFileSync(paths.latestMd, "utf8");
    expect(md).toContain(`out a${shown(0x200b)}b ${shown(TAG_A)} ${FAMILY}`);
    expect(md).toContain(`p${shown(0x200b)}`);
    expect(findDisplayRawChars(md)).toEqual([]);
  });
});

describe("N3: review-import writes them as JSON escapes and counts them (B2-Q11 A)", () => {
  it("N3: a zero-width character and a tag in a finding: imported, the file keeps the data with escapes, the terminal has the count line", async () => {
    const t = makeTempDir("aiqh-item54-ri-");
    cleanups.push(t.cleanup);
    mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
    const content = `見えない${ZWSP}文字と${ch(TAG_A)}タグ ${FAMILY}`;
    const finding = { id: "P-R1-001", severity: "Low", kind: "バグ", target: "`src/x.ts` 1 行目", content, evidence: "根拠", fix: "修正案", confidence: "確認済み" };
    const body = [
      "# 独立レビュー結果 — demo / R1",
      "",
      "## 指摘",
      "",
      "### P-R1-001",
      "",
      "- **ID**: P-R1-001",
      "- **重要度**: Low",
      "- **種別**: バグ",
      "- **対象**: `src/x.ts` 1 行目",
      `- **内容**: ${content}`,
      "- **根拠**: 根拠",
      "- **修正案**: 修正案",
      "- **確度**: 確認済み",
      "",
      "## 全体の結論",
      "",
      "件数: High 0 / Medium 0 / Low 1",
      "",
      "```aiqh-findings",
      JSON.stringify({ schemaVersion: 1, label: "demo", round: 1, summary: { high: 0, medium: 0, low: 1 }, findings: [finding] }, null, 2),
      "```",
      "",
    ].join("\n");
    const review = path.join(t.dir, "review.md");
    writeFileSync(review, body);
    const out: string[] = [];
    const code = await runReviewImport({ review, label: "demo", round: 1, idPrefix: "P", cwd: t.dir, toolVersion: "0.17.0", now: () => new Date("2026-10-29T00:00:00.000Z"), log: (l) => out.push(l), logError: (l) => out.push(l) });
    expect(code, out.join("\n")).toBe(0);
    const text = readFileSync(path.join(t.dir, "docs", "reviews", "demo", "findings-r1.json"), "utf8");
    expect(text).toContain(`見えない${esc(0x200b)}文字と${esc(0xdb40)}${esc(0xdc41)}タグ ${FAMILY}`);
    expect(findDisplayRawChars(text)).toEqual([]);
    expect((JSON.parse(text) as { findings: Array<{ content: string }> }).findings[0]?.content).toBe(content);
    // the body's line and the JSON block's line hold the two characters each
    const lineOf = (needle: string): number => body.split("\n").findIndex((l) => l.includes(needle)) + 1;
    expect(out).toContain(`forbidden characters in the review: 4 (written as notation; lines ${lineOf("- **内容**")}, ${lineOf('"content"')})`);
    expect(out.join("\n")).not.toContain(ZWSP);
  });
});

describe("linear work (ADR-0039 decision 6; the steps of the decision and the units of the lines it walks)", () => {
  it("1 MiB of sequences and ZWJ, of selectors, of tags, of E characters only, of short runs, and of short CR LF lines: at most 5 steps per unit, and 4 times the input is at most 4.5 times the steps — for the decision and for jsonForFile", () => {
    const shapes: Array<[string, (n: number) => string]> = [
      ["sequences and ZWJ", (n) => `${FAMILY}${ch(ZWJ)}`.repeat(Math.ceil(n / 9))],
      ["selectors", (n) => ch(VS16).repeat(n)],
      ["tags", (n) => ch(TAG_A).repeat(n / 2)],
      ["E characters only, ZWJ at the end", (n) => `${"1".repeat(n - 1)}${ch(ZWJ)}`],
      ["short runs with both ends seen", (n) => `a${FAMILY}b${ch(ZWJ)}`.repeat(Math.ceil(n / 11))],
      ["short CR LF lines, each with a zero-width character", (n) => `a${ZWSP}b\r\n`.repeat(Math.ceil(n / 5))],
    ];
    for (const [name, make] of shapes) {
      const steps = (n: number, file: boolean): number => {
        const work = { steps: 0 };
        if (file) jsonForFile({ s: make(n) }, work);
        else findDisplayRawChars(make(n), work);
        return work.steps;
      };
      for (const file of [false, true]) {
        const big = steps(1024 * 1024, file);
        const quarter = steps(256 * 1024, file);
        expect(big, `${name}${file ? " (jsonForFile)" : ""}`).toBeLessThanOrEqual(5 * 1024 * 1024);
        expect(big, `${name}${file ? " (jsonForFile)" : ""}`).toBeLessThanOrEqual(4.5 * Math.max(quarter, 1));
        expect(big, `${name}: the work is counted`).toBeGreaterThan(0);
      }
    }
  }, 60_000);
});
