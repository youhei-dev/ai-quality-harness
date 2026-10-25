/**
 * Item 49 (v0.15.0, ADR-0037; batch1 design, final, §4): the security scan also finds the invisible characters of layer (c) — eight
 * categories, 4,247 code points — in the content and the names of the files it lists, and fails (exit 1). Only U+200D, U+FE0F and
 * U+E0020–U+E007F that lie inside a complete RGI emoji sequence (Node's \p{RGI_Emoji}) are left out, and only when both ends of
 * their run (the longest stretch of \p{Emoji} / \p{Emoji_Component} characters) are seen (I1–I9); a run whose ends are not seen in
 * a window that a position leaves is a finding there (FAIL side). The number left out counts positions; a finding is one per file,
 * line and code point (one per path and code point for a name). The cases are L1–L24 of the design (L16 with (a)–(g)) and the
 * branches of I5 on decideRawChars. Every raw character is built from its code point, so this file contains none. The new names are
 * imported from modules that exist before the change, so on the base commit only the cases that use them fail.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { ConfigError, parseConfigText } from "../src/config/load.ts";
import { summaryText } from "../src/parse/describe.ts";
import { parseOutputAs } from "../src/parse/read.ts";
import { decideRawChars, FORBIDDEN_RANGES, RAW_CHAR_CATEGORIES, SCANNED_RAW_RANGES, scannedRawCategory, type RawCharWindow } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY, scanRawCharText, scanRepository, scanString, type ScanFinding, type ScanResult } from "../src/security/scan.ts";
import type { AllowRule, ResolvedSecurity } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const ch = (...cps: number[]): string => String.fromCodePoint(...cps);
const ZWJ = 0x200d;
const VS16 = 0xfe0f;
/** man, ZWJ, woman, ZWJ, girl: 3 people, 2 ZWJ, 8 UTF-16 units */
const FAMILY = ch(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467);
/** woman, ZWJ, laptop: 1 ZWJ, 5 units */
const TECH = ch(0x1f469, ZWJ, 0x1f4bb);
/** warning sign and VS16: 1 VS16, 2 units */
const WARN = ch(0x26a0, VS16);
/** the flag of England: black flag, the tags g b e n g, cancel tag: 6 tag characters, 14 units */
const ENGLAND = ch(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
/** The other RGI shapes of I2 and L19: keycap, skin tone, a national flag, the rainbow flag. */
const KEYCAP = ch(0x31, VS16, 0x20e3);
const SKIN = ch(0x1f44d, 0x1f3fd);
const FLAG_JP = ch(0x1f1ef, 0x1f1f5);
const RAINBOW = ch(0x1f3f3, VS16, ZWJ, 0x1f308);
const hex = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

/** The eight categories of layer (c) and their code points, written out from the design (§4.4), not taken from the code. */
const LAYER_C: ReadonlyArray<readonly [string, ReadonlyArray<readonly [number, number]>]> = [
  ["bidi-mark", [[0x061c, 0x061c], [0x200e, 0x200f]]],
  ["zero-width", [[0x200b, 0x200d], [0x2060, 0x2060]]],
  ["bom", [[0xfeff, 0xfeff]]],
  ["soft-hyphen", [[0x00ad, 0x00ad]]],
  ["variation-selector", [[0x180b, 0x180d], [0x180f, 0x180f], [0xfe00, 0xfe0f], [0xe0100, 0xe01ef]]],
  ["tag", [[0xe0000, 0xe007f]]],
  ["control", [[0x0000, 0x0008], [0x000b, 0x001f], [0x007f, 0x009f]]],
  [
    "invisible-other",
    [
      [0x034f, 0x034f], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180e, 0x180e], [0x2061, 0x2065], [0x206a, 0x206f], [0x3164, 0x3164], [0xffa0, 0xffa0],
      [0xfff0, 0xfffb], [0x13430, 0x1343f], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0080, 0xe00ff], [0xe01f0, 0xe0fff],
    ],
  ],
];
const LAYER_C_COUNTS: Record<string, number> = { "bidi-mark": 3, "zero-width": 4, bom: 1, "soft-hyphen": 1, "variation-selector": 260, tag: 128, control: 63, "invisible-other": 3787 };
const ELEVEN: ReadonlyArray<readonly [number, number, string]> = [
  [0x202a, 0x202e, "bidi-control"],
  [0x2066, 0x2069, "bidi-control"],
  [0x2028, 0x2029, "line-separator"],
];
const expand = (ranges: ReadonlyArray<readonly [number, number]>): number[] => ranges.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
const layerC: Array<[number, string]> = LAYER_C.flatMap(([category, ranges]) => expand(ranges).map((cp) => [cp, category] as [number, string]));

/** Small windows of the design (L16): maxLineBytes 1,024, lineOverlapBytes 256, maxCarryBytes 256. */
const SMALL: ResolvedSecurity = { ...DEFAULT_SECURITY, maxLineBytes: 1024, lineOverlapBytes: 256, maxCarryBytes: 256 };
const limits = (maxLineBytes: number, lineOverlapBytes: number, maxCarryBytes: number): ResolvedSecurity => ({ ...DEFAULT_SECURITY, maxLineBytes, lineOverlapBytes, maxCarryBytes });

/** `text` in pieces of about `size` UTF-16 units, never cut inside a surrogate pair (a file is decoded by StringDecoder, which never does). */
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

