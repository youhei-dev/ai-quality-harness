/**
 * pytest (ADR-0028 decision 12, v0.14.0; the batch1 design, final, §3.5): the last summary-shaped line of stdout, with or without the
 * rows of `=` around it — `<n> <word>, <n> <word> in <s>s`, optionally ` (h:mm:ss)`, the old ` seconds`, or `no tests ran in …` — and
 * the FAILED / ERROR lines between the last `short test summary info` heading before it and the summary. Only pytest's 8 words
 * (warning / error in both numbers); an unknown word, a word twice or a count of more than 15 digits makes the summary unexpected,
 * so the output of another tool (or of a plugin that adds words) is not shown as pytest's counts.
 */
import { countOf, ItemList, lastIndex, type Budget, type Lines } from "./text.ts";
import { NO_SUMMARY, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

/** The count keys this parser writes, in their order (aiqh history reads only these, ADR-0034 E). */
export const PYTEST_COUNT_KEYS: readonly string[] = ["passed", "failed", "skipped", "deselected", "xfailed", "xpassed", "errors", "warnings"];
/** pytest's words and their count keys. */
const WORDS: ReadonlyMap<string, string> = new Map([
  ["passed", "passed"],
  ["failed", "failed"],
  ["skipped", "skipped"],
  ["deselected", "deselected"],
  ["xfailed", "xfailed"],
  ["xpassed", "xpassed"],
  ["error", "errors"],
  ["errors", "errors"],
  ["warning", "warnings"],
  ["warnings", "warnings"],
]);
const HEADING = "short test summary info";
const NO_TESTS = "no tests ran";

/** The text between the rows of `=` (`=== text ===`), the line itself without them, or null when `=` stands on one side only. */
function inner(line: string): string | null {
  const t = line.trim();
  let start = 0;
  let end = t.length;
  while (start < end && t[start] === "=") start += 1;
  while (end > start && t[end - 1] === "=") end -= 1;
  if ((start > 0) !== (end < t.length)) return null;
  return t.slice(start, end).trim();
}

function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function isLetters(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i) | 0x20;
    if (c < 97 || c > 122) return false;
  }
  return true;
}

/** `<digits>` or `<digits>.<digits>`. */
function isNumber(s: string): boolean {
  const dot = s.indexOf(".");
  return dot === -1 ? isDigits(s) : isDigits(s.slice(0, dot)) && isDigits(s.slice(dot + 1));
}

/** The time after ` in `: `<number>s` or `<number> seconds`, optionally followed by ` (<h>:<mm>:<ss>)`. */
function isTime(text: string): boolean {
  let t = text;
  const open = t.indexOf(" (");
  if (open !== -1) {
    const clock = t.slice(open + 2);
    if (!clock.endsWith(")")) return false;
    const parts = clock.slice(0, -1).split(":");
    if (parts.length !== 3 || !isDigits(parts[0] ?? "") || parts[1]?.length !== 2 || !isDigits(parts[1]) || parts[2]?.length !== 2 || !isDigits(parts[2])) return false;
    t = t.slice(0, open);
  }
  if (t.endsWith(" seconds")) return isNumber(t.slice(0, -" seconds".length));
  return t.endsWith("s") && isNumber(t.slice(0, -1));
}

/** The `<n> <word>` parts of a summary-shaped text (or [] for `no tests ran`), or null when the text is not summary-shaped. */
function summaryParts(line: string): Array<[string, string]> | null {
  const text = inner(line);
  if (text === null) return null;
  const at = text.lastIndexOf(" in ");
  if (at === -1 || !isTime(text.slice(at + 4))) return null;
  const head = text.slice(0, at);
  if (head === NO_TESTS) return [];
  const parts: Array<[string, string]> = [];
  for (const part of head.split(", ")) {
    const sp = part.indexOf(" ");
    if (sp === -1) return null;
    const count = part.slice(0, sp);
    const word = part.slice(sp + 1);
    if (!isDigits(count) || !isLetters(word)) return null;
    parts.push([count, word]);
  }
  return parts;
}

/** The names between the last heading before `summaryAt` and the summary: `FAILED <name> - <msg>` and `ERROR <name> - <msg>`. */
function names(out: Lines, summaryAt: number, budget: Budget, items: ItemList): void {
  let heading = -1;
  for (let i = summaryAt - 1; i >= 0; i -= 1) {
    budget.tick();
    const line = out[i];
    if (line !== null && line !== undefined && inner(line) === HEADING) {
      heading = i;
      break;
    }
  }
  if (heading === -1) return;
  for (let i = heading + 1; i < summaryAt; i += 1) {
    budget.tick();
    const line = out[i];
    if (line === null || line === undefined) continue;
    const kind = line.startsWith("FAILED ") ? "failed-test" : line.startsWith("ERROR ") ? "error" : null;
    if (kind === null) continue;
    const rest = line.slice(kind === "error" ? 6 : 7);
    const dash = rest.indexOf(" - ");
    items.add(kind, dash === -1 ? rest : rest.slice(0, dash));
  }
}

export const PYTEST_PARSER: ToolParser = {
  tool: "pytest",
  parse(input, budget): ParserAnswer {
    const out = input.stdout;
    const at = lastIndex(out, budget, (line) => summaryParts(line) !== null);
    if (at === -1) return NO_SUMMARY;
    const parts = summaryParts(out[at] ?? "") ?? [];
    const counts: Record<string, number> = {};
    for (const key of PYTEST_COUNT_KEYS) counts[key] = 0;
    const seen = new Set<string>();
    for (const [count, word] of parts) {
      const key = WORDS.get(word);
      const n = countOf(count);
      if (key === undefined || seen.has(key) || n === null) return UNEXPECTED_SUMMARY;
      seen.add(key);
      counts[key] = n;
    }
    const items = new ItemList();
    names(out, at, budget, items);
    return { status: "parsed", counts, items: items.items, itemsOmitted: items.omitted };
  },
};
