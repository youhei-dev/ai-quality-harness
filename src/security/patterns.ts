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
  /** Global regex (with the flags the masker needs). The scanner recompiles from source/flags. */
  pattern: RegExp;
  /** Replacement template (`$1` …) or replacer function for the masker. */
  replacement: string | Replacer;
  /** Whether the security scanner searches tracked files for this category. */
  scan: boolean;
  /** Why the scanner skips this category (required when scan is false). */
  scanNote?: string;
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

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    category: "private-key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: redacted("private-key"),
    scan: true,
  },
  {
    category: "url-credential",
    // scheme://user:password@host  ->  scheme://[REDACTED]@host
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi,
    replacement: `$1${redacted("url-credential")}@`,
    scan: true,
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
  },
  {
    category: "openai",
    pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{16,}/g,
    replacement: redacted("openai"),
    scan: true,
  },
  {
    category: "aws",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: redacted("aws"),
    scan: true,
  },
  {
    category: "github",
    pattern: /\b(?:gh[poust]_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: redacted("github"),
    scan: true,
  },
  {
    category: "slack",
    pattern: /\bxox[abpors]-[A-Za-z0-9-]{10,}/g,
    replacement: redacted("slack"),
    scan: true,
  },
  {
    category: "google",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replacement: redacted("google"),
    scan: true,
  },
  {
    category: "gitlab",
    pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
    replacement: redacted("gitlab"),
    scan: true,
  },
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: redacted("jwt"),
    scan: true,
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
    pattern:
      /(?<![A-Za-z0-9])((?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|token|password|passwd|pwd)\b["']?\s*[:=]\s*)(?:"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|(["'])([^\r\n]+)|([^\s"',;]+))/gi,
    // R3-001: re-masking is prevented only when the whole value is one of aiqh's own canonical
    //         markers "[REDACTED:<category>]"; any other value starting with "[REDACTED:" is a
    //         secret like any other and is masked in full.
    replacement: (match, key, dq, sq, openQuote, unterminated, bare) => {
      const raw = dq ?? sq ?? unterminated ?? bare;
      if (raw !== undefined && isCanonicalMarker(raw)) return match;
      const value = redacted("key-value");
      if (dq !== undefined) return `${key}"${value}"`;
      if (sq !== undefined) return `${key}'${value}'`;
      if (openQuote !== undefined) return `${key}${openQuote}${value}`;
      return `${key}${value}`;
    },
    scan: false,
    scanNote:
      "mask-only: assignments of password / token / api-key style names are everywhere in source code; committed .env files are reported separately, and values in reports are still redacted",
  },
];

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