/** The raw characters of a text fed in the given chunks through the file path (LineAssembler, both sinks), as [line, code point, category]. */
function scanChunks(chunks: string | readonly string[], security: ResolvedSecurity = DEFAULT_SECURITY): { findings: Array<[number, string, string]>; exempted: number } {
  const r = scanRawCharText(typeof chunks === "string" ? [chunks] : chunks, security);
  return { findings: r.findings.map((f) => [f.line ?? 0, f.codePoint ?? "", f.category ?? ""]), exempted: r.exempted };
}

interface Repo {
  parent: string;
  dir: string;
  git: (...args: string[]) => string;
  write: (rel: string, content: string | Buffer) => void;
  add: (...rels: string[]) => void;
}
function repo(): Repo {
  const t = makeTempDir("aiqh-item49-");
  cleanups.push(t.cleanup);
  const dir = path.join(t.dir, "repo");
  mkdirSync(dir);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  const write = (rel: string, content: string | Buffer): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  };
  write(".gitignore", ".env\n.env.*\n");
  git("add", "--", ".gitignore");
  return { parent: t.dir, dir, git, write, add: (...rels) => void git("add", "--", ...rels) };
}
const BASE = { version: 1, project: { name: "item49" }, checks: [{ name: "x", kind: "custom", command: "true" }] };
let configs = 0;
function configFile(r: Repo, allow: AllowRule[]): string {
  configs += 1;
  const file = path.join(r.parent, `config-${configs}.jsonc`);
  writeFileSync(file, JSON.stringify({ ...BASE, security: { allow } }));
  return file;
}
const rawOf = (r: ScanResult): ScanFinding[] => r.findings.filter((f) => f.kind === "raw-char");
const where = (list: ScanFinding[]): Array<[string, number | null, string, string]> => list.filter((f) => f.kind === "raw-char").map((f) => [f.file, f.line ?? null, f.codePoint ?? "", f.category ?? ""]);
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

describe("L1, L20: the scanned set (design §4.4; ADR-0037 decision 1)", () => {
  it("L1: ten categories, the eight of layer (c) with 4,247 code points, the eleven of layers (a)/(b) unchanged, no code point twice; TAB and LF are not scanned; FORBIDDEN_RANGES unchanged", () => {
    expect(RAW_CHAR_CATEGORIES).toEqual(["bidi-control", "line-separator", "bidi-mark", "zero-width", "bom", "soft-hyphen", "variation-selector", "tag", "control", "invisible-other"]);
    const all = SCANNED_RAW_RANGES.flatMap(([lo, hi, category]) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, category] as [number, string]));
    expect(new Set(all.map(([cp]) => cp)).size).toBe(all.length);
    expect(all.length).toBe(4258);
    expect(all.filter(([, c]) => c === "bidi-control" || c === "line-separator")).toEqual(ELEVEN.flatMap(([lo, hi, c]) => expand([[lo, hi]]).map((cp) => [cp, c])));
    const sorted = (list: Array<[number, string]>): Array<[number, string]> => [...list].sort((a, b) => a[0] - b[0]);
    expect(sorted(all.filter(([, c]) => c !== "bidi-control" && c !== "line-separator"))).toEqual(sorted(layerC));
    for (const [category, n] of Object.entries(LAYER_C_COUNTS)) expect(layerC.filter(([, c]) => c === category)).toHaveLength(n);
    for (const [cp, category] of layerC) expect(scannedRawCategory(cp)).toBe(category);
    expect(scannedRawCategory(0x09)).toBeNull();
    expect(scannedRawCategory(0x0a)).toBeNull();
    expect(scannedRawCategory(0x41)).toBeNull();
    expect(scannedRawCategory(0xe1000)).toBeNull();
    expect(FORBIDDEN_RANGES).toEqual([[0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]);
  });

  it("L1: TAB, LF, the CR before LF, the CR at the end of the file and the BOM at the start of the file are not findings", () => {
    expect(scanChunks(`${ch(0xfeff)}a\tb\r\nc\nd\r`)).toEqual({ findings: [], exempted: 0 });
  });

  it(`L20: the differences with the Unicode properties of this Node (Unicode ${process.versions.unicode}) are the five rows of the design`, () => {
    const scanned = new Set(SCANNED_RAW_RANGES.flatMap(([lo, hi]) => expand([[lo, hi]])));
    const prop = (re: RegExp): number[] => {
      const out: number[] = [];
      for (let cp = 0; cp <= 0x10ffff; cp += 1) if ((cp < 0xd800 || cp > 0xdfff) && re.test(String.fromCodePoint(cp))) out.push(cp);
      return out;
    };
    const ranges = (list: number[]): string[] => {
      const out: string[] = [];
      for (let i = 0; i < list.length; ) {
        let j = i;
        while (j + 1 < list.length && list[j + 1] === (list[j] ?? 0) + 1) j += 1;
        out.push(i === j ? hex(list[i] ?? 0) : `${hex(list[i] ?? 0)}-${hex(list[j] ?? 0)}`);
        i = j + 1;
      }
      return out;
    };
    const dicp = prop(/^\p{Default_Ignorable_Code_Point}$/u);
    expect(dicp.filter((cp) => !scanned.has(cp))).toEqual([]);
    const dicpSet = new Set(dicp);
    const beyond = [...scanned].filter((cp) => !dicpSet.has(cp)).sort((a, b) => a - b);
    expect(beyond).toHaveLength(84);
    expect(ranges(beyond)).toEqual(["U+0000-U+0008", "U+000B-U+001F", "U+007F-U+009F", "U+2028-U+2029", "U+FFF9-U+FFFB", "U+13430-U+1343F"]);
    expect(ranges(prop(/^\p{Cf}$/u).filter((cp) => !scanned.has(cp)))).toEqual(["U+0600-U+0605", "U+06DD", "U+070F", "U+0890-U+0891", "U+08E2", "U+110BD", "U+110CD"]);
    expect(ranges(prop(/^\p{Cc}$/u).filter((cp) => !scanned.has(cp)))).toEqual(["U+0009-U+000A"]);
    const selectors = SCANNED_RAW_RANGES.filter(([, , c]) => c === "variation-selector").flatMap(([lo, hi]) => expand([[lo, hi]]));
    expect(selectors.sort((a, b) => a - b)).toEqual(prop(/^\p{Variation_Selector}$/u));
  });
});

