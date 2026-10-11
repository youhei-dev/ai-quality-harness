/**
 * Single source of secret-detection patterns, shared by the report masker (src/security/mask.ts)
 * and the built-in security scanner (src/security/scan.ts) — R-012.
 *
 * Every entry carries the masking replacement and a `scan` flag. Categories with `scan: false`
 * are mask-only: they are still redacted from reports, but the scanner does not search tracked
 * source files for them because the shapes (`password=`, `Bearer …`, `Basic …`) match ordinary
 * code and prose far too often; the scanner lists them as "not scanned" with `scanNote`.
 * Order matters for masking: broad multi-line blocks first, generic key/value last.
 */

export type Replacer = (match: string, ...groups: Array<string | undefined>) => string;

export interface SecretPattern {
  category: string;
  /** Global regex (with the flags the masker needs). The scanner recompiles from source/flags. For url-credential the masker reproduces it in linear time instead of running it (src/security/mask.ts, backlog 35). */
  pattern: RegExp;
  /**
   * Scanner-only regex, for the rare case where the window anchor needs a bound the masker must not
   * inherit (M2-0-R3-002, ADR-0013). The shared `pattern` is never narrowed for the scanner; a test
   * fixes which categories are split (url-credential only). Default: `pattern`.
   */
  scanPattern?: RegExp;
  /** Replacement template (`$1` …) or replacer function for the masker. */
  replacement: string | Replacer;
  /** Whether the security scanner searches tracked files for this category. */
  scan: boolean;
  /** Why the scanner skips this category (required when scan is false). */
  scanNote?: string;
  /**
   * How the scanner searches for this category (M1-R1-002). "line" (default): `pattern` is tested
   * against each line. "block": the scanner reads line by line and runs a state machine from a line
   * matching `block.begin` to a line matching `block.end` (or the end of the file, fail closed); the
   * finding carries the begin and end lines. The masker always uses `pattern` on whole text.
   */
  scanMode?: "line" | "block";
  block?: { begin: RegExp; end: RegExp };
  /**
   * Candidate anchor for the sliding window (M2-0 / M1-R3-001, revised by M2-0-R2-001; ADR-0013).
   * `start` is a bounded prefix of every match of `pattern` (no unbounded quantifier; longest match
   * `anchorMaxBytes`, which never exceeds MIN_LINE_OVERLAP_BYTES, so an anchor touching a window end
   * is kept whole for the next window). `partial` is anchored ^…$ and accepts every prefix, from the
   * anchor start, of every string `pattern` matches — the shape of a match cut off by the window end.
   * At the end of a window the scanner carries the text from the earliest anchor that is not covered
   * by a complete match and whose remainder still matches `partial`; anchors whose remainder cannot
   * be a match are resolved and dropped.
   */
  anchor?: { start: RegExp; partial: RegExp; anchorMaxBytes: number };
  /**
   * For scanned categories whose regex matches ordinary code too (key-value): a match is a finding
   * only when its value passes the filter. `valueGroups` lists the capture groups that carry the
   * value (quoted first, bare last); `quotedGroups` names the ones that are string literals.
   */
  valueFilter?: (value: string, quoted: boolean) => boolean;
  valueGroups?: number[];
  quotedGroups?: number[];
}

const redacted = (category: string): string => `[REDACTED:${category}]`;

/**
 * R-002: a Basic credential is base64("user:password"). Only redact when the payload decodes
 * to printable text containing ":"; this keeps prose such as "Basic auth is used" untouched.
 */
function looksLikeBasicCredential(payload: string): boolean {
  if (payload.replace(/=+$/, "").length < 2) return false;
  const decoded = Buffer.from(payload, "base64").toString("utf8");
  if (!decoded.includes(":")) return false;
  // Reject control characters (except tab) and the replacement character from invalid UTF-8.
  for (const ch of decoded) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09) || code === 0x7f || code === 0xfffd) return false;
  }
  return true;
}

const CANONICAL_MARKER = /^\[REDACTED:([a-z-]+)\]$/;

/** True only for an exact "[REDACTED:<category>]" produced by this masker (R3-001). */
function isCanonicalMarker(value: string): boolean {
  const m = CANONICAL_MARKER.exec(value);
  return m !== null && m[1] !== undefined && CATEGORY_SET.has(m[1]);
}

