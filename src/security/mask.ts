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