describe("L2, L3: the content of the files the scan reads", () => {
  it("L2: every code point of layer (c) but U+0000 (L21) on its own line: one finding each, with its category, line and code point", () => {
    const list = layerC.filter(([cp]) => cp !== 0);
    const text = list.map(([cp]) => `a${ch(cp)}b\n`).join("");
    const r = scanChunks(text);
    expect(r.exempted).toBe(0);
    expect(r.findings).toEqual(list.map(([cp, category], i) => [i + 1, hex(cp), category]));
  });

  it("L2: one character of each category in a tracked file: findings with kind, category, file, line, code point; the CLI exits 1", async () => {
    const r = repo();
    const sample = [0x200e, 0x200b, 0xfeff, 0x00ad, 0xfe0e, 0xe0041, 0x001b, 0x3164];
    r.write("src/c.ts", sample.map((cp, i) => `const s${i} = "a${ch(cp)}b";\n`).join(""));
    r.add("src/c.ts");
    const res = scanRepository(r.dir);
    expect(rawOf(res)).toStrictEqual(
      sample.map((cp, i) => {
        const category = ["bidi-mark", "zero-width", "bom", "soft-hyphen", "variation-selector", "tag", "control", "invisible-other"][i] ?? "";
        return { kind: "raw-char", category, file: "src/c.ts", line: i + 1, endLine: i + 1, codePoint: hex(cp), message: `raw ${category} character ${hex(cp)}` };
      }),
    );
    expect(res.rawCharsExempted).toBe(0);
    expect((await scanText(r.dir)).code).toBe(1);
  });

  it("L3: characters made of a surrogate pair (the tag U+E0041, the selector U+E0100, U+1D173) are found once each", () => {
    expect(scanChunks(`x${ch(0xe0041)}y${ch(0xe0100)}z${ch(0x1d173)}\n`).findings).toEqual([
      [1, "U+E0041", "tag"],
      [1, "U+E0100", "variation-selector"],
      [1, "U+1D173", "invisible-other"],
    ]);
  });
});

describe("L4, L13–L15, L18, L19: emoji sequences (I1–I4)", () => {
  it("L19: the sample sequences are RGI_Emoji in this Node, and all their characters are in E (Emoji or Emoji_Component)", () => {
    for (const s of [FAMILY, TECH, WARN, ENGLAND, KEYCAP, SKIN, FLAG_JP, RAINBOW]) {
      expect(new RegExp(String.raw`^\p{RGI_Emoji}$`, "v").test(s)).toBe(true);
      for (const c of s) expect(new RegExp(String.raw`^[\p{Emoji}\p{Emoji_Component}]$`, "v").test(c)).toBe(true);
    }
  });

  it("L4: a ZWJ family, U+26A0 U+FE0F and the flag of England are no findings; the positions left out are counted (2, 1, 6)", () => {
    expect(scanChunks(`a ${FAMILY} b\n`)).toEqual({ findings: [], exempted: 2 });
    expect(scanChunks(`a ${WARN} b\n`)).toEqual({ findings: [], exempted: 1 });
    expect(scanChunks(`a ${ENGLAND} b\n`)).toEqual({ findings: [], exempted: 6 });
    expect(scanChunks(`${FAMILY}${WARN}\n${ENGLAND}`)).toEqual({ findings: [], exempted: 9 });
  });

  it("L4: U+200D between digits (digits are in E, but no RGI sequence) is a finding", () => {
    expect(scanChunks(`v1${ch(ZWJ)}2\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
  });

  it("L4: in a repository, the --json result and the terminal line give the number left out", async () => {
    const r = repo();
    r.write("doc.md", `ok ${FAMILY} ${WARN}\n`);
    r.add("doc.md");
    const j = await scanJson(r, []);
    expect(j.code).toBe(0);
    expect(rawOf(j.json)).toEqual([]);
    expect(j.json.rawCharsExempted).toBe(3);
    const t = await scanText(r.dir);
    expect(t.code).toBe(0);
    expect(t.lines).toContain("raw characters exempted (emoji sequences): 3");
  });

  it("L13: tag sequences: the RGI flag of England (6 left out); tags that make no RGI flag; tags without a base; extra tags after the flag", () => {
    expect(scanChunks(`${ENGLAND}\n`)).toEqual({ findings: [], exempted: 6 });
    const notRgi = ch(0x1f3f4, 0xe0075, 0xe0073, 0xe0063, 0xe0061, 0xe007f);
    expect(scanChunks(`${notRgi}\n`)).toEqual({ findings: [[1, "U+E0075", "tag"], [1, "U+E0073", "tag"], [1, "U+E0063", "tag"], [1, "U+E0061", "tag"], [1, "U+E007F", "tag"]], exempted: 0 });
    expect(scanChunks(`x${ch(0xe0041, 0xe0042)}\n`)).toEqual({ findings: [[1, "U+E0041", "tag"], [1, "U+E0042", "tag"]], exempted: 0 });
    expect(scanChunks(`${ENGLAND}${ch(0xe0041)}\n`)).toEqual({ findings: [[1, "U+E0041", "tag"]], exempted: 6 });
  });

  it("L14: extra controls next to a sequence: a ZWJ after the family, two ZWJ in a row, a second U+FE0F, U+200B after an emoji, U+2764 U+FE0E", () => {
    expect(scanChunks(`${FAMILY}${ch(ZWJ)}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 2 });
    expect(scanChunks(`${ch(0x1f468, ZWJ, ZWJ, 0x1f469)}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
    expect(scanChunks(`${ch(0x26a0, VS16, VS16)}\n`)).toEqual({ findings: [[1, "U+FE0F", "variation-selector"]], exempted: 1 });
    expect(scanChunks(`${ch(0x1f600, 0x200b)}\n`)).toEqual({ findings: [[1, "U+200B", "zero-width"]], exempted: 0 });
    expect(scanChunks(`${ch(0x2764, 0xfe0e)}\n`)).toEqual({ findings: [[1, "U+FE0E", "variation-selector"]], exempted: 0 });
  });

  it("L15: three sequences in a row: none, the candidates of all three left out; sequence, extra ZWJ, sequence: one finding (the extra ZWJ)", () => {
    expect(scanChunks(`${FAMILY}${TECH}${WARN}\n`)).toEqual({ findings: [], exempted: 4 });
    expect(scanChunks(`${TECH}${ch(ZWJ)}${TECH}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 2 });
  });

  it("L18: U+FE0E, U+E0001, U+E0100 and U+180B are outside E: findings even right after an emoji", () => {
    expect(scanChunks(`${ch(0x1f600, 0xfe0e)} ${ch(0x1f600, 0xe0001)} ${ch(0x1f600, 0xe0100)} ${ch(0x1f600, 0x180b)}\n`)).toEqual({
      findings: [
        [1, "U+FE0E", "variation-selector"],
        [1, "U+E0001", "tag"],
        [1, "U+E0100", "variation-selector"],
        [1, "U+180B", "variation-selector"],
      ],
      exempted: 0,
    });
  });
});

