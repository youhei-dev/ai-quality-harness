/**
 * Pattern-based masking of secret-looking strings.
 *
 * Every string that ends up in a report or on the console passes through `maskSecrets`.
 * The original value is never stored; matches are replaced by `[REDACTED:<category>]`.
 * The function is pure and idempotent. False positives are accepted (see ADR-0006).
 */

type Replacer = (match: string, ...groups: Array<string | undefined>) => string;

interface MaskRule {
  category: string;
  pattern: RegExp;
  /** Replacement template (`$1` etc. refer to capture groups) or a replacer function. */
  replacement: string | Replacer;
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

/** Order matters: broad multi-line blocks first, generic key/value last. */
const RULES: MaskRule[] = [
  {
    category: "private-key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: redacted("private-key"),
  },
  {
    category: "url-credential",
    // scheme://user:password@host  ->  scheme://[REDACTED]@host
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi,
    replacement: `$1${redacted("url-credential")}@`,
  },
  {
    category: "bearer",
    // R-002: scheme is case-insensitive. Bearer tokens are long; keep the 16-char floor so
    // prose like "bearer authentication" is not redacted.
    pattern: /\b(bearer)\s+([A-Za-z0-9\-._~+/]{16,}=*)/gi,
    replacement: `$1 ${redacted("bearer")}`,
  },
  {
    category: "basic",
    // R-002: short Basic credentials ("dTpw" = base64("u:p")) are valid; validate by decoding.
    pattern: /\b(basic)\s+([A-Za-z0-9+/]{2,}={0,2})(?![A-Za-z0-9+/=])/gi,
    replacement: (match, scheme, payload) =>
      payload !== undefined && looksLikeBasicCredential(payload)
        ? `${scheme} ${redacted("basic")}`
        : match,
  },
  {
    category: "anthropic",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
    replacement: redacted("anthropic"),
  },
  {
    category: "openai",
    pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{16,}/g,
    replacement: redacted("openai"),
  },
  {
    category: "aws",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: redacted("aws"),
  },
  {
    category: "github",
    pattern: /\b(?:gh[poust]_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: redacted("github"),
  },
  {
    category: "slack",
    pattern: /\bxox[abpors]-[A-Za-z0-9-]{10,}/g,
    replacement: redacted("slack"),
  },
  {
    category: "google",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replacement: redacted("google"),
  },
  {
    category: "gitlab",
    pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
    replacement: redacted("gitlab"),
  },
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: redacted("jwt"),
  },
  {
    category: "key-value",
    // password=xxx, "api_key": "xxx", TOKEN: xxx, AWS_SECRET_ACCESS_KEY=xxx ... keep the key,
    // replace the value.
    // R-001: the key may be the tail of a longer identifier (AWS_SESSION_TOKEN, MY_API_KEY):
    //        a lookbehind for a non-alphanumeric char allows "_" before the key.
    // R-003: a quoted value is replaced up to its closing quote (whitespace included);
    //        an unquoted value stops at whitespace / quote / separator as before.
    pattern:
      /(?<![A-Za-z0-9])((?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|token|password|passwd|pwd)\b["']?\s*[:=]\s*)(?:(["'])((?!\[REDACTED:)[^"'\r\n]+?)\2|(["']?)((?!\[REDACTED:)[^\s"',;]+))/gi,
    replacement: (_match, key, quote, _quotedValue, leadingQuote) =>
      quote !== undefined
        ? `${key}${quote}${redacted("key-value")}${quote}`
        : `${key}${leadingQuote ?? ""}${redacted("key-value")}`,
  },
];

export function maskSecrets(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out =
      typeof rule.replacement === "string"
        ? out.replace(rule.pattern, rule.replacement)
        : out.replace(rule.pattern, rule.replacement);
  }
  return out;
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

/** Categories known to the masker (for documentation and tests). */
export const MASK_CATEGORIES: readonly string[] = RULES.map((r) => r.category);
