/**
 * vitest (ADR-0028): the summary lines that every reporter of vitest 5 prints to stdout (default, agent, github-actions), and the names in
 * the "Failed Tests" / "Failed Suites" sections. The words of a state are vitest's own (getStateString: failed, passed, expected fail,
 * skipped, todo, or "no tests"); an unknown word, a word twice, or words that add up to more than the total make the summary unexpected,
 * so the output of another tool is not shown as vitest's counts.
 */
import { countAndWord, countOf, ItemList, lastIndex, type Budget, type Lines } from "./text.ts";
import { afterLabel, NO_SUMMARY, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

/** vitest's words and the suffix of their count keys, in vitest's order. */
const WORDS: ReadonlyArray<readonly [string, string]> = [
  ["failed", "Failed"],
  ["passed", "Passed"],
  ["expected fail", "ExpectedFail"],
  ["skipped", "Skipped"],
  ["todo", "Todo"],
];
/** Lines after "Tests" in which an "Errors" line is looked for (Type Errors, Errors, Leaks come before "Start at"). */
const ERRORS_WINDOW = 6;
/** The section divider character of vitest (U+23AF). */
const DIVIDER = "⎯";

interface State {
  total: number;
  words: Map<string, number>;
}

/** `<n> <word> | <n> <word> (<total>)` or `no tests`; null when anything does not fit. */
function stateOf(text: string): State | null {
  if (text === "no tests") return { total: 0, words: new Map() };
  const open = text.lastIndexOf(" (");
  if (open === -1 || !text.endsWith(")")) return null;
  const total = countOf(text.slice(open + 2, -1));
  if (total === null) return null;
  const words = new Map<string, number>();
  let sum = 0;
  for (const part of text.slice(0, open).split(" | ")) {
    const cw = countAndWord(part);
    if (cw === null || !WORDS.some(([w]) => w === cw[1]) || words.has(cw[1])) return null;
    words.set(cw[1], cw[0]);
    sum += cw[0];
  }
  return sum <= total ? { total, words } : null;
}

function addState(counts: Record<string, number>, prefix: string, state: State): void {
  counts[prefix] = state.total;
  for (const [word, suffix] of WORDS) counts[`${prefix}${suffix}`] = state.words.get(word) ?? 0;
}

/** A divider line with a title ("Failed Tests 2"): the title; a divider without letters ("[1/3]"): ""; any other line: null. */
function dividerTitle(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith(DIVIDER)) return null;
  let start = 0;
  let end = t.length;
  while (start < end && t[start] === DIVIDER) start += 1;
  while (end > start && t[end - 1] === DIVIDER) end -= 1;
  const title = t.slice(start, end).trim();
  return /[A-Za-z]/.test(title) ? title : "";
}

function failedNames(streams: readonly Lines[], budget: Budget, items: ItemList): void {
  for (const lines of streams) {
    let section: string | null = null;
    for (const line of lines) {
      budget.tick();
      if (line === null) continue;
      const title = dividerTitle(line);
      if (title !== null) {
        if (title !== "") section = title.startsWith("Failed Tests ") ? "failed-test" : title.startsWith("Failed Suites ") ? "failed-suite" : null;
        continue;
      }
      const t = line.trimStart();
      if (section !== null && t.startsWith("FAIL ")) items.add(section, t.slice(4));
    }
  }
}

export const VITEST_PARSER: ToolParser = {
  tool: "vitest",
  parse(input, budget): ParserAnswer {
    const out = input.stdout;
    const at = lastIndex(out, budget, (line) => afterLabel(line, "Test Files") !== null);
    if (at === -1) return NO_SUMMARY;
    const files = stateOf(afterLabel(out[at] ?? "", "Test Files") ?? "");
    const next = out[at + 1];
    const testsText = next === null || next === undefined ? null : afterLabel(next, "Tests");
    const tests = testsText === null ? null : stateOf(testsText);
    if (files === null || tests === null) return UNEXPECTED_SUMMARY;
    let errors = 0;
    for (let i = at + 2; i < Math.min(out.length, at + 2 + ERRORS_WINDOW); i += 1) {
      const line = out[i];
      if (line === null || line === undefined || line.trim() === "") break;
      const text = afterLabel(line, "Errors");
      if (text === null) continue;
      const cw = countAndWord(text);
      if (cw === null || (cw[1] !== "error" && cw[1] !== "errors")) return UNEXPECTED_SUMMARY;
      errors = cw[0];
    }
    const counts: Record<string, number> = {};
    addState(counts, "testFiles", files);
    addState(counts, "tests", tests);
    counts.errors = errors;
    const items = new ItemList();
    failedNames([input.stderr, input.stdout], budget, items);
    return { status: "parsed", counts, items: items.items, itemsOmitted: items.omitted };
  },
};