describe("L5, L21–L23: boundaries (R1-006)", () => {
  it("L5, L23: the BOM at the start of the file is not a finding; the second character of line 1, a BOM on line 2 and a second leading BOM are", () => {
    const B = ch(0xfeff);
    expect(scanChunks(`${B}title\n`)).toEqual({ findings: [], exempted: 0 });
    expect(scanChunks(`a${B}b\n`).findings).toEqual([[1, "U+FEFF", "bom"]]);
    expect(scanChunks(`one\n${B}two\n`).findings).toEqual([[2, "U+FEFF", "bom"]]);
    expect(scanChunks(`${B}${B}x\n`).findings).toEqual([[1, "U+FEFF", "bom"]]);
  });

  it("L23: a BOM at the start of the second window of a long first line is not at position 0 of the line: a finding", () => {
    const B = ch(0xfeff);
    // window 1 is 1,100 units (one chunk); its guaranteed tail starts at 844, where the next window starts
    expect(scanChunks([`${B}${"-".repeat(843)}${B}${"-".repeat(255)}`, "\n"], SMALL).findings).toEqual([[1, "U+FEFF", "bom"]]);
    expect(decideRawChars(`${B}x`, { offset: 844, final: true, tailStart: 2, firstLine: true }).map((d) => [d.position, d.exempt])).toEqual([[844, false]]);
    expect(decideRawChars(`${B}x`, { offset: 0, final: true, tailStart: 2, firstLine: true })).toEqual([]);
    expect(decideRawChars(`${B}x`, { offset: 0, final: true, tailStart: 2, firstLine: false }).map((d) => d.codePoint)).toEqual([0xfeff]);
  });

  it("L21: a NUL at byte 8,191 (0-based) makes the file binary (nothing seen); a NUL at byte 8,192 is a control finding with its line", () => {
    const r = repo();
    r.write("bin.dat", Buffer.concat([Buffer.from("a".repeat(8191)), Buffer.from([0]), Buffer.from(`x${ch(0x200b)}\n`)]));
    r.write("late.dat", Buffer.concat([Buffer.from("a".repeat(8192)), Buffer.from([0]), Buffer.from("\nnext\n")]));
    r.add("bin.dat", "late.dat");
    const res = scanRepository(r.dir);
    expect(res.skippedBinary).toBe(1);
    expect(where(rawOf(res))).toEqual([["late.dat", 1, "U+0000", "control"]]);
  });

  it("L22: CR: in the middle of a line a finding; CR LF and the last CR of the file none; CR CR LF the first CR; a CR at the end of a window followed by LF none", () => {
    expect(scanChunks("a\rb\n").findings).toEqual([[1, "U+000D", "control"]]);
    expect(scanChunks("a\r\nb\r\n").findings).toEqual([]);
    expect(scanChunks("a\r").findings).toEqual([]);
    expect(scanChunks("a\r\r\nb\n").findings).toEqual([[1, "U+000D", "control"]]);
    expect(scanChunks([`${"-".repeat(1099)}\r`, "\nnext\n"], SMALL).findings).toEqual([]);
    expect(scanChunks([`${"-".repeat(1099)}\r`, "x\n"], SMALL).findings).toEqual([[1, "U+000D", "control"]]);
    expect(decideRawChars("ab\r", { offset: 0, final: false, tailStart: 0, firstLine: false })).toEqual([]);
    expect(decideRawChars("ab\r", { offset: 0, final: true, tailStart: 3, firstLine: false }).map((d) => d.codePoint)).toEqual([0x0d]);
  });
});

