/**
 * Pattern-based masking of secret-looking strings.
 *
 * Every string that ends up in a report or on the console passes through `maskSecrets`.
 * The original value is never stored; matches are replaced by `[REDACTED:<category>]`.
 * The function is pure and idempotent. False positives are accepted (see ADR-0006).
 * The pattern definitions live in ./patterns.ts and are shared with the security scanner (R-012).
 */
import { SECRET_CATEGORIES, SECRET_PATTERNS } from "./patterns.ts";

/** Categories known to the masker (for documentation and tests). */
export const MASK_CATEGORIES: readonly string[] = SECRET_CATEGORIES;

export function maskSecrets(text: string): string {
  let out = text;
  for (const rule of SECRET_PATTERNS) {
    if (rule.category === "url-credential") {
      out = maskUrlCredentials(out);
      continue;
    }
    out =
      typeof rule.replacement === "string"
        ? out.replace(rule.pattern, rule.replacement)
        : out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

/** The user ":" password "@" part of a credential URL, tried at one position only (the classes of the url-credential pattern). */
const URL_USER_PASSWORD = /([^\s/:@]+):([^\s/@]+)@/iy;
const URL_CREDENTIAL_REDACTED = "[REDACTED:url-credential]@";

const isLetter = (c: number): boolean => (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);
const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
/** `[a-z0-9+.-]` with the i flag (without the u flag, only ASCII letters match). */
const isSchemeChar = (c: number): boolean => isLetter(c) || isDigit(c) || c === 0x2b || c === 0x2e || c === 0x2d;
/** `\w` without the u flag: `[A-Za-z0-9_]`, the characters `\b` looks at. */
const isWordChar = (c: number): boolean => isLetter(c) || isDigit(c) || c === 0x5f;

/**
 * The url-credential pattern of ./patterns.ts, `(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@` (flags gi), replaced by
 * `$1[REDACTED:url-credential]@` — the same matches and the same output, found in linear time (backlog 35). The regex tried the scheme
 * at every word boundary and read the run of scheme characters to its end each time, so a long run with many boundaries ("a.a.a.…")
 * took quadratic time. Here each "://" fixes where a scheme must end (":" is not a scheme character): the scheme is the run of scheme
 * characters before it, and the match starts at the leftmost letter of that run that follows a word boundary. A run is read once,
 * because it cannot reach back over the ":" of an earlier "://". The scheme stays unbounded (ADR-0013, M2-0-R3-002: the masker is not
 * narrowed). A test keeps the regex as the oracle and compares the outputs.
 */
function maskUrlCredentials(text: string): string {
  let out = "";
  let done = 0; // the text before this index is in `out` (a match does not start before it: matches do not overlap)
  let from = 0;
  for (;;) {
    const sep = text.indexOf("://", from);
    if (sep < 0) break;
    from = sep + 1;
    let start = sep;
    while (start > done && isSchemeChar(text.charCodeAt(start - 1))) start--;
    while (start < sep && !(isLetter(text.charCodeAt(start)) && (start === 0 || !isWordChar(text.charCodeAt(start - 1))))) start++;
    if (start === sep) continue;
    URL_USER_PASSWORD.lastIndex = sep + 3;
    if (!URL_USER_PASSWORD.test(text)) continue;
    out += text.slice(done, sep + 3) + URL_CREDENTIAL_REDACTED;
    done = URL_USER_PASSWORD.lastIndex;
    from = done;
  }
  return out + text.slice(done);
}

/** Recursively mask every string value inside an arbitrary JSON-like value. */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") {
    return maskSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => maskDeep(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = maskDeep(item);
    }
    return out as T;
  }
  return value;
}
