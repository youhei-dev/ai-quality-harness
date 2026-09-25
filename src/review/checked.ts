/**
 * Checked strings (M2-1 R2, ADR-0014). Every string that is rendered into the review packet or written into
 * its ZIP — paths, refs, globs, file names, labels, verify values, commit subjects, the ZIP entry name, and
 * the values aiqh derives (SHAs, versions, times) — must first pass the pre-render check: no forbidden raw
 * character (raw-chars.ts) and no secret shape (the shared scanner). The renderers of packet.ts and the ZIP
 * writer accept only `Checked`, so a value that skipped the check is a type error rather than a leak found in
 * review.
 *
 * The type alone can be bypassed (`any`, assertions, type guards, covariant containers; M2-1-R3-004), so the
 * guarantee has two more parts (M2-2): only `issue` below creates the brand (tests/structure/brand-guard.ts
 * checks every assertion, type guard and `any` flow into the brand with the type checker), and every string
 * that passed the check is recorded in this module; the renderers and the ZIP writer call `assertChecked`,
 * which throws for a string that never passed (fail closed at run time, whatever way it was forged).
 *
 * The renderers still escape: a Checked value may contain LF, TAB, backslashes and backticks, which are
 * allowed characters but not plain Markdown. Findings carry a line and a code point or category, never the
 * value.
 */
import type { ResolvedSecurity } from "../types.ts";
import { findRawChars, formatCodePoint } from "../security/raw-chars.ts";
import { scanString } from "../security/scan.ts";

declare const checkedBrand: unique symbol;

/** A string that passed checkValue (no forbidden raw character, no secret shape). */
export type Checked = string & { readonly [checkedBrand]: true };

/** Why a value is not Checked; never contains the value. */
export interface ValueFinding {
  kind: "raw-char" | "secret" | "oversized-candidate";
  /** 1-based line within the value (split on LF). */
  line: number;
  /** The code point ("U+2028") of a raw character, or the secret category. */
  detail: string | null;
}

export type CheckResult = { ok: true; value: Checked } | { ok: false; findings: ValueFinding[] };

/**
 * Every string that passed checkValue in this process (M2-2, M2-1-R3-004). It only grows: a string that is
 * here has passed the check, so an equal string forged elsewhere has the same (checked) content.
 */
const issued = new Set<string>();

/** The only place that creates the brand (the structure test allows no other). */
function issue(value: string): Checked {
  issued.add(value);
  return value as Checked;
}

/** The pre-render check: raw characters, then secret shapes (without allow rules: a value has no file line). */
export function checkValue(value: string, security: ResolvedSecurity): CheckResult {
  const findings: ValueFinding[] = [];
  for (const h of findRawChars(value)) findings.push({ kind: "raw-char", line: h.line, detail: formatCodePoint(h.codePoint) });
  for (const f of scanString(value, security)) {
    findings.push({ kind: f.kind === "oversized-candidate" ? "oversized-candidate" : "secret", line: f.line ?? 1, detail: f.category ?? null });
  }
  return findings.length === 0 ? { ok: true, value: issue(value) } : { ok: false, findings };
}

/** A Checked value reached a renderer without passing checkValue (a forged brand); never shows the value. */
export class UncheckedValueError extends Error {
  override readonly name = "UncheckedValueError";
}

/**
 * Run-time proof that `value` passed checkValue in this process (M2-1-R3-004): throws UncheckedValueError for a
 * string the check never saw, however its type was forged. Called by every renderer and by the ZIP writer.
 */
export function assertChecked(value: Checked): Checked {
  if (typeof value !== "string" || !issued.has(value)) {
    throw new UncheckedValueError(`internal: a value reached ${typeof value === "string" ? "a renderer" : "a renderer as a non-string"} without passing the pre-render check`);
  }
  return value;
}

/**
 * Stands in for a value that failed the check, so that checking can go on and report every finding. It is
 * never rendered: any finding stops the packet before rendering (and it would show no value if it were).
 */
export const REJECTED = issue("<rejected>");
