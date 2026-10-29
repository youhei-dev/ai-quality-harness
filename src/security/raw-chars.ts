/**
 * Raw-character check (M2-1, ADR-0014). Text that goes into a review packet — and the tracked
 * Markdown documents — must not contain characters that are invisible or that change how a line is
 * displayed or split: C0 controls other than TAB and LF (CR included), DEL, C1 controls, U+2028 /
 * U+2029, the bidirectional controls U+202A–U+202E and U+2066–U+2069, and U+FEFF (a BOM, also at the
 * start of a file). Bytes that are not valid UTF-8 are rejected before decoding. Results carry
 * positions and code points only, never the surrounding text.
 * The security scan looks for its own set (SCANNED_RAW_RANGES): the bidi controls and the line separators (ADR-0036), and since
 * v0.15.0 the invisible characters of layer (c) (ADR-0037) — controls other than TAB and LF, but not the CR before LF, the last CR
 * of a file or a leading BOM, which ordinary sources have. Inside a complete RGI emoji sequence, U+200D, U+FE0F and the tag
 * characters are left out (decideRawChars, ADR-0037 decision 3).
 * Since v0.17.0 (ADR-0039, item 54) what aiqh passes to a review packet and shows at its exits is decided once: the forbidden set and
 * the characters that decision finds (findDisplayRawChars). The packet refuses them, the terminal and Markdown show them as
 * `\u{HEX}`, and a JSON file writes them as JSON escapes without changing its data (jsonForFile). FORBIDDEN_RANGES does not change.
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

/**
 * The categories of the raw characters the security scan finds; also `security.allow` categories. The first two are layers (a)/(b)
 * (ADR-0036), the other eight layer (c) (ADR-0037 decision 1).
 */
export const RAW_CHAR_CATEGORIES = ["bidi-control", "line-separator", "bidi-mark", "zero-width", "bom", "soft-hyphen", "variation-selector", "tag", "control", "invisible-other"] as const;
export type RawCharCategory = (typeof RAW_CHAR_CATEGORIES)[number];

/**
 * What the security scan finds, as inclusive ranges with their category. Layers (a)/(b) (ADR-0036, item 48): the bidi controls
 * U+202A–U+202E and U+2066–U+2069 and the line separators U+2028 and U+2029, a subset of FORBIDDEN_RANGES. Layer (c) (ADR-0037,
 * item 49): 4,247 code points in eight categories — all of Default_Ignorable_Code_Point, the controls but TAB and LF, U+FFF9–U+FFFB
 * and U+13430–U+1343F; the differences with the Unicode properties are fixed by a test. `bom` is a U+FEFF that is not at position 0
 * of line 1; `control` has U+000D, which is seen only in the middle of a line (the CR before LF and the last CR are not delivered).
 */
export const SCANNED_RAW_RANGES: ReadonlyArray<readonly [number, number, RawCharCategory]> = [
  [0x202a, 0x202e, "bidi-control"],
  [0x2066, 0x2069, "bidi-control"],
  [0x2028, 0x2029, "line-separator"],
  [0x061c, 0x061c, "bidi-mark"],
  [0x200e, 0x200f, "bidi-mark"],
  [0x200b, 0x200d, "zero-width"],
  [0x2060, 0x2060, "zero-width"],
  [0xfeff, 0xfeff, "bom"],
  [0x00ad, 0x00ad, "soft-hyphen"],
  [0x180b, 0x180d, "variation-selector"],
  [0x180f, 0x180f, "variation-selector"],
  [0xfe00, 0xfe0f, "variation-selector"],
  [0xe0100, 0xe01ef, "variation-selector"],
  [0xe0000, 0xe007f, "tag"],
  [0x0000, 0x0008, "control"],
  [0x000b, 0x001f, "control"],
  [0x007f, 0x009f, "control"],
  [0x034f, 0x034f, "invisible-other"],
  [0x115f, 0x1160, "invisible-other"],
  [0x17b4, 0x17b5, "invisible-other"],
  [0x180e, 0x180e, "invisible-other"],
  [0x2061, 0x2065, "invisible-other"],
  [0x206a, 0x206f, "invisible-other"],
  [0x3164, 0x3164, "invisible-other"],
  [0xffa0, 0xffa0, "invisible-other"],
  [0xfff0, 0xfffb, "invisible-other"],
  [0x13430, 0x1343f, "invisible-other"],
  [0x1bca0, 0x1bca3, "invisible-other"],
  [0x1d173, 0x1d17a, "invisible-other"],
  [0xe0080, 0xe00ff, "invisible-other"],
  [0xe01f0, 0xe0fff, "invisible-other"],
];

