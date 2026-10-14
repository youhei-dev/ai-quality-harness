/**
 * What every output parser reads, and the limits on it (ADR-0028, P3): only the end of each stream (PARSE_INPUT_MAX code units, without
 * the partial line the cut leaves), lines of at most PARSE_LINE_MAX code units (a longer line is not read at all: no summary or name is
 * that long), control sequences removed. Every step is a single pass, and a parser looks at each line a bounded number of times, so the
 * time is linear in the input; the clock is still checked while lines are read (PARSE_TIME_LIMIT_MS). Names are masked as the whole line
 * before they are cut, so a cut never leaves a part of a secret that the masker would have recognised in the whole line.
 */
import { maskSecrets } from "../security/mask.ts";
import type { ParsedItem } from "../types.ts";

/** UTF-16 code units read from the end of each stream (stdout, stderr). The runner keeps up to 10 MiB of a stream. */
export const PARSE_INPUT_MAX = 1024 * 1024;
/** A line longer than this is not read (code units). */
export const PARSE_LINE_MAX = 4096;
/** Reading the output of one check takes at most this long, or it is "time-limit". */
export const PARSE_TIME_LIMIT_MS = 1000;
/** Names kept per check; the rest are counted in itemsOmitted. */
export const PARSED_ITEMS_MAX = 50;
/** A name is cut to this many code units (the last one is "…"). */
export const PARSED_NAME_MAX = 300;
/** Lines read between two looks at the clock. */
const CLOCK_EVERY = 1024;
/** The largest number a summary may hold: 15 digits (a safe integer); anything longer is not a count of a run. */
const MAX_DIGITS = 15;

/** The lines of one stream; `null` for a line longer than PARSE_LINE_MAX. */
export type Lines = ReadonlyArray<string | null>;

/** The end of a stream as lines. `truncated` when the stream was longer than `limit`. */
export function prepareStream(text: string, limit: number = PARSE_INPUT_MAX): { lines: Lines; truncated: boolean } {
  let s = text;
  let truncated = false;
  if (s.length > limit) {
    s = s.slice(s.length - limit);
    const nl = s.indexOf("\n");
    // The first line of the kept part is the end of a line whose start was cut: it is not read.
    s = nl === -1 ? "" : s.slice(nl + 1);
    truncated = true;
  }
  const lines: Array<string | null> = [];
  let start = 0;
  while (start <= s.length) {
    const nl = s.indexOf("\n", start);
    const end = nl === -1 ? s.length : nl;
    const cut = end > start && s.charCodeAt(end - 1) === 13 ? end - 1 : end;
    lines.push(cut - start > PARSE_LINE_MAX ? null : stripControlSequences(s.slice(start, cut)));
    if (nl === -1) break;
    start = nl + 1;
  }
  return { lines, truncated };
}

/** ESC [ parameters intermediates final (CSI, the color sequences) removed; a lone ESC is dropped too. One pass. */
export function stripControlSequences(line: string): string {
  if (!line.includes("\u001b")) return line;
  let out = "";
  let i = 0;
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if (c !== 27) {
      out += line[i];
      i += 1;
      continue;
    }
    i += 1;
    if (line.charCodeAt(i) !== 0x5b) continue;
    i += 1;
    while (i < line.length && line.charCodeAt(i) >= 0x30 && line.charCodeAt(i) <= 0x3f) i += 1;
    while (i < line.length && line.charCodeAt(i) >= 0x20 && line.charCodeAt(i) <= 0x2f) i += 1;
    if (i < line.length && line.charCodeAt(i) >= 0x40 && line.charCodeAt(i) <= 0x7e) i += 1;
  }
  return out;
}

/** Thrown by Budget when the time is up; read.ts turns it into "time-limit". */
export class TimeLimitReached extends Error {
  override readonly name = "TimeLimitReached";
}

/** The clock of one parse: `tick()` per line, a look at the clock every CLOCK_EVERY lines. */
export class Budget {
  private readonly now: () => number;
  private readonly start: number;
  private lines = 0;

  constructor(now: () => number) {
    this.now = now;
    this.start = now();
  }

  tick(): void {
    this.lines += 1;
    if (this.lines % CLOCK_EVERY === 0) this.check();
  }

  check(): void {
    if (this.now() - this.start > PARSE_TIME_LIMIT_MS) throw new TimeLimitReached("time limit");
  }
}

/** Names in the order found: the first PARSED_ITEMS_MAX kept (masked, then cut), the rest counted. */
export class ItemList {
  readonly items: ParsedItem[] = [];
  omitted = 0;

  add(kind: string, line: string): void {
    if (this.items.length >= PARSED_ITEMS_MAX) {
      this.omitted += 1;
      return;
    }
    this.items.push({ kind, name: nameOf(line) });
  }
}

/** A whole line (at most PARSE_LINE_MAX) masked, then cut to PARSED_NAME_MAX. */
export function nameOf(line: string): string {
  const masked = maskSecrets(line.trim());
  return masked.length <= PARSED_NAME_MAX ? masked : `${masked.slice(0, PARSED_NAME_MAX - 1)}…`;
}

/** A count of a summary: 1 to MAX_DIGITS decimal digits, nothing else; null otherwise. */
export function countOf(text: string): number | null {
  if (text.length === 0 || text.length > MAX_DIGITS) return null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return null;
  }
  return Number(text);
}

/** `<count> <word>` (one space) as [count, word], or null. */
export function countAndWord(text: string): [number, string] | null {
  const sp = text.indexOf(" ");
  if (sp === -1) return null;
  const n = countOf(text.slice(0, sp));
  return n === null ? null : [n, text.slice(sp + 1)];
}

/** The index of the last line that `test` accepts, or -1 (lines too long to read never match). */
export function lastIndex(lines: Lines, budget: Budget, test: (line: string) => boolean): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    budget.tick();
    const line = lines[i];
    if (line !== null && line !== undefined && test(line)) return i;
  }
  return -1;
}

/** Lines that are only npm's header of a script (`> name@version script`, `> command`) or blank. */
export function isNpmHeaderOrBlank(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith("> ");
}