/** Prefix-closed alternation of a literal: "abc" → "a|ab|abc" (for `partial` regexes). */
function prefixes(literal: string): string {
  const esc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  return Array.from({ length: literal.length }, (_, i) => esc(literal.slice(0, i + 1))).join("|");
}
/** Prefix-closed form of a simple key pattern made of letters and optional `[_-]?` separators. */
function prefixClosedKey(key: string): string {
  const units = key.match(/\[_-\]\?|[a-z]/g) ?? [];
  let out = "";
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const u = units[i] ?? "";
    out = i === units.length - 1 ? u : `${u}(?:${out})?`;
  }
  return out;
}

/**
 * Key names of the key-value category — the single definition used by the main pattern, its anchor
 * and its `partial` (M2-0-R2-001 / 追加2; tested).
 */
export const KEY_VALUE_KEYS = "api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|token|password|passwd|pwd";
const KEY_VALUE_KEY_PREFIXES = KEY_VALUE_KEYS.split("|").map(prefixClosedKey).join("|");
/** Longest key ("refresh_token" / "session-token" = 13) rounded up. */
const KEY_VALUE_ANCHOR_MAX = 16;

/*
 * Anchor sub-expressions (M2-0-R3-001, ADR-0013). Every scanner body is written as anchor source +
 * rest, so the anchor is a textual prefix of the body with the same quantifier bounds; a structural
 * test checks this for every scanned pattern.
 */
