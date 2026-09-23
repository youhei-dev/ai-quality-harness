/**
 * Checked strings (M2-1 R2, ADR-0014). Every string that is rendered into the review packet or written into
 * its ZIP — paths, refs, globs, file names, labels, verify values, commit subjects, the ZIP entry name, and
 * the values aiqh derives (SHAs, versions, times) — must first pass the pre-render check: no forbidden raw
 * character (raw-chars.ts) and no secret shape (the shared scanner). The renderers of packet.ts and the ZIP
 * writer accept only `Checked`, and only this module creates it (no `as Checked` elsewhere; a test enforces
 * that), so a value that skipped the check is a type error rather than a leak found in review.
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

/** The pre-render check: raw characters, then secret shapes (without allow rules: a value has no file line). */
export function checkValue(value: string, security: ResolvedSecurity): CheckResult {
  const findings: ValueFinding[] = [];
  for (const h of findRawChars(value)) findings.push({ kind: "raw-char", line: h.line, detail: formatCodePoint(h.codePoint) });
  for (const f of scanString(value, security)) {
    findings.push({ kind: f.kind === "oversized-candidate" ? "oversized-candidate" : "secret", line: f.line ?? 1, detail: f.category ?? null });
  }
  return findings.length === 0 ? { ok: true, value: value as Checked } : { ok: false, findings };
}

/**
 * Stands in for a value that failed the check, so that checking can go on and report every finding. It is
 * never rendered: any finding stops the packet before rendering (and it would show no value if it were).
 */
export const REJECTED = "<rejected>" as Checked;