/** The category of every BMP code point (index into RAW_CHAR_CATEGORIES + 1, 0 = not scanned): one lookup per UTF-16 unit. */
const BMP_CATEGORY = new Uint8Array(0x10000);
const SUPPLEMENTARY_RANGES = SCANNED_RAW_RANGES.filter(([lo]) => lo > 0xffff);
for (const [lo, hi, category] of SCANNED_RAW_RANGES) {
  if (lo > 0xffff) continue;
  BMP_CATEGORY.fill(RAW_CHAR_CATEGORIES.indexOf(category) + 1, lo, hi + 1);
}

/** The category of a code point the security scan finds, or null. */
export function scannedRawCategory(cp: number): RawCharCategory | null {
  if (cp <= 0xffff) return RAW_CHAR_CATEGORIES[(BMP_CATEGORY[cp] ?? 0) - 1] ?? null;
  for (const [lo, hi, category] of SUPPLEMENTARY_RANGES) if (cp >= lo && cp <= hi) return category;
  return null;
}

/** I1: the only code points that may be left out inside an RGI emoji sequence — U+200D, U+FE0F and the tags U+E0020–U+E007F. */
export function isExemptionCandidate(cp: number): boolean {
  return cp === 0x200d || cp === 0xfe0f || (cp >= 0xe0020 && cp <= 0xe007f);
}

/**
 * I2: E = Emoji ∪ Emoji_Component, from this Node's Unicode data (I8). The BMP is a table built on first use; above it, a cache.
 * The `v` flag (Node 20 and later) is given to the constructor: the TypeScript target is older than ES2024.
 */
const EMOJI_CHAR = new RegExp(String.raw`^[\p{Emoji}\p{Emoji_Component}]$`, "v");
let emojiBmp: Uint8Array | null = null;
const emojiAbove = new Map<number, boolean>();
function inEmojiSet(cp: number): boolean {
  if (cp <= 0xffff) {
    if (emojiBmp === null) {
      emojiBmp = new Uint8Array(0x10000);
      for (let c = 0; c <= 0xffff; c += 1) if ((c < 0xd800 || c > 0xdfff) && EMOJI_CHAR.test(String.fromCharCode(c))) emojiBmp[c] = 1;
    }
    return emojiBmp[cp] === 1;
  }
  let known = emojiAbove.get(cp);
  if (known === undefined) {
    known = EMOJI_CHAR.test(String.fromCodePoint(cp));
    emojiAbove.set(cp, known);
  }
  return known;
}
/**
 * I3: the longest RGI emoji sequence that starts at lastIndex (in the v mode a class of strings tries the longest strings first).
 * Compiled on first use (about 10 ms): most scans never meet a run whose ends are both seen.
 */
let rgiEmojiAt: RegExp | null = null;

/** Where a text handed to decideRawChars lies (ADR-0037 decision 3, I5). */
export interface RawCharWindow {
  /** Position of the text's first UTF-16 unit in its line (0 for a whole line or a path name). */
  offset: number;
  /** The text reaches the end of its line (a newline, the end of the file); a path name always does. */
  final: boolean;
  /** A window that does not reach the end of its line: where its guaranteed tail starts (the last lineOverlapBytes, which the next window always repeats). */
  tailStart: number;
  /** Line 1 of a file: a U+FEFF at position 0 of the line is the BOM, not scanned. */
  firstLine: boolean;
}
/** The decision for one occurrence (I9): left out (inside a complete RGI sequence) or a finding. */
export interface RawCharDecision {
  /** Position in the line (offset + index in the text), in UTF-16 units. */
  position: number;
  codePoint: number;
  category: RawCharCategory;
  exempt: boolean;
}

/** The first unit that is a scanned BMP code point or a half of a surrogate pair, or -1: most lines have none (a small loop V8 optimizes on its own). */
function firstRawUnit(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (BMP_CATEGORY[c] !== 0 || (c & 0xf800) === 0xd800) return i;
  }
  return -1;
}

/** Nothing decided yet; and the result of a text without raw characters (most lines), shared and never written to. */
const NOTHING_DECIDED = (): boolean => false;
const NO_DECISIONS: RawCharDecision[] = [];

/** A code point, or -1 for a half of a surrogate pair whose other half is not in the text (an unknown character). */
function codePointAt(text: string, i: number): number {
  const c = text.charCodeAt(i);
  if (c < 0xd800 || c > 0xdfff) return c;
  if (c <= 0xdbff) {
    const d = text.charCodeAt(i + 1);
    return d >= 0xdc00 && d <= 0xdfff ? 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00) : -1;
  }
  return -1;
}

