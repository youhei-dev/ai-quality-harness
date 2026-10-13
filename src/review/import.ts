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
  kind: "block" | "json" | "schema" | "label-round" | "id" | "summary" | "conclusion" | "count-line" | "heading" | "id-mention" | "entity";
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

/** The named character references that may appear; they are decoded before the IDs are looked for (M2-2-RI-R1-001, the human decision). */
const ALLOWED_NAMED: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);
/** A named character reference with its semicolon (an HTML5 name is ASCII letters and digits). */
const NAMED_REFERENCE = /&([A-Za-z][A-Za-z0-9]{0,31});/g;
/**
 * The legacy names (HTML5 decodes them without the semicolon in raw HTML; CommonMark 0.31.2 §2.5 does not treat them as references) whose
 * character folds into something with an ID character (a digit, a letter: `&sup2`, `&frac12`, `&szlig`) or into nothing (`&shy`): computed
 * from the 106 legacy names of the HTML5 table (v0.6.1, ADR-0026). The other 96 fold into characters that are not in an ID. Followed by
 * letters or digits and a semicolon, it is a named reference (above).
 */
const LEGACY_REFUSED = /&(?:frac12|frac14|frac34|ordf|ordm|shy|sup1|sup2|sup3|szlig)(?![A-Za-z0-9]*;)/g;
/**
 * Numeric references, read as a browser reads them (the semicolon may be missing, every digit is read), and the five allowed named ones,
 * decoded in one pass (a decoded "&" does not start another reference).
 */
const DECODED = /&(?:#(\d+);?|#[xX]([0-9a-fA-F]+);?|(amp|lt|gt|quot|apos);)/g;
/**
 * What a browser shows for the numeric references 128 to 159 (the HTML standard's table of windows-1252 characters: `&#150;` is an en dash,
 * `&#153;` is a trade mark sign, "TM" after NFKC); 0: the code point itself.
 */
const C1_TABLE: readonly number[] = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];
/** CommonMark 0.31.2 §6.6: an open tag (its attributes; a quoted value may hold ">") and a closing tag, tried where a "<" is. */
const OPEN_TAG = /<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^"'=<>`\s]+|'[^']*'|"[^"]*"))?)*\s*\/?>/y;
const CLOSING_TAG = /<\/[A-Za-z][A-Za-z0-9-]*\s*>/y;
/** The local form of HTML: every `<…>` with no "<" or ">" inside (also what a browser drops and CommonMark does not read as HTML: `<?x>`, `</>`). */
const HTML_LOCAL = /<[^<>]*>/g;

/** How many references in `s` are refused: a named one that is not one of the five, or a legacy one of LEGACY_REFUSED. */
function refusedReferences(s: string): number {
  let n = 0;
  for (const m of s.matchAll(NAMED_REFERENCE)) if (!ALLOWED_NAMED.has(m[1] ?? "")) n += 1;
  return n + (s.match(LEGACY_REFUSED) ?? []).length;
}

/**
 * A line or a string as it is searched for IDs of this round: what a renderer would show as the ID is made the ID. Numeric character
 * references (`&#45;`, `&#x2D;`, also as a browser reads them: DECODED, C1_TABLE) and the five allowed named ones are decoded, Markdown
 * backslash escapes lose the backslash, the emphasis and code marks (`*`, `_`, backquote, `~`) and format characters (zero-width ones,
 * \p{Cf}) are removed, then NFKC, hyphen-like characters as "-", upper case. Removing characters can join two words into a string that looks
 * like an ID: that is refused (the safe side). HTML is removed before this, in two forms searched besides the text as written (htmlForms).
 */
