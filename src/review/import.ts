/**
 * `aiqh review-import` (M2-2, ADR-0026): what is read from a review and how it is checked, without touching files. The review is Markdown
 * with exactly one fenced block of the info string `aiqh-findings`; the JSON in it is the source of the findings, and the body (every line
 * outside the block) is checked against it: the `### <ID>` headings, the one count line of `## 全体の結論`, and every mention of an ID of
 * this round. Every disagreement is a Problem, and one Problem is enough to write nothing (exit 2): a finding of the body that the JSON
 * left out must not end as an import that looks complete (fail closed). A Problem names its condition, a line and an ID of the expected
 * shape only; it never carries the reviewer's text (unknown keys and invalid values are not quoted).
 */
import { z } from "zod";

/** The limits of a review and of a findings file (ADR-0026). The input file itself is limited to INPUT_BYTES. */
export const LIMITS = {
  inputBytes: 1_048_576,
  findings: 200,
  previous: 200,
  idChars: 64,
  labelChars: 64,
  targetChars: 2_000,
  textChars: 20_000,
  assessmentChars: 4_000,
  maxRound: 999,
} as const;

export const SEVERITIES = ["High", "Medium", "Low"] as const;
export const KINDS = ["バグ", "設計", "テスト", "文書"] as const;
export const CONFIDENCES = ["確認済み", "推測"] as const;
export const STATUSES = ["open", "resolved", "deferred", "accepted", "invalid"] as const;

/** Labels: the names of docs/reviews/<label>/ (lower-case ASCII letters, digits, "." and "-"; no "..", no separator). */
export const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;
/** ID prefixes: upper-case ASCII letters and digits in groups joined by "-" (B20, M2-2-RI). */
export const ID_PREFIX_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){0,7}$/;

/** A non-blank string of at most `max` UTF-16 code units. */
const text = (max: number) => z.string().min(1).max(max).regex(/\S/);
const count = z.number().int().min(0).max(LIMITS.findings);
const summarySchema = z.strictObject({ high: count, medium: count, low: count });
const previousSchema = z.array(z.strictObject({ id: text(LIMITS.idChars), assessment: text(LIMITS.assessmentChars) })).max(LIMITS.previous);

const inputFinding = z.strictObject({
  id: z.string().max(LIMITS.idChars),
  severity: z.enum(SEVERITIES),
  kind: z.enum(KINDS),
  target: text(LIMITS.targetChars),
  content: text(LIMITS.textChars),
  evidence: text(LIMITS.textChars),
  fix: text(LIMITS.textChars),
  confidence: z.enum(CONFIDENCES),
});

/** The JSON of the aiqh-findings block (schema version 1). */
export const reviewInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  label: z.string().max(LIMITS.labelChars),
  round: z.number().int().min(1).max(LIMITS.maxRound),
  summary: summarySchema,
  findings: z.array(inputFinding).max(LIMITS.findings),
  previous: previousSchema.optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/**
 * A findings file, docs/reviews/<label>/findings-r<N>.json (schema version 1). The stored strings went through the masker, which can make a
 * string longer, so the text limits here are twice the input's. The implementer's fields are null in v1 (their forms are decided with v2).
 */
const storedText = (max: number) => z.string().min(1).max(max * 2);
const implementerField = z.string().max(LIMITS.textChars * 2).nullable();
export const findingsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  label: z.string().regex(LABEL_PATTERN),
  round: z.number().int().min(1).max(LIMITS.maxRound),
  idPrefix: z.string().regex(ID_PREFIX_PATTERN),
  source: z.strictObject({ name: z.string().min(1).max(1_000), bytes: z.number().int().min(0).max(LIMITS.inputBytes), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  summary: summarySchema,
  previous: z.array(z.strictObject({ id: storedText(LIMITS.idChars), assessment: storedText(LIMITS.assessmentChars) })).max(LIMITS.previous),
  importedAt: z.string().max(40),
  tool: z.strictObject({ name: z.literal("aiqh"), version: z.string().min(1).max(64) }),
  findings: z
    .array(
      z.strictObject({
        id: z.string().max(LIMITS.idChars),
        severity: z.enum(SEVERITIES),
        kind: z.enum(KINDS),
        target: storedText(LIMITS.targetChars),
        content: storedText(LIMITS.textChars),
        evidence: storedText(LIMITS.textChars),
        fix: storedText(LIMITS.textChars),
        confidence: z.enum(CONFIDENCES),
        status: z.enum(STATUSES),
        verdict: implementerField,
        action: implementerField,
        fixedIn: implementerField,
        regressionTest: implementerField,
        guard: implementerField,
        destination: implementerField,
        note: implementerField,
      }),
    )
    .max(LIMITS.findings),
});
export type FindingsFile = z.infer<typeof findingsFileSchema>;