/** Start of the character that ends at `end` (a pair takes two units). */
function charStartBefore(text: string, end: number): number {
  const c = text.charCodeAt(end - 1);
  if (end >= 2 && c >= 0xdc00 && c <= 0xdfff) {
    const h = text.charCodeAt(end - 2);
    if (h >= 0xd800 && h <= 0xdbff) return end - 2;
  }
  return end - 1;
}

/** An unknown character (a lone half of a pair) counts as E: its run is not taken as having a seen end there (I5 (b)). */
function runChar(cp: number, work?: { steps: number }): boolean {
  if (work !== undefined) work.steps += 1;
  return cp === -1 || inEmojiSet(cp);
}

/** I3, I4: which units of text[start, end) lie inside an RGI sequence, matching from the start of the run, longest first, left to right. */
function insideSequences(text: string, start: number, end: number, work?: { steps: number }): Uint8Array {
  const inside = new Uint8Array(end - start);
  rgiEmojiAt ??= new RegExp(String.raw`\p{RGI_Emoji}`, "vy");
  for (let p = start; p < end; ) {
    if (work !== undefined) work.steps += 1;
    rgiEmojiAt.lastIndex = p;
    const m = rgiEmojiAt.exec(text);
    const length = m === null ? 0 : m[0].length;
    if (length > 0 && p + length <= end) {
      inside.fill(1, p - start, p - start + length);
      p += length;
    } else {
      p += codePointAt(text, p) > 0xffff ? 2 : 1;
    }
  }
  return inside;
}

/**
 * The raw characters of one text — a whole line, a window of a long line, or a path name — decided once per position (ADR-0037
 * decision 3, I1–I9). A candidate (I1) is left out only when it lies inside a complete RGI emoji sequence of its run (I2–I4) and both
 * ends of the run are seen (I5 (a)). If not, it is a finding in the last delivery of the line, when its run touches the start of a
 * window that is not the start of the line (also when the window starts with a lone half of a pair), or when the run's left neighbour
 * starts before the guaranteed tail (I5 (b)); otherwise it is left to the next window, which always repeats it (I5 (c)). Positions
 * `decided` already are skipped (I6). A CR at the end of a window that does not reach the end of the line is left to the next window
 * too (the CR of a CR LF split by a window), and the BOM at position 0 of line 1 is not scanned. `work` counts the membership tests
 * and the RGI matches (the work is linear in the text).
 */
