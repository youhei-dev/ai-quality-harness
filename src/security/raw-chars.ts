/**
 * Raw-character check (M2-1, ADR-0014). Text that goes into a review packet — and the tracked
 * Markdown documents — must not contain characters that are invisible or that change how a line is
 * displayed or split: C0 controls other than TAB and LF (CR included), DEL, C1 controls, U+2028 /
 * U+2029, the bidirectional controls U+202A–U+202E and U+2066–U+2069, and U+FEFF (a BOM, also at the
 * start of a file). Bytes that are not valid UTF-8 are rejected before decoding. Results carry
 * positions and code points only, never the surrounding text.
 */

/** A forbidden character: 1-based line (split on LF) and 1-based column in code points. */
export interface RawCharHit {
  line: number;
  column: number;
  codePoint: number;
}

/** The forbidden set, as inclusive code point ranges (shared by the packet check and the docs test). */
export const FORBIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

export function isForbiddenCodePoint(cp: number): boolean {
  return FORBIDDEN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Every forbidden character in `text`, in order. */
export function findRawChars(text: string): RawCharHit[] {
  const hits: RawCharHit[] = [];
  let line = 1;
  let column = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x0a) {
      line += 1;
      column = 0;
      continue;
    }
    column += 1;
    if (isForbiddenCodePoint(cp)) hits.push({ line, column, codePoint: cp });
  }
  return hits;
}

/**
 * Safe display of a user-derived string on a terminal or in JSON (M2-1-R1-002): every forbidden
 * character and LF / TAB become the ASCII notation `\u{HEX}`; everything else is unchanged. Apply the
 * masker after this. The single place that turns user strings into printable text for review-packet.
 */
export function escapeRawChars(s: string): string {
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    out += cp === 0x0a || cp === 0x09 || isForbiddenCodePoint(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : c;
  }
  return out;
}

/**
 * Forbidden characters as JSON escapes `\uXXXX`, for text that is JSON (a report, a config): the characters can only be inside a string
 * (JSON.stringify already escapes the C0 controls, but not DEL, C1, U+2028 / U+2029, the bidi controls and U+FEFF), and
 * the parsed data stays exactly the same. TAB and LF are not in the set.
 */
export function escapeRawCharsAsJson(text: string): string {
  let out = "";
  for (const c of text) {
    const cp = c.codePointAt(0) ?? 0;
    out += isForbiddenCodePoint(cp) ? `\\u${cp.toString(16).padStart(4, "0")}` : c;
  }
  return out;
}

/** "U+2028" style label. */
export function formatCodePoint(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Byte offset of the first byte that does not start or continue a valid UTF-8 sequence, or -1 when
 * `buf` is valid UTF-8. Overlong encodings, surrogates (U+D800–U+DFFF) and code points above
 * U+10FFFF are invalid, as are truncated sequences at the end.
 */
export function firstInvalidUtf8Offset(buf: Uint8Array): number {
  let i = 0;
  while (i < buf.length) {
    const b0 = buf[i] ?? 0;
    if (b0 < 0x80) {
      i += 1;
      continue;
    }
    let need: number;
    let min: number;
    let cp: number;
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      need = 1;
      min = 0x80;
      cp = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      need = 2;
      min = 0x800;
      cp = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      need = 3;
      min = 0x10000;
      cp = b0 & 0x07;
    } else {
      return i;
    }
    for (let k = 1; k <= need; k++) {
      const b = buf[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return i;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return i;
    i += need + 1;
  }
  return -1;
}

/** 1-based line (counting LF bytes before `offset`) of a byte offset. */
export function lineOfOffset(buf: Uint8Array, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < buf.length; i++) if (buf[i] === 0x0a) line += 1;
  return line;
}

export type DecodeResult = { ok: true; text: string } | { ok: false; line: number };

/** Decode strict UTF-8 without dropping a BOM (a BOM is then reported as a forbidden character). */
export function decodeUtf8Strict(buf: Uint8Array): DecodeResult {
  const bad = firstInvalidUtf8Offset(buf);
  if (bad !== -1) return { ok: false, line: lineOfOffset(buf, bad) };
  return { ok: true, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf) };
}