function fold(s: string): string {
  return s
    .replace(DECODED, (_m, d: string | undefined, h: string | undefined, name: string | undefined) =>
      d !== undefined ? safeChar(Number(d)) : h !== undefined ? safeChar(parseInt(h, 16)) : (ALLOWED_NAMED.get(name ?? "") ?? ""),
    )
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/[*_`~]|\p{Cf}/gu, "")
    .normalize("NFKC")
    .replace(HYPHENS, "-")
    .toUpperCase();
}

/**
 * The raw HTML of `text` as CommonMark 0.31.2 §6.6 reads it, left to right: open and closing tags (OPEN_TAG, CLOSING_TAG), comments
 * (`<!-->`, `<!--->`, or to the first "-->", or "--!>" where a browser ends one), processing instructions (to "?>"), declarations (`<!` and
 * a letter, to ">") and CDATA (to "]]>"); a "<" that starts none of them is text. Linear: a closing string not found once is not looked for
 * again (it is not after any later point either).
 */
function rawHtml(text: string): Array<[number, number]> {
  const parts: Array<[number, number]> = [];
  const absent = new Set<string>();
  /** The index after the first `close` from `from`, or -1. */
  const after = (from: number, close: string): number => {
    const at = absent.has(close) ? -1 : text.indexOf(close, from);
    if (at < 0) absent.add(close);
    return at < 0 ? -1 : at + close.length;
  };
  const commentEnd = (from: number): number => {
    const [a, b] = [after(from, "-->"), after(from, "--!>")];
    return a < 0 ? b : b < 0 ? a : Math.min(a, b);
  };
  for (let at = text.indexOf("<"); at >= 0; ) {
    let end = -1;
    if (text.startsWith("<!--", at)) end = text.startsWith("<!-->", at) ? at + 5 : text.startsWith("<!--->", at) ? at + 6 : commentEnd(at + 4);
    else if (text.startsWith("<?", at)) end = after(at + 2, "?>");
    else if (text.startsWith("<![CDATA[", at)) end = after(at + 9, "]]>");
    else if (text.startsWith("<!", at) && /[A-Za-z]/.test(text.charAt(at + 2))) end = after(at + 3, ">");
    else {
      OPEN_TAG.lastIndex = at;
      CLOSING_TAG.lastIndex = at;
      const m = OPEN_TAG.exec(text) ?? CLOSING_TAG.exec(text);
      if (m !== null) end = at + m[0].length;
    }
    if (end > at) parts.push([at, end]);
    at = text.indexOf("<", end > at ? end : at + 1);
  }
  return parts;
}

/**
 * The lines with `parts` of their text (joined with "\n") removed. A removed part that spans lines joins its two ends on its first line,
 * and its line breaks are put after that line, so every other line keeps its number.
 */
function linesWithout(lines: readonly string[], parts: ReadonlyArray<readonly [number, number]>): string[] {
  const text = lines.join("\n");
  let out = "";
  let pending = 0;
  let last = 0;
  const copy = (segment: string): void => {
    const nl = segment.indexOf("\n");
    if (pending > 0 && nl >= 0) {
      out += `${segment.slice(0, nl + 1)}${"\n".repeat(pending)}${segment.slice(nl + 1)}`;
      pending = 0;
    } else out += segment;
  };
  for (const [from, to] of parts) {
    copy(text.slice(last, from));
    pending += text.slice(from, to).split("\n").length - 1;
    last = to;
  }
  copy(text.slice(last));
  return `${out}${"\n".repeat(pending)}`.split("\n");
}

/**
 * The two forms of the lines without HTML that are searched for IDs besides the lines as written (M2-2-RI-R1-001, the human decision 2):
 * the raw HTML as CommonMark reads it (rawHtml: a quoted ">" or a comment with ">" in it), and the local form (HTML_LOCAL: what a browser
 * drops but CommonMark does not read as HTML, and the tags after a "<" that put the first form out of step, e.g. one in a code span). HTML
 * is only removed, never refused (`Array<string>` is a valid review); removing too much can only find more IDs, as the text as written is
 * searched as well.
 */
function htmlForms(lines: readonly string[]): [string[], string[]] {
  const text = lines.join("\n");
  const local: Array<[number, number]> = [...text.matchAll(HTML_LOCAL)].map((m) => [m.index, m.index + m[0].length]);
  return [linesWithout(lines, rawHtml(text)), linesWithout(lines, local)];
}

/** The character a browser shows for a numeric reference (C1_TABLE for 128 to 159); 0 and what is past U+10FFFF are removed (the safe side). */
function safeChar(cp: number): string {
  if (!(cp > 0 && cp <= 0x10ffff)) return "";
  return String.fromCodePoint(cp >= 0x80 && cp <= 0x9f ? C1_TABLE[cp - 0x80] || cp : cp);
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

  // Character references (M2-2-RI-R1-001): a named one other than the five allowed, or a legacy one that folds into an ID character, anywhere
  // in the review — every line, the JSON block's included, and the JSON's strings after parsing — is refused (the line only, never the name).
  let blockEntities = 0;
  s.forEach((l, i) => {
    if (refusedReferences(l) === 0) return;
    if (inBlock(i)) blockEntities += 1;
    problems.push({ kind: "entity", message: `a character reference other than &amp; &lt; &gt; &quot; &apos; and the numeric ones (line ${i + 1}); write the character itself` });
  });
  if (input !== null && blockEntities === 0 && stringsOf(input).some((str) => refusedReferences(str) > 0)) {
    problems.push({ kind: "entity", message: "a character reference other than &amp; &lt; &gt; &quot; &apos; and the numeric ones in a string of the JSON (written with JSON escapes)" });
  }

  // Mentions: an ID of this round anywhere in the review — the body and the strings of the JSON block alike (case, width and hyphen forms
  // folded) — must be a finding of the JSON: an ID named only in a JSON string (a `content` that says "see P-R1-002") is a finding left out.
  // Each line and each string is searched as written and in the two forms without HTML (htmlForms: an ID split by HTML, or one inside a
  // comment, is found).
  const mention = new RegExp(`(?<![A-Z0-9-])${escapeRegExp(target.idPrefix.toUpperCase())}-R${target.round}-\\d+(?![0-9])`, "g");
  const known = new Set([...ids].map((x) => x.toUpperCase()));
  if (input !== null) {
    const [commonMark, local] = htmlForms(s);
    s.forEach((l, i) => {
      const found = new Set<string>();
      for (const form of [l, commonMark[i] ?? "", local[i] ?? ""]) for (const m of fold(form).matchAll(mention)) if (!known.has(m[0])) found.add(m[0]);
      for (const id of found) problems.push({ kind: "id-mention", message: `${id} (line ${i + 1}) is an ID of this round that is not a finding of the JSON` });
    });
    // The JSON's strings once more after parsing: an ID written with JSON escapes (a backslash-u escape for the hyphen) is not visible in the lines.
    const inJson = new Set<string>();
    for (const str of stringsOf(input)) {
      for (const form of [str, ...htmlForms([str]).map((f) => f.join("\n"))]) for (const m of fold(form).matchAll(mention)) if (!known.has(m[0])) inJson.add(m[0]);
    }
    for (const id of inJson) problems.push({ kind: "id-mention", message: `${id} is an ID of this round in a string of the JSON that is not a finding of the JSON` });
  }

  return problems.length === 0 && input !== null ? { ok: true, input } : { ok: false, problems };
}