/** A reason not to import: the condition, and where (a line of the review, an ID of the expected shape). Never the reviewer's text. */
export interface Problem {
  kind: "block" | "json" | "schema" | "label-round" | "id" | "summary" | "conclusion" | "count-line" | "heading" | "id-mention";
  message: string;
}

export interface ReviewTarget {
  label: string;
  round: number;
  idPrefix: string;
}

export type ReadResult = { ok: true; input: ReviewInput } | { ok: false; problems: Problem[] };

const OPEN_FENCE = "```aiqh-findings";
const CLOSE_FENCE = "```";
const CONCLUSION = "## 全体の結論";
const COUNT_LINE = /^件数: High (\d{1,3}) \/ Medium (\d{1,3}) \/ Low (\d{1,3})$/;
/** Hyphen-like characters that NFKC leaves as they are (they are read as "-" when looking for IDs). */
const HYPHENS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/**
 * A line or a string as it is searched for IDs of this round: what a renderer would show as the ID is made the ID. Numeric character
 * references (`&#45;`, `&#x2D;`) are decoded, Markdown backslash escapes lose the backslash, the emphasis and code marks (`*`, `_`,
 * backquote, `~`) and format characters (zero-width ones, \p{Cf}) are removed, then NFKC, hyphen-like characters as "-", upper case.
 * Removing characters can join two words into a string that looks like an ID: that is refused (the safe side).
 */