describe("L6, L16: long lines in windows (I5, I6; R2-001)", () => {
  it("L6: with the default windows (a 300 KiB line read in 64 KiB chunks), sequences and a ZWJ outside them at the window ends: no duplicate, no loss", () => {
    const r = repo();
    const piece = `a${FAMILY}b c${ch(ZWJ)}d `;
    let line = "";
    while (line.length < 300 * 1024) line += `${"x".repeat(97)}${piece}`;
    r.write("long.txt", `${line}\n`);
    r.add("long.txt");
    const res = scanRepository(r.dir);
    const pieces = line.split(piece).length - 1;
    expect(where(rawOf(res))).toEqual([["long.txt", 1, "U+200D", "zero-width"]]);
    expect(res.rawCharsExempted).toBe(2 * pieces);
    const whole = scanChunks(`${line}\n`, limits(1024 * 1024, 4096, 65536));
    expect(whole.exempted).toBe(2 * pieces);
  });

  it("L16: the default windows: a sequence across a window end is left out once; a ZWJ outside a sequence across it is one finding", () => {
    // window 1 is the first 64 KiB chunk once the pending text passes 256 KiB: the sequence straddles the end of the fifth chunk
    const end = 5 * 65536;
    const at = (p: number, s: string): string => `${"x".repeat(p)}a${s}b${"y".repeat(end + 2000 - p - s.length - 2)}`;
    expect(chunksOf(at(end - 4, FAMILY), 65536)[4]?.length).toBe(65536);
    expect(scanChunks([...chunksOf(at(end - 4, FAMILY), 65536), "\n"])).toEqual({ findings: [], exempted: 2 });
    expect(scanChunks([...chunksOf(at(end - 2, `1${ch(ZWJ)}2`), 65536), "\n"])).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
  });

  it("L16: small windows: a run longer than the overlap (300 E units) across a window end is a finding although it ends in a sequence (I5 (b))", () => {
    const run = `a${"1".repeat(295)}${TECH}`;
    const chunk1 = `${"-".repeat(1100 - run.length)}${run}`;
    expect(scanChunks([chunk1, "b\n"], SMALL)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
    // the same text in one window: both ends seen, the ZWJ is inside the sequence
    expect(scanChunks([`${chunk1}b\n`], limits(4096, 256, 256))).toEqual({ findings: [], exempted: 1 });
  });

  it("L16: when no position meets I5 (b), the size of the windows does not change the findings or the number left out", () => {
    let line = "";
    for (let i = 0; line.length < 5000; i += 1) line += `${"-".repeat(20 + (i % 37))}a${[FAMILY, TECH, WARN, ENGLAND][i % 4]}b c${ch(ZWJ)}d${ch(0x200b)}`;
    const small = scanChunks([...chunksOf(line, 300), "\n"], SMALL);
    const big = scanChunks([`${line}\n`], limits(1024 * 1024, 4096, 65536));
    expect(small).toEqual(big);
    expect(big.exempted).toBeGreaterThan(100);
  });

  it("L16 (a): the bound of what is decided in the next window: left neighbour to the end of the run 300 units; overlap 300 → left out, overlap 299 → a finding", () => {
    const chunk1 = `${"-".repeat(800)}a${"1".repeat(294)}${TECH}`;
    expect(chunk1.length).toBe(1100);
    expect(scanChunks([chunk1, "b\n"], limits(1024, 300, 300))).toEqual({ findings: [], exempted: 1 });
    expect(scanChunks([chunk1, "b\n"], limits(1024, 299, 300))).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
  });

  it("L16 (b): the end of the file decides a run that was left to the next window: inside a sequence left out, outside a finding; with a last CR the same", () => {
    const inside = `${"-".repeat(800)}a${"1".repeat(294)}${TECH}`;
    const outside = `${"-".repeat(800)}a${"1".repeat(298)}${ch(ZWJ)}`;
    expect(scanChunks([inside], limits(1024, 300, 300))).toEqual({ findings: [], exempted: 1 });
    expect(scanChunks([outside], limits(1024, 300, 300))).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
    expect(scanChunks([inside, "\r"], limits(1024, 300, 300))).toEqual({ findings: [], exempted: 1 });
  });

  it("L16 (c): a newline right after a run that was left to the next window ends the run: left out", () => {
    expect(scanChunks([`${"-".repeat(800)}a${"1".repeat(294)}${TECH}`, "\nnext\n"], limits(1024, 300, 300))).toEqual({ findings: [], exempted: 1 });
  });

  it("L16 (d): a window that keeps more than the overlap (a secret-shaped candidate is carried): a position found in the window before stays a finding; one left out is counted once", () => {
    const security = limits(1024, 256, 1024);
    // the URL anchor at 500 is carried (its user part runs to the window end), so window 2 starts at 500, before the guaranteed tail (844)
    const carried = `${"-".repeat(500)}https://a${"1".repeat(586)}${TECH}`;
    expect(carried.length).toBe(1100);
    expect(scanChunks([carried, "b\n"], security)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
    // a sequence inside the overlap, both ends seen in window 1: left out there, and not counted again in window 2
    const overlap = `${"-".repeat(900)}a${TECH}b${"-".repeat(193)}`;
    expect(overlap.length).toBe(1100);
    expect(scanChunks([overlap, "\n"], SMALL)).toEqual({ findings: [], exempted: 1 });
  });

  it("L16 (e): the guaranteed tail starts between the halves of a tag character of the flag: the next window starts with a half pair, an unknown character, so its run is decided as a finding", () => {
    // 800 filler, "a", 10 digits, the flag at 811 (U+E0062 at 815-816), 247 digits: window 1 is 1,072 units, its tail starts at 816
    const chunk1 = `${"-".repeat(800)}a${"1".repeat(10)}${ENGLAND}${"1".repeat(247)}`;
    expect(chunk1.length).toBe(1072);
    expect(chunk1.charCodeAt(816)).toBeGreaterThanOrEqual(0xdc00);
    const r = scanChunks([chunk1, `${"1".repeat(5)}${ENGLAND}b\n`], SMALL);
    // the flag of window 1 is decided there (I5 (b)); the second flag is in the run that starts with the half pair: a finding, not left out
    expect(r.exempted).toBe(0);
    expect(r.findings).toEqual([
      [1, "U+E0067", "tag"],
      [1, "U+E0062", "tag"],
      [1, "U+E0065", "tag"],
      [1, "U+E006E", "tag"],
      [1, "U+E007F", "tag"],
    ]);
  });

  it("L16 (f): one sequence at every position from 300 units before to 300 after the end of window 1: always left out once or one finding, never neither or twice", () => {
    for (const [name, seq, longRun] of [
      ["short run", `a${TECH}b`, false],
      ["run longer than the overlap", `a${"1".repeat(300)}${TECH}b`, true],
    ] as const) {
      const seen = new Set<string>();
      for (let p = 1100 - 300; p <= 1100 + 300; p += 1) {
        const text = `${"-".repeat(p)}${seq}${"-".repeat(800)}`;
        const cut = (text.charCodeAt(1099) & 0xfc00) === 0xd800 ? 1101 : 1100; // a file is never cut inside a pair (StringDecoder)
        const r = scanChunks([text.slice(0, cut), `${text.slice(cut)}\n`], SMALL);
        const outcome = `${r.exempted}:${r.findings.length}`;
        expect(["1:0", "0:1"], `${name} at ${p}`).toContain(outcome);
        seen.add(outcome);
        const straddles = p < cut && p + seq.length > cut;
        if (!longRun || !straddles) expect(outcome, `${name} at ${p}`).toBe("1:0");
      }
      expect([...seen].sort()).toEqual(longRun ? ["0:1", "1:0"] : ["1:0"]);
    }
  });

  it("L16 (g): a line over five windows with sequences and ZWJ at every distance from the window ends: each decided once, as without windows", () => {
    let line = "";
    for (let i = 0; line.length < 6000; i += 1) line += `${"-".repeat(1 + ((i * 7) % 41))}a${[TECH, FAMILY][i % 2]}b ${i % 5 === 0 ? `c${ch(ZWJ)}d ` : ""}`;
    let windows = 0;
    const small = scanRawCharText([...chunksOf(line, 200), "\n"], SMALL, undefined, () => (windows += 1));
    const big = scanRawCharText([`${line}\n`], limits(1024 * 1024, 4096, 65536));
    expect(windows).toBeGreaterThanOrEqual(5);
    expect(small.exempted).toBe(big.exempted);
    expect(small.findings).toEqual(big.findings);
  });
});

describe("L7, L17: the names of the listed paths", () => {
  it("L7, L17: U+200B in a name is a finding; a name that is an emoji sequence is none (its positions are counted); a ZWJ outside a sequence and one after a slash are findings", async () => {
    const r = repo();
    const zw = `docs/a${ch(0x200b)}b.md`;
    const emoji = `docs/${FAMILY}${WARN}.md`;
    const mixed = `docs/c${ch(ZWJ)}d.md`;
    const slash = `docs/${ch(0x1f469)}/${ch(ZWJ, 0x1f4bb)}.md`;
    for (const name of [zw, emoji, mixed, slash]) r.write(name, "plain\n");
    r.add(zw, emoji, mixed, slash);
    const res = scanRepository(r.dir);
    expect(res.rawCharsExempted).toBe(3);
    expect(where(rawOf(res)).sort()).toEqual(
      [
        [zw, null, "U+200B", "zero-width"],
        [mixed, null, "U+200D", "zero-width"],
        [slash, null, "U+200D", "zero-width"],
      ].sort(),
    );
    const t = await scanText(r.dir);
    // the terminal notation covers FORBIDDEN_RANGES only (unchanged, ADR-0020 decision 3): a zero-width character in a name is printed as it is
    expect(t.lines).toContain(`  [raw-char] ${zw} U+200B zero-width (in the path)`);
  });
});

describe("L8: security.allow and the new categories", () => {
  it("L8: a rule that names zero-width suppresses; a rule without a category, or with another category, does not; the schema takes the eight names", async () => {
    for (const category of ["bidi-mark", "zero-width", "bom", "soft-hyphen", "variation-selector", "tag", "control", "invisible-other"]) {
      expect(() => parseConfigText(JSON.stringify({ ...BASE, security: { allow: [{ path: "a", category, reason: "r" }] } }))).not.toThrow();
    }
    expect(() => parseConfigText(JSON.stringify({ ...BASE, security: { allow: [{ path: "a", category: "emoji", reason: "r" }] } }))).toThrow(ConfigError);
    const r = repo();
    r.write("src/z.py", `name = "a${ch(0x200b)}b"\n`);
    r.add("src/z.py");
    const named = await scanJson(r, [{ path: "src/**", category: "zero-width", reason: "intended" }]);
    expect(named.code).toBe(0);
    expect(where(named.json.suppressed)).toEqual([["src/z.py", 1, "U+200B", "zero-width"]]);
    const none = await scanJson(r, [{ path: "src/**", reason: "secrets in tests" }]);
    expect(none.code).toBe(1);
    expect(where(none.json.findings)).toEqual([["src/z.py", 1, "U+200B", "zero-width"]]);
    for (const other of ["bidi-control", "control", "invisible-other", "variation-selector"]) {
      const o = await scanJson(r, [{ path: "src/**", category: other, reason: "intended" }]);
      expect(o.code, other).toBe(1);
      expect(o.json.unusedAllows, other).toEqual([0]);
    }
  });
});

describe("L9, L10, L12: the output, the parser and review-packet", () => {
  it("L9: the line of what is checked names the ten categories; the line of the number left out follows it", async () => {
    const r = repo();
    r.write("a.txt", `x${ch(0x2060)}y ${TECH}\n`);
    r.add("a.txt");
    const t = await scanText(r.dir);
    expect(t.code).toBe(1);
    const checked = t.lines.indexOf(
      "raw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029), bidi-mark (U+061C, U+200E, U+200F), zero-width (U+200B-U+200D, U+2060), bom (U+FEFF), soft-hyphen (U+00AD), variation-selector (U+180B-U+180D, U+180F, U+FE00-U+FE0F, U+E0100-U+E01EF), tag (U+E0000-U+E007F), control (U+0000-U+0008, U+000B-U+001F, U+007F-U+009F), invisible-other (U+034F, U+115F, U+1160, U+17B4, U+17B5, U+180E, U+2061-U+2065, U+206A-U+206F, U+3164, U+FFA0, U+FFF0-U+FFFB, U+13430-U+1343F, U+1BCA0-U+1BCA3, U+1D173-U+1D17A, U+E0080-U+E00FF, U+E01F0-U+E0FFF)",
    );
    expect(checked).toBeGreaterThan(0);
    expect(t.lines[checked + 1]).toBe("raw characters exempted (emoji sequences): 1");
    expect(t.lines).toContain("  [raw-char] a.txt:1 U+2060 zero-width");
  });

  it("L10: the parser reads the findings line as before; rawChars counts layer (c); the line of the number left out is skipped", async () => {
    const r = repo();
    r.write("a.ts", `const a = "x${ch(0x200b)}y${ch(0x00ad)}z";\n`);
    r.add("a.ts");
    const { code, out } = await scanText(r.dir);
    expect(code).toBe(1);
    const p = parseOutputAs("aiqh-security-scan", { stdout: `${out}\n`, stderr: "", exitCode: code, stdoutTruncated: false, stderrTruncated: false });
    expect(p.status).toBe("parsed");
    expect(p.counts).toMatchObject({ findings: 2, rawChars: 2 });
    expect(p.items).toEqual([
      { kind: "raw-char", name: "a.ts:1 U+200B zero-width" },
      { kind: "raw-char", name: "a.ts:1 U+00AD soft-hyphen" },
    ]);
    expect(summaryText(p)).toContain("raw characters 2");
  });

  it("L12 guard: review-packet does not change: a zero-width character in the diff passes its raw-character check (it stops FORBIDDEN_RANGES only)", async () => {
    const r = repo();
    r.git("commit", "-q", "-m", "base");
    const base = r.git("rev-parse", "HEAD").trim();
    r.write("docs/zw.md", `x${ch(0x200b)}y ${FAMILY}\n`);
    r.add("docs/zw.md");
    r.git("commit", "-q", "-m", "zw");
    const err: string[] = [];
    const code = await runReviewPacket({ cwd: r.dir, range: `${base}..HEAD`, label: "l12", output: path.join(r.parent, "packet.md"), toolVersion: "0.0.0-test", today: "2026-10-25", log: () => {}, logError: (l) => err.push(l) });
    expect(code, err.join("\n")).toBe(0);
    expect(scanString(`x${ch(0x200b)}y\n`)).toEqual([]);
  });
});

describe("L11: linear work (the steps of decideRawChars: membership tests and RGI matches)", () => {
  it("L11: 1 MiB of sequences and ZWJ, of selectors, of tags, of E characters only, of short runs, and one run in one window: at most 3 steps per unit, and 4 times the input is at most 4.5 times the steps", () => {
    const shapes: Array<[string, (n: number) => string, ResolvedSecurity]> = [
      ["sequences and ZWJ", (n) => `${FAMILY}${ch(ZWJ)}`.repeat(Math.ceil(n / 9)), DEFAULT_SECURITY],
      ["selectors", (n) => ch(VS16).repeat(n), DEFAULT_SECURITY],
      ["tags", (n) => ch(0xe0041).repeat(n / 2), DEFAULT_SECURITY],
      ["E characters only, ZWJ at the end", (n) => `${"1".repeat(n - 1)}${ch(ZWJ)}`, DEFAULT_SECURITY],
      ["short runs with both ends seen", (n) => `a${FAMILY}b${ch(ZWJ)}`.repeat(Math.ceil(n / 11)), DEFAULT_SECURITY],
      ["one long run with both ends seen (one window)", (n) => `a${FAMILY.repeat(Math.ceil(n / 8))}b`, limits(8 * 1024 * 1024, 4096, 65536)],
    ];
    for (const [name, make, security] of shapes) {
      const steps = (n: number): number => {
        const work = { steps: 0 };
        scanRawCharText(chunksOf(make(n), 65536), security, work);
        return work.steps;
      };
      const big = steps(1024 * 1024);
      const quarter = steps(256 * 1024);
      expect(big, name).toBeLessThanOrEqual(3 * 1024 * 1024);
      expect(big, name).toBeLessThanOrEqual(4.5 * Math.max(quarter, 1));
    }
  }, 60_000); // T3: 4.7 s in a quiet whole suite × 12 = 56.5 s, rounded up to 60 s
});

describe("L24: the decision per position and the key of a finding (I9; R2-003)", () => {
  it("L24: a family (2 ZWJ) and a ZWJ between letters on one line: 2 left out, 1 finding; in either order; two outside ZWJ: 0 and 1; two families: 4 and 0", () => {
    const outside = `a${ch(ZWJ)}b`;
    expect(scanChunks(`${FAMILY} ${outside}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 2 });
    expect(scanChunks(`${outside} ${FAMILY}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 2 });
    expect(scanChunks(`${outside} ${outside}\n`)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 0 });
    expect(scanChunks(`${FAMILY} ${FAMILY}\n`)).toEqual({ findings: [], exempted: 4 });
  });

  it("L24: the same mixture in a path name: 2 left out, 1 finding (path, U+200D)", () => {
    const r = repo();
    const name = `n${FAMILY}a${ch(ZWJ)}b.txt`;
    r.write(name, "plain\n");
    r.add(name);
    const res = scanRepository(r.dir);
    expect(res.rawCharsExempted).toBe(2);
    expect(where(rawOf(res))).toEqual([[name, null, "U+200D", "zero-width"]]);
  });

  it("L24: small windows: a family in the overlap (seen by two windows) and a ZWJ outside elsewhere on the line: 2 left out (not 4), 1 finding", () => {
    const chunk1 = `${"-".repeat(900)}a${FAMILY}b${"-".repeat(190)}`;
    expect(chunk1.length).toBe(1100);
    expect(scanChunks([chunk1, `c${ch(ZWJ)}d\n`], SMALL)).toEqual({ findings: [[1, "U+200D", "zero-width"]], exempted: 2 });
  });

  it("L24: a zero-width rule suppresses the finding; the number left out stays 2", async () => {
    const r = repo();
    r.write("m.txt", `${FAMILY} a${ch(ZWJ)}b\n`);
    r.add("m.txt");
    const j = await scanJson(r, [{ path: "m.txt", category: "zero-width", reason: "intended" }]);
    expect(j.code).toBe(0);
    expect(where(j.json.suppressed)).toEqual([["m.txt", 1, "U+200D", "zero-width"]]);
    expect(j.json.rawCharsExempted).toBe(2);
  });
});

describe("decideRawChars: the branches of I5 on one window (offset, final, guaranteed tail)", () => {
  const win = (w: Partial<RawCharWindow>): RawCharWindow => ({ offset: 0, final: true, tailStart: 0, firstLine: false, ...w });
  const decide = (text: string, w: Partial<RawCharWindow>, decided?: (p: number) => boolean): Array<[number, number, boolean]> =>
    decideRawChars(text, win(w), decided).map((d) => [d.position, d.codePoint, d.exempt]);
  const t = `a${TECH}b`; // the ZWJ is at 3

  it("(a) both ends seen: by I4, inside the sequence left out, outside a finding", () => {
    expect(decide(t, { final: false, tailStart: 0 })).toEqual([[3, ZWJ, true]]);
    expect(decide(`a1${ch(ZWJ)}2b`, { offset: 7 })).toEqual([[9, ZWJ, false]]);
  });

  it("(b) the last delivery of the line, a run at the start of a window that is not the start of the line, a left neighbour before the guaranteed tail: a finding", () => {
    expect(decide(`${TECH}b`, { offset: 10 })).toEqual([[12, ZWJ, false]]);
    expect(decide(`${TECH}b`, { offset: 0 })).toEqual([[2, ZWJ, true]]);
    expect(decide(`a${TECH}`, { final: false, tailStart: 1 })).toEqual([[3, ZWJ, false]]);
    expect(decide(`a${TECH}`, { final: true, tailStart: 6, offset: 40 })).toEqual([[43, ZWJ, true]]);
  });

  it("(c) left end seen, right end at the end of a window that does not reach the end of the line, all in the guaranteed tail: not decided in this window", () => {
    expect(decide(`a${TECH}`, { final: false, tailStart: 0 })).toEqual([]);
    expect(decide(`xy${"1".repeat(3)}${ch(ZWJ)}`, { final: false, tailStart: 1 })).toEqual([]);
  });

  it("a window that starts with the second half of a pair: an unknown character, so a run next to it touches the start of the window (a finding)", () => {
    const half = String.fromCharCode(0xdc67);
    expect(decide(`${half}${TECH}b`, { offset: 100 })).toEqual([[103, ZWJ, false]]);
  });

  it("a position decided in an earlier window is not decided again (I6)", () => {
    expect(decide(t, {}, (p) => p === 3)).toEqual([]);
    expect(decide(`${ch(0x200b)}x`, {}, (p) => p === 0)).toEqual([]);
  });
});