export function decideRawChars(text: string, window: RawCharWindow, decided: (position: number) => boolean = NOTHING_DECIDED, work?: { steps: number }): RawCharDecision[] {
  let out: RawCharDecision[] = NO_DECISIONS;
  const first = firstRawUnit(text);
  if (first === -1) return out;
  let runStart = 0;
  let runEnd = -1;
  let outcome: "decide" | "finding" | "defer" = "finding";
  let inside: Uint8Array | null = null;
  for (let i = first; i < text.length; ) {
    const c = text.charCodeAt(i);
    let cp = c;
    let category: RawCharCategory | null;
    if (c < 0xd800 || c > 0xdfff) {
      const k = BMP_CATEGORY[c] ?? 0;
      if (k === 0) {
        i += 1;
        continue;
      }
      category = RAW_CHAR_CATEGORIES[k - 1] ?? null;
    } else {
      cp = codePointAt(text, i);
      if (cp === -1) {
        i += 1; // a lone half (the window starts inside a pair): not a character of this text
        continue;
      }
      category = scannedRawCategory(cp);
    }
    const length = cp > 0xffff ? 2 : 1;
    const position = window.offset + i;
    if (category === null || decided(position) || (cp === 0xfeff && window.firstLine && position === 0) || (cp === 0x0d && !window.final && i + length === text.length)) {
      i += length;
      continue;
    }
    if (out === NO_DECISIONS) out = [];
    if (!isExemptionCandidate(cp)) {
      out.push({ position, codePoint: cp, category, exempt: false });
      i += length;
      continue;
    }
    if (i >= runEnd) {
      runStart = i;
      while (runStart > 0) {
        const before = charStartBefore(text, runStart);
        if (!runChar(codePointAt(text, before), work)) break;
        runStart = before;
      }
      runEnd = i + length;
      while (runEnd < text.length) {
        const next = codePointAt(text, runEnd);
        if (!runChar(next, work)) break;
        runEnd += next > 0xffff ? 2 : 1;
      }
      const lineStart = runStart === 0 && window.offset === 0;
      const leftSeen = runStart > 0 || lineStart;
      const rightSeen = runEnd < text.length || window.final;
      inside = null;
      if (leftSeen && rightSeen) {
        outcome = "decide";
        inside = insideSequences(text, runStart, runEnd, work);
      } else if (!leftSeen) {
        // the last delivery of the line always sees the right end, so here the run touches the start of a window that is not the
        // start of the line: its left part is gone (I5 (b))
        outcome = "finding";
      } else {
        const leftEdge = lineStart ? 0 : charStartBefore(text, runStart);
        outcome = leftEdge < window.tailStart ? "finding" : "defer";
      }
    }
    if (outcome !== "defer") out.push({ position, codePoint: cp, category, exempt: outcome === "decide" && inside?.[i - runStart] === 1 });
    i += length;
  }
  return out;
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
 * A character that aiqh does not pass to a review packet or show raw (ADR-0039 decision 1): one of the forbidden set, or one the
 * security scan's decision finds (a character of SCANNED_RAW_RANGES outside a complete RGI emoji sequence).
 */
export interface DisplayRawHit extends RawCharHit {
  /** Index of its first UTF-16 unit in the text. */
  index: number;
  /** Its category of the security scan (every forbidden code point has one). */
  category: RawCharCategory;
  /** In FORBIDDEN_RANGES. */
  forbidden: boolean;
  /** The security scan's decision finds it on its line (never the CR before LF, the CR at the end of the text or the BOM that starts the text). */
  scanned: boolean;
}

/**
 * The characters of `text` that aiqh does not pass or show raw (ADR-0039 decision 1, item 54), in order: the forbidden set, and what
 * the security scan's decision finds, decided on the original text — each line (split on LF) given to decideRawChars as one whole
 * window that reaches the end of its line. A run never crosses an LF (LF is not in E), so the lines decide what the whole text would.
 * The CR before an LF and a CR at the end of the text are not given to that decision, as LineAssembler does not deliver them, and the
 * BOM at the start of line 1 is not scanned, as for a file (B2-D-R2-001); the three are still forbidden. `work` counts the steps of
 * the decision and the units of every line that has a candidate.
 */
export function findDisplayRawChars(text: string, work?: { steps: number }): DisplayRawHit[] {
  const hits: DisplayRawHit[] = [];
  // FORBIDDEN_RANGES lies inside the scanned BMP code points: a text without any (most texts) has nothing to find
  if (firstRawUnit(text) === -1) return hits;
  for (let start = 0, line = 1; ; line += 1) {
    const nl = text.indexOf("\n", start);
    const end = nl === -1 ? text.length : nl;
    const content = text.slice(start, end);
    if (firstRawUnit(content) !== -1) lineHits(content, start, line, hits, work);
    if (nl === -1) return hits;
    start = nl + 1;
  }
}

/** The hits of one line (without its LF) that starts at `start` of the text. */
function lineHits(content: string, start: number, line: number, hits: DisplayRawHit[], work: { steps: number } | undefined): void {
  // The CR before the LF, or at the end of the text, is the last unit of its line: left out of the decision (B2-D-R2-001)
  const decided = content.endsWith("\r") ? content.slice(0, -1) : content;
  const found = decideRawChars(decided, { offset: 0, final: true, tailStart: decided.length, firstLine: line === 1 }, NOTHING_DECIDED, work);
  let next = 0;
  let column = 0;
  for (let i = 0; i < content.length; ) {
    if (work !== undefined) work.steps += 1;
    const c = content.charCodeAt(i);
    const cp = c < 0xd800 || c > 0xdfff ? c : codePointAt(content, i);
    column += 1;
    let d = found[next];
    while (d !== undefined && d.position < i) {
      next += 1;
      d = found[next];
    }
    const finding = d !== undefined && d.position === i && !d.exempt ? d : null;
    const forbidden = cp === c && BMP_CATEGORY[c] !== 0 && isForbiddenCodePoint(c);
    const category = finding !== null ? finding.category : scannedRawCategory(cp);
    if ((forbidden || finding !== null) && category !== null) hits.push({ line, column, codePoint: cp, index: start + i, category, forbidden, scanned: finding !== null });
    i += cp > 0xffff ? 2 : 1;
  }
}

/** How a packet finding names a hit (ADR-0039 decision 2): a forbidden character by its code point, as before ("U+2028"); an added one with its category ("U+200B zero-width"). */
export function rawCharDetail(hit: DisplayRawHit): string {
  return hit.forbidden ? formatCodePoint(hit.codePoint) : `${formatCodePoint(hit.codePoint)} ${hit.category}`;
}

/** `s` with every hit — and LF and TAB when `lineBreaks` — as `\u{HEX}`: the positions decided on `s` first, then one pass (ADR-0039 decision 1). */
function withNotation(s: string, lineBreaks: boolean): string {
  const hits = findDisplayRawChars(s);
  if (hits.length === 0 && !lineBreaks) return s;
  let out = "";
  let from = 0;
  let next = 0;
  for (let i = 0; i < s.length; i += 1) {
    const hit = hits[next];
    let cp = -1;
    if (hit !== undefined && hit.index === i) {
      cp = hit.codePoint;
      next += 1;
    } else if (lineBreaks) {
      const c = s.charCodeAt(i);
      if (c === 0x0a || c === 0x09) cp = c;
    }
    if (cp === -1) continue;
    out += `${s.slice(from, i)}\\u{${cp.toString(16).toUpperCase()}}`;
    if (cp > 0xffff) i += 1;
    from = i + 1;
  }
  return from === 0 ? s : out + s.slice(from);
}

/**
 * Safe display of a user-derived string on a terminal or in a Markdown file (M2-1-R1-002): every character findDisplayRawChars finds
 * — the forbidden set and, since v0.17.0, the invisible characters the security scan finds (ADR-0039 decision 4) — and LF / TAB become
 * the ASCII notation `\u{HEX}`; everything else, an RGI emoji sequence too, is unchanged. Apply the masker after this. The single place
 * that turns user strings into printable text for review-packet.
 */
export function escapeRawChars(s: string): string {
  return withNotation(s, true);
}

/** The same, with LF and TAB left as they are (the lines of a block, a whole Markdown file). */
export function escapeRawCharsKeepingLineBreaks(s: string): string {
  return withNotation(s, false);
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

/**
 * A JSON text for a file (ADR-0039 decision 3, item 54; B2-D-R1-002): the text of JSON.stringify(value, null, 2), except that in every
 * string — keys too — the characters findDisplayRawChars finds in that string are written as JSON escapes: `\uXXXX`, a code point above
 * U+FFFF as the two of its surrogate pair (four digits never hold more), a C0 control as JSON.stringify writes it. The data does not
 * change (JSON.parse gives what JSON.stringify writes), and a value with nothing to write so is the same text as JSON.stringify. The
 * decision is on each string's value, never on the JSON text, where the escape of a control (the `7` of U+0007 written out) could join
 * a sequence (U+FE0F U+20E3, a keycap) that the value does not have. `work` counts the steps of the decisions.
 */
export function jsonForFile(value: unknown, work?: { steps: number }): string {
  const text = JSON.stringify(value, null, 2) as string | undefined;
  if (text === undefined) throw new TypeError("jsonForFile: the value has no JSON text");
  // No scanned unit and no surrogate in the text: its strings have nothing to write as an escape but C0 controls, written as escapes already
  if (firstRawUnit(text) === -1) return text;
  // The data JSON.stringify writes (its strings are the value's strings, unit for unit), written again with the escapes
  return jsonValueForFile(JSON.parse(text) as unknown, "", work);
}

function jsonValueForFile(value: unknown, indent: string, work: { steps: number } | undefined): string {
  if (typeof value === "string") return jsonStringForFile(value, work);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = (value as unknown[]).map((v) => `${inner}${jsonValueForFile(v, inner, work)}`);
    return items.length === 0 ? "[]" : `[\n${items.join(",\n")}\n${indent}]`;
  }
  const members = Object.entries(value).map(([k, v]) => `${inner}${jsonStringForFile(k, work)}: ${jsonValueForFile(v, inner, work)}`);
  return members.length === 0 ? "{}" : `{\n${members.join(",\n")}\n${indent}}`;
}

/** One string as a JSON string token: the hits as escapes, everything between them as JSON.stringify writes it. */
function jsonStringForFile(s: string, work: { steps: number } | undefined): string {
  const hits = findDisplayRawChars(s, work);
  if (hits.length === 0) return JSON.stringify(s);
  const between = (from: number, to: number): string => JSON.stringify(s.slice(from, to)).slice(1, -1);
  let out = "";
  let from = 0;
  for (const hit of hits) {
    const end = hit.index + (hit.codePoint > 0xffff ? 2 : 1);
    out += between(from, hit.index);
    if (hit.codePoint < 0x20) out += between(hit.index, end);
    else for (let i = hit.index; i < end; i += 1) out += `\\u${s.charCodeAt(i).toString(16).padStart(4, "0")}`;
    from = end;
  }
  return `"${out}${between(from, s.length)}"`;
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