function fold(s: string): string {
  return s
    .replace(/&#(\d{1,7});/g, (_m, d: string) => safeChar(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/[*_`~]|\p{Cf}/gu, "")
    .normalize("NFKC")
    .replace(HYPHENS, "-")
    .toUpperCase();
}

function safeChar(cp: number): string {
  return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

/** Every string value of a JSON value (the data the schema let through). */
function stringsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (v !== null && typeof v === "object") for (const x of Object.values(v)) stringsOf(x, out);
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A line as the structure is read: without one CR at its end (a review saved with CRLF). */
function structural(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/** The path of a schema issue, with only the names this schema defines and array indexes (an unknown key is the reviewer's text). */
function issuePath(p: ReadonlyArray<PropertyKey>): string {
  const known = new Set(["schemaVersion", "label", "round", "summary", "high", "medium", "low", "findings", "previous", "id", "severity", "kind", "target", "content", "evidence", "fix", "confidence", "assessment"]);
  const parts = p.map((k) => (typeof k === "number" ? `[${k}]` : typeof k === "string" && known.has(k) ? `.${k}` : ".(unknown key)"));
  return parts.length === 0 ? "(top)" : parts.join("").replace(/^\./, "");
}

function issueText(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "unrecognized_keys":
      return `${issue.keys.length} unknown field(s) at ${issuePath(issue.path)}`;
    case "invalid_value":
      return `a value outside the allowed set at ${issuePath(issue.path)}`;
    case "invalid_type":
      return `a value of the wrong type at ${issuePath(issue.path)} (expected ${issue.expected})`;
    case "too_big":
      return `too long or too many at ${issuePath(issue.path)} (limit ${String(issue.maximum)})`;
    case "too_small":
      return `empty or too few at ${issuePath(issue.path)}`;
    case "invalid_format":
      return `a blank value at ${issuePath(issue.path)}`;
    default:
      return `${issue.code} at ${issuePath(issue.path)}`;
  }
}

/**
 * Read a review: the aiqh-findings block, its JSON against the schema and the target, then the body against the JSON. All problems that
 * can be found are returned (the body is checked even when the JSON cannot be used, as far as it can be without it).
 */
export function readReview(textOfReview: string, target: ReviewTarget): ReadResult {
  const problems: Problem[] = [];
  const lines = textOfReview.split("\n");
  const s = lines.map(structural);

  // 1. The block: exactly one opening fence (OPEN_FENCE, alone on its line) and its closing fence (CLOSE_FENCE).
  const opens: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const l = s[i] ?? "";
    if (l === OPEN_FENCE) opens.push(i);
    else if (/^\s*(```|~~~)/.test(l) && /aiqh-findings/i.test(l)) problems.push({ kind: "block", message: `a fence that is not exactly ${OPEN_FENCE} (line ${i + 1})` });
  }
  let blockStart = -1;
  let blockEnd = -1;
  if (opens.length !== 1) problems.push({ kind: "block", message: `${opens.length} aiqh-findings blocks; exactly 1 is required` });
  else {
    blockStart = opens[0] ?? -1;
    for (let i = blockStart + 1; i < s.length; i++) {
      if (s[i] === CLOSE_FENCE) {
        blockEnd = i;
        break;
      }
    }
    if (blockEnd === -1) problems.push({ kind: "block", message: `the aiqh-findings block opened at line ${blockStart + 1} is not closed` });
  }

  // 2. The JSON.
  let input: ReviewInput | null = null;
  if (blockStart !== -1 && blockEnd !== -1) {
    let parsed: unknown;
    let jsonOk = true;
    try {
      parsed = JSON.parse(lines.slice(blockStart + 1, blockEnd).join("\n"));
    } catch {
      jsonOk = false;
      problems.push({ kind: "json", message: `the aiqh-findings block (lines ${blockStart + 2}-${blockEnd}) is not valid JSON` });
    }
    if (jsonOk) {
      const r = reviewInputSchema.safeParse(parsed);
      if (!r.success) for (const issue of r.error.issues) problems.push({ kind: "schema", message: issueText(issue) });
      else input = r.data;
    }
  }

  // 3. The JSON against the options, its IDs and its summary.
  const idPattern = new RegExp(`^${escapeRegExp(target.idPrefix)}-R${target.round}-(\\d{3})$`);
  const ids = new Set<string>();
  if (input !== null) {
    if (input.label !== target.label) problems.push({ kind: "label-round", message: "the JSON's label is not --label" });
    if (input.round !== target.round) problems.push({ kind: "label-round", message: `the JSON's round ${input.round} is not --round ${target.round}` });
    const numbers: number[] = [];
    input.findings.forEach((f, i) => {
      const m = idPattern.exec(f.id);
      if (m === null) {
        problems.push({ kind: "id", message: `findings[${i}].id is not of the form ${target.idPrefix}-R${target.round}-NNN` });
        return;
      }
      if (ids.has(f.id)) problems.push({ kind: "id", message: `${f.id} appears more than once` });
      ids.add(f.id);
      numbers.push(Number(m[1]));
    });
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    if (sorted.some((n, i) => n !== i + 1)) problems.push({ kind: "id", message: `the IDs are not numbered 001 to ${String(sorted.length).padStart(3, "0")} without a gap` });
    const by = (sev: string): number => input?.findings.filter((f) => f.severity === sev).length ?? 0;
    const got = { high: by("High"), medium: by("Medium"), low: by("Low") };
    if (got.high !== input.summary.high || got.medium !== input.summary.medium || got.low !== input.summary.low) {
      problems.push({ kind: "summary", message: `the JSON's summary High ${input.summary.high} / Medium ${input.summary.medium} / Low ${input.summary.low} is not its findings' High ${got.high} / Medium ${got.medium} / Low ${got.low}` });
    }
  }

  // 4. The body: every line outside the block.
  const inBlock = (i: number): boolean => blockStart !== -1 && i >= blockStart && (blockEnd === -1 || i <= blockEnd);
  const conclusions = s.flatMap((l, i) => (!inBlock(i) && l === CONCLUSION ? [i] : []));
  let section: [number, number] | null = null;
  if (conclusions.length !== 1) problems.push({ kind: "conclusion", message: `${conclusions.length} "${CONCLUSION}" sections; exactly 1 is required` });
  else {
    const from = conclusions[0] ?? 0;
    let to = s.length;
    for (let i = from + 1; i < s.length; i++) {
      if (!inBlock(i) && /^#{1,2}\s/.test(s[i] ?? "")) {
        to = i;
        break;
      }
    }
    section = [from, to];
  }
  const countLines = s.flatMap((l, i) => (!inBlock(i) && COUNT_LINE.test(l) ? [i] : []));
  const inSection = countLines.filter((i) => section !== null && i > section[0] && i < section[1]);
  for (const i of countLines.filter((x) => !inSection.includes(x))) problems.push({ kind: "count-line", message: `a count line outside "${CONCLUSION}" (line ${i + 1})` });
  if (section !== null && inSection.length !== 1) problems.push({ kind: "count-line", message: `${inSection.length} count lines "件数: High <n> / Medium <n> / Low <n>" in "${CONCLUSION}"; exactly 1 is required` });
  if (inSection.length === 1 && input !== null) {
    const m = COUNT_LINE.exec(s[inSection[0] ?? 0] ?? "");
    const [h, md, lo] = [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
    if (h !== input.summary.high || md !== input.summary.medium || lo !== input.summary.low) {
      problems.push({ kind: "count-line", message: `the count line (line ${(inSection[0] ?? 0) + 1}) is not the JSON's summary` });
    }
  }

  // Headings: `### <ID>` alone is a finding of this round; a heading that is only an ID of another round of the same prefix is refused.
  const anyRoundHeading = new RegExp(`^#{1,6}\\s+${escapeRegExp(target.idPrefix)}-R(\\d+)-\\d+\\s*$`);
  const headings = new Map<string, number[]>();
  s.forEach((l, i) => {
    if (inBlock(i)) return;
    const own = /^### (\S+)$/.exec(l);
    if (own !== null && idPattern.test(own[1] ?? "")) {
      const id = own[1] ?? "";
      headings.set(id, [...(headings.get(id) ?? []), i + 1]);
      return;
    }
    const other = anyRoundHeading.exec(l);
    if (other !== null) problems.push({ kind: "heading", message: `a heading that is only an ID but not a "### <ID>" of round ${target.round} (line ${i + 1})` });
  });
  for (const [id, at] of headings) if (at.length > 1) problems.push({ kind: "heading", message: `${id} has ${at.length} headings (lines ${at.join(", ")})` });
  if (input !== null) {
    for (const [id, at] of headings) if (!ids.has(id)) problems.push({ kind: "heading", message: `${id} (line ${at[0]}) is a heading of the body but not a finding of the JSON` });
    for (const id of ids) if (!headings.has(id)) problems.push({ kind: "heading", message: `${id} is a finding of the JSON without a "### ${id}" heading in the body` });
  }

  // Mentions: an ID of this round anywhere in the review — the body and the strings of the JSON block alike (case, width and hyphen forms
  // folded) — must be a finding of the JSON: an ID named only in a JSON string (a `content` that says "see P-R1-002") is a finding left out.
  const mention = new RegExp(`(?<![A-Z0-9-])${escapeRegExp(target.idPrefix.toUpperCase())}-R${target.round}-\\d+(?![0-9])`, "g");
  const known = new Set([...ids].map((x) => x.toUpperCase()));
  if (input !== null) {
    s.forEach((l, i) => {
      for (const m of fold(l).matchAll(mention)) {
        if (!known.has(m[0])) problems.push({ kind: "id-mention", message: `${m[0]} (line ${i + 1}) is an ID of this round that is not a finding of the JSON` });
      }
    });
    // The JSON's strings once more after parsing: an ID written with JSON escapes (a "-" for "-") is not visible in the lines.
    const inJson = new Set<string>();
    for (const str of stringsOf(input)) for (const m of fold(str).matchAll(mention)) if (!known.has(m[0])) inJson.add(m[0]);
    for (const id of inJson) problems.push({ kind: "id-mention", message: `${id} is an ID of this round in a string of the JSON that is not a finding of the JSON` });
  }

  return problems.length === 0 && input !== null ? { ok: true, input } : { ok: false, problems };
}