const PK_BEGIN = "-----BEGIN ";
const PK_LABEL = "[A-Z0-9 ]*";
const PK_MARKER_TAIL = "PRIVATE KEY-----";
const PK_BEGIN_MARKER = `${PK_BEGIN}${PK_LABEL}${PK_MARKER_TAIL}`;
/** The scheme is bounded for the scanner only (a bounded window anchor); the masker's scheme is not (R3-002). */
const URL_ANCHOR = String.raw`\b[a-z][a-z0-9+.-]{0,63}:\/\/`;
const GITHUB_ANCHOR = String.raw`\b(?:gh[poustr]_|github_pat_)`;
const KEY_VALUE_ANCHOR = `(?<![A-Za-z0-9])(?:${KEY_VALUE_KEYS})\\b`;

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    category: "private-key",
    pattern: new RegExp(`${PK_BEGIN_MARKER}[\\s\\S]*?-----END ${PK_LABEL}${PK_MARKER_TAIL}`, "g"),
    replacement: redacted("private-key"),
    scan: true,
    // A real PEM spans several lines; the line-oriented scanner detects it as a block (M1-R1-002).
    scanMode: "block",
    block: { begin: new RegExp(PK_BEGIN_MARKER), end: /-----END [A-Z0-9 ]*PRIVATE KEY-----/ },
    // Anchor = the literal "-----BEGIN " (M2-0-R3-001): the label is unbounded in the pattern and the
    // block begin, so a bounded label in the anchor would not be a prefix of every match. partial =
    // "-----BEGIN " cut anywhere, then a label and a cut "PRIVATE KEY-----". A complete BEGIN marker is
    // resolved (M2-0-R2-001 / 追加4): the block state machine carries the key body, so no
    // oversized-candidate is raised for it; a label longer than maxCarryBytes is oversized (fail closed).
    anchor: {
      start: new RegExp(PK_BEGIN, "g"),
      partial: new RegExp(`^(?:${prefixes(PK_BEGIN)}|${PK_BEGIN}${PK_LABEL}(?:${prefixes(PK_MARKER_TAIL)})?|${PK_BEGIN_MARKER}[\\s\\S]*)$`),
      anchorMaxBytes: PK_BEGIN.length,
    },
  },
  {
    category: "url-credential",
    // <scheme>://<user>:<password>@<host>  ->  <scheme>://[REDACTED]@<host>
    // (angle brackets keep this comment from matching the pattern below when the repository scans itself)
    // Masker: the scheme is unbounded (RFC 3986 sets no maximum; same as v0.3.1 — M2-0-R3-002).
    // maskSecrets does not run this regex (quadratic on long runs of scheme characters, backlog 35): mask.ts finds the same
    // matches with the same replacement in linear time, and a test compares the two. The regex stays the definition.
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi,
    replacement: `$1${redacted("url-credential")}@`,
    scan: true,
    // Scanner: the scheme is bounded to 64 characters so that the window anchor (the scheme) is bounded
    // and a prefix of every scanner match (ADR-0013). Known limitation: a credential URL with a longer
    // scheme is not detected by the scanner (it is still redacted by the masker).
    scanPattern: new RegExp(String.raw`${URL_ANCHOR}[^\s/:@]+:[^\s/@]+@`, "gi"),
    // Anchor = the scheme and "://". partial = a match cut anywhere: scheme, "://", user, ":", password, "@".
    anchor: {
      start: new RegExp(URL_ANCHOR, "gi"),
      partial: /^[a-z][a-z0-9+.-]{0,63}(?::(?:\/(?:\/(?:[^\s/:@]*(?::(?:[^\s/@]*@?)?)?)?)?)?)?$/i,
      anchorMaxBytes: 67,
    },
  },
  {
    category: "bearer",
    // R2-004: inside an Authorization / Proxy-Authorization header the credential is explicit,
    // so a Bearer token is redacted regardless of its length.
    pattern: /\b((?:proxy-)?authorization\s*:\s*bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
    replacement: `$1${redacted("bearer")}`,
    scan: false,
    scanNote: "mask-only: bare 'Bearer <token>' shapes match ordinary code and prose; values are still redacted from reports",
  },
  {
    category: "basic",
    // R2-004: in a header, any syntactically valid base64 payload is redacted (no decoding).
    pattern: /\b((?:proxy-)?authorization\s*:\s*basic\s+)([A-Za-z0-9+/]+={0,2})/gi,
    replacement: `$1${redacted("basic")}`,
    scan: false,
    scanNote: "mask-only: 'Basic <base64>' shapes match ordinary text; values are still redacted from reports",
  },
  {
    category: "bearer",
    // R-002: bare "bearer <token>" in prose. Scheme is case-insensitive; keep the 16-char floor
    // so text like "bearer authentication" is not redacted (heuristic applies to prose only).
    pattern: /\b(bearer)\s+([A-Za-z0-9\-._~+/]{16,}=*)/gi,
    replacement: `$1 ${redacted("bearer")}`,
    scan: false,
    scanNote: "mask-only: bare 'Bearer <token>' shapes match ordinary code and prose; values are still redacted from reports",
  },
  {
    category: "basic",
    // R-002: bare "basic <payload>" in prose. Short credentials ("dTpw" = base64("u:p")) are
    // valid, so validate by decoding instead of by length (heuristic applies to prose only).
    pattern: /\b(basic)\s+([A-Za-z0-9+/]{2,}={0,2})(?![A-Za-z0-9+/=])/gi,
    replacement: (match, scheme, payload) =>
      payload !== undefined && looksLikeBasicCredential(payload) ? `${scheme} ${redacted("basic")}` : match,
    scan: false,
    scanNote: "mask-only: 'Basic <base64>' shapes match ordinary text; values are still redacted from reports",
  },
  {
    category: "anthropic",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
    replacement: redacted("anthropic"),
    scan: true,
    anchor: { start: /\bsk-ant-/g, partial: new RegExp(`^(?:${prefixes("sk-ant-")}|sk-ant-[A-Za-z0-9_-]*)$`), anchorMaxBytes: 7 },
  },
  {
    category: "openai",
    pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{16,}/g,
    replacement: redacted("openai"),
    scan: true,
    anchor: { start: /\bsk-/g, partial: new RegExp(`^(?:${prefixes("sk-")}|sk-[A-Za-z0-9_-]*)$`), anchorMaxBytes: 3 },
  },
  {
    category: "aws",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: redacted("aws"),
    scan: true,
    anchor: { start: /\b(?:AKIA|ASIA)/g, partial: new RegExp(`^(?:${prefixes("AKIA")}|${prefixes("ASIA")}|(?:AKIA|ASIA)[A-Z0-9]{0,16})$`), anchorMaxBytes: 4 },
  },
  {
    category: "github",
    // Anchor + rest (M2-0-R3-001): gh[poust]_ and ghr_ share one character class; a lookbehind picks
    // the body class of the prefix the anchor matched. Same language as the v0.3.2 alternation (tested).
    pattern: new RegExp(String.raw`${GITHUB_ANCHOR}(?:(?<=gh[poustr]_)[A-Za-z0-9]{20,}|(?<=github_pat_)[A-Za-z0-9_]{20,})\b`, "g"),
    replacement: redacted("github"),
    scan: true,
    anchor: {
      start: new RegExp(GITHUB_ANCHOR, "g"),
      partial: new RegExp(`^(?:g|gh|gh[poustr]|gh[poustr]_[A-Za-z0-9]*|${prefixes("github_pat_")}|github_pat_[A-Za-z0-9_]*)$`),
      anchorMaxBytes: 11,
    },
  },
  {
    category: "slack",
    pattern: /\bxox[abpors]-[A-Za-z0-9-]{10,}/g,
    replacement: redacted("slack"),
    scan: true,
    anchor: { start: /\bxox[abpors]-/g, partial: /^(?:x|xo|xox|xox[abpors]|xox[abpors]-[A-Za-z0-9-]*)$/, anchorMaxBytes: 5 },
  },
  {
    category: "google",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replacement: redacted("google"),
    scan: true,
    anchor: { start: /\bAIza/g, partial: new RegExp(`^(?:${prefixes("AIza")}|AIza[0-9A-Za-z_-]{0,35})$`), anchorMaxBytes: 4 },
  },
  {
    category: "gitlab",
    pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
    replacement: redacted("gitlab"),
    scan: true,
    anchor: { start: /\bglpat-/g, partial: new RegExp(`^(?:${prefixes("glpat-")}|glpat-[A-Za-z0-9_-]*)$`), anchorMaxBytes: 6 },
  },
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: redacted("jwt"),
    scan: true,
    anchor: { start: /\beyJ/g, partial: /^(?:e|ey|eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*)?)?)$/, anchorMaxBytes: 3 },
  },
  {
    category: "key-value",
    // password=xxx, "api_key": "xxx", TOKEN: xxx, AWS_SECRET_ACCESS_KEY=xxx ... keep the key,
    // replace the value.
    // R-001: the key may be the tail of a longer identifier (AWS_SESSION_TOKEN, MY_API_KEY):
    //        a lookbehind for a non-alphanumeric char allows "_" before the key.
    // R-003 / R2-001: a quoted value is replaced up to its closing quote (whitespace included).
    //        "…" and '…' are separate alternatives, so the other kind of quote is an ordinary
    //        character inside the value, and a backslash-escaped quote belongs to the value.
    //        Fail-safe: a quote that is not closed on the same line masks to the end of the line
    //        (ADR-0006: prefer over-masking to leaking).
    //        An unquoted value stops at whitespace / quote / separator as before.
    // M2-0-R3-001: written as anchor (the key name) + rest; group 1 is the separator part only.
    pattern: new RegExp(
      `${KEY_VALUE_ANCHOR}(["']?\\s*[:=]\\s*)(?:"((?:[^"\\\\\\r\\n]|\\\\.)*)"|'((?:[^'\\\\\\r\\n]|\\\\.)*)'|(["'])([^\\r\\n]+)|([^\\s"',;]+))`,
      "gi",
    ),
    // R3-001: re-masking is prevented only when the whole value is one of aiqh's own canonical
    //         markers "[REDACTED:<category>]"; any other value starting with "[REDACTED:" is a
    //         secret like any other and is masked in full.
    // The kept part (key name and separator) is the match without its value part.
    replacement: (match, _separator, dq, sq, openQuote, unterminated, bare) => {
      const raw = dq ?? sq ?? unterminated ?? bare;
      if (raw !== undefined && isCanonicalMarker(raw)) return match;
      const value = redacted("key-value");
      const keep = (valuePartLength: number): string => match.slice(0, match.length - valuePartLength);
      if (dq !== undefined) return `${keep(dq.length + 2)}"${value}"`;
      if (sq !== undefined) return `${keep(sq.length + 2)}'${value}'`;
      if (openQuote !== undefined) return `${keep(openQuote.length + (unterminated ?? "").length)}${openQuote}${value}`;
      return `${keep((bare ?? "").length)}${value}`;
    },
    // M2-0: scanned, but only values that look like secrets are findings (looksLikeSecretValue);
    // the masker keeps redacting every assignment (ADR-0006: over-masking is fine in reports).
    scan: true,
    valueFilter: (value, quoted) => looksLikeSecretValue(value, { quoted }),
    valueGroups: [2, 3, 5, 6],
    quotedGroups: [2, 3, 5],
    // Anchor = the key name only (bounded); partial = key, optional quote, spaces, separator, spaces
    // and a value of any of the three forms cut anywhere (the closing quote may be missing).
    anchor: {
      start: new RegExp(KEY_VALUE_ANCHOR, "gi"),
      partial: new RegExp(`^(?:${KEY_VALUE_KEY_PREFIXES}|(?:${KEY_VALUE_KEYS})\\b["']?\\s*(?:[:=]\\s*(?:"(?:[^"\\\\\\r\\n]|\\\\.)*"?|'(?:[^'\\\\\\r\\n]|\\\\.)*'?|["'][^\\r\\n]*|[^\\s"',;]*)?)?)$`, "i"),
      anchorMaxBytes: KEY_VALUE_ANCHOR_MAX,
    },
  },
];

