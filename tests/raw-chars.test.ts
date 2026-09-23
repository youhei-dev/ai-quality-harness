/**
 * M2-1 (v0.4.0): the raw-character module used by `aiqh review-packet` and the tracked-docs test.
 * Every forbidden character is built from its code point, so this file contains none of them.
 */
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_RANGES,
  decodeUtf8Strict,
  findRawChars,
  firstInvalidUtf8Offset,
  formatCodePoint,
  isForbiddenCodePoint,
} from "../src/security/raw-chars.ts";

const ch = (cp: number): string => String.fromCodePoint(cp);

/** Small deterministic PRNG (mulberry32) so the property tests are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("forbidden set", () => {
  it("contains exactly the decided ranges (C0 except TAB / LF, CR, DEL, C1, U+2028 / U+2029, bidi controls, BOM)", () => {
    const forbidden = [0x00, 0x08, 0x0b, 0x0c, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x85, 0x9f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff];
    const allowed = [0x09, 0x0a, 0x20, 0x7e, 0xa0, 0x2027, 0x202f, 0x2065, 0x206a, 0xfefe, 0xff00, 0x3042, 0x1f600];
    for (const cp of forbidden) expect(isForbiddenCodePoint(cp), formatCodePoint(cp)).toBe(true);
    for (const cp of allowed) expect(isForbiddenCodePoint(cp), formatCodePoint(cp)).toBe(false);
    expect(FORBIDDEN_RANGES.length).toBe(7);
  });

  it("reports line and column (code points) of every hit, including a BOM at the start", () => {
    const text = `${ch(0xfeff)}a\tb\n${ch(0x1f600)}x${ch(0x2028)}\r\nok${ch(0x202e)}`;
    expect(findRawChars(text)).toEqual([
      { line: 1, column: 1, codePoint: 0xfeff },
      { line: 2, column: 3, codePoint: 0x2028 },
      { line: 2, column: 4, codePoint: 0x0d },
      { line: 3, column: 3, codePoint: 0x202e },
    ]);
    expect(findRawChars("plain\ttext\nあいう\n")).toEqual([]);
  });

  it("formats code points as U+XXXX", () => {
    expect(formatCodePoint(0x2028)).toBe("U+2028");
    expect(formatCodePoint(0x0d)).toBe("U+000D");
    expect(formatCodePoint(0x1f600)).toBe("U+1F600");
  });

  it("property: hits equal a per-code-point reference on random strings (fixed seed)", () => {
    const next = rng(20260923);
    const pool = [0x61, 0x20, 0x09, 0x0a, 0x0d, 0x00, 0x7f, 0x85, 0x2028, 0x2029, 0x202b, 0x2067, 0xfeff, 0x3042, 0x1f600, 0xa0, 0x2027];
    for (let n = 0; n < 500; n++) {
      const cps = Array.from({ length: Math.floor(next() * 40) }, () => pool[Math.floor(next() * pool.length)] ?? 0x61);
      const text = String.fromCodePoint(...cps);
      const expected: Array<{ line: number; column: number; codePoint: number }> = [];
      let line = 1;
      let column = 0;
      for (const cp of cps) {
        if (cp === 0x0a) {
          line += 1;
          column = 0;
          continue;
        }
        column += 1;
        if (isForbiddenCodePoint(cp)) expected.push({ line, column, codePoint: cp });
      }
      expect(findRawChars(text)).toEqual(expected);
    }
  });
});

describe("strict UTF-8", () => {
  it("accepts valid 1- to 4-byte sequences", () => {
    expect(firstInvalidUtf8Offset(Buffer.from(`a${ch(0xe9)}${ch(0x3042)}${ch(0x1f600)}`, "utf8"))).toBe(-1);
    expect(firstInvalidUtf8Offset(new Uint8Array(0))).toBe(-1);
  });

  it("rejects lone continuation, overlong, surrogate, above U+10FFFF, invalid lead and truncated sequences", () => {
    const cases: Array<[number[], number]> = [
      [[0x61, 0x80], 1],
      [[0xc0, 0x80], 0],
      [[0xc1, 0xbf], 0],
      [[0xe0, 0x80, 0x80], 0],
      [[0xed, 0xa0, 0x80], 0],
      [[0xf0, 0x80, 0x80, 0x80], 0],
      [[0xf4, 0x90, 0x80, 0x80], 0],
      [[0xf5, 0x80, 0x80, 0x80], 0],
      [[0xff], 0],
      [[0x61, 0x62, 0xe3, 0x81], 2],
      [[0xe3, 0x41, 0x81], 0],
    ];
    for (const [bytes, offset] of cases) expect(firstInvalidUtf8Offset(Uint8Array.from(bytes)), bytes.join(",")).toBe(offset);
  });

  it("decodeUtf8Strict gives the line of the first invalid byte and keeps a leading BOM", () => {
    expect(decodeUtf8Strict(Uint8Array.from([0x61, 0x0a, 0x62, 0x0a, 0xff]))).toEqual({ ok: false, line: 3 });
    const withBom = decodeUtf8Strict(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]));
    expect(withBom).toEqual({ ok: true, text: `${ch(0xfeff)}a` });
  });

  it("property: agrees with TextDecoder({ fatal: true }) on random bytes (fixed seed)", () => {
    const next = rng(4242);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let valid = 0;
    for (let n = 0; n < 3000; n++) {
      const len = Math.floor(next() * 8);
      const bytes = Uint8Array.from({ length: len }, () => {
        const r = next();
        // bias toward bytes that form real sequences so both outcomes occur often
        if (r < 0.4) return Math.floor(next() * 0x80);
        if (r < 0.7) return 0x80 + Math.floor(next() * 0x40);
        return 0xc0 + Math.floor(next() * 0x40);
      });
      let ok = true;
      try {
        decoder.decode(bytes);
      } catch {
        ok = false;
      }
      if (ok) valid += 1;
      expect(firstInvalidUtf8Offset(bytes) === -1, Array.from(bytes).join(",")).toBe(ok);
    }
    expect(valid).toBeGreaterThan(300);
  });
});