/**
 * Value heuristic for the key-value category (M2-0 §6). A value is a candidate secret only when it
 * is a quoted literal, or a bare dotenv / shell style value without code-like characters; then it
 * must be at least 8 characters and mix letters with digits (or three of: lower, upper, digit,
 * symbol). Interpolations and references, placeholders, booleans / null and pure numbers are never
 * secrets. Known limitation (documented in CONFIG_SPEC / ADR-0012): a long passphrase made of
 * letters only is not detected. The masker does not use this function.
 */
const VALUE_REFERENCE = [/\$\{/, /\bprocess\.env\b/, /\bos\.environ\b/, /%\([^)]*\)s/, /\{\{/, /^\$[A-Za-z_]/];
const VALUE_PLACEHOLDER = [/^<[^>]*>$/, /^x{3,}$/i, /changeme/i, /example/i, /dummy/i, /placeholder/i, /^your[-_]/i, /^\*{3,}$/, /REDACTED/, /^(?:true|false|null|none|nil|undefined)$/i];
const CODE_LIKE_BARE = /[()[\]{}]|\w(?:\.|->|::)\w/;

export function looksLikeSecretValue(value: string, opts: { quoted?: boolean } = {}): boolean {
  const v = value.trim();
  if (v.length < 8) return false;
  if (VALUE_REFERENCE.some((re) => re.test(v))) return false;
  if (VALUE_PLACEHOLDER.some((re) => re.test(v))) return false;
  if (/^[0-9.+\-eE_]+$/.test(v)) return false; // numeric
  if (!opts.quoted && CODE_LIKE_BARE.test(v)) return false; // getPassword(), config.get(...), this.password
  const lower = /[a-z]/.test(v);
  const upper = /[A-Z]/.test(v);
  const digit = /[0-9]/.test(v);
  const symbol = /[^A-Za-z0-9\s]/.test(v);
  const letter = lower || upper;
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  return (letter && digit) || classes >= 3;
}

/**
 * Remove aiqh's own canonical markers "[REDACTED:<category>]" from `text` (scanner pre-processing):
 * reports and tests legitimately contain them, and a marker inside a URL would otherwise look like
 * a credential. Only exact markers of known categories are removed, so a real secret next to a
 * marker is still visible to the scanner.
 */
export function stripCanonicalMarkers(text: string): string {
  return text.replace(/\[REDACTED:([a-z-]+)\]/g, (m, cat: string) => (CATEGORY_SET.has(cat) ? "REDACTED" : m));
}

/** Categories known to the masker / scanner, derived from the definitions (never hard-coded elsewhere). */
export const SECRET_CATEGORIES: readonly string[] = [...new Set(SECRET_PATTERNS.map((p) => p.category))];
const CATEGORY_SET: ReadonlySet<string> = new Set(SECRET_CATEGORIES);

/** Categories the scanner searches for. */
export const SCANNED_CATEGORIES: readonly string[] = [...new Set(SECRET_PATTERNS.filter((p) => p.scan).map((p) => p.category))];

/** Mask-only categories with the reason the scanner skips them. */
export const UNSCANNED_CATEGORIES: ReadonlyArray<{ category: string; reason: string }> = (() => {
  const seen = new Map<string, string>();
  for (const p of SECRET_PATTERNS) {
    if (!p.scan && !seen.has(p.category)) seen.set(p.category, p.scanNote ?? "mask-only");
  }
  return [...seen.entries()].map(([category, reason]) => ({ category, reason }));
})();
