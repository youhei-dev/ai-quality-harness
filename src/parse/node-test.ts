/**
 * node:test (ADR-0028 decision 14, v0.18.0; the batch3 design, final, §3): the summary block that Node's spec reporter (the default of Node v24,
 * also when stdout is not a terminal) and its TAP reporter print at the end of a run — 8 lines in this order: tests, suites, pass, fail,
 * cancelled, skipped, todo, duration_ms. Spec writes each as `<U+2139> <word> <value>`, TAP as `# <word> <value>`.
 * - Read only when stdout was not cut (B3-D-R1-001): the whole output is then in view, so the run's own block is there, and a block a
 *   test printed makes two blocks. A cut stdout is never read ("output-truncated"): the block in view could be the one a test printed.
 * - Two steps (B3-D-R1-002): first the shape of the 8 lines (the mark, the words in order, a value of digits and dots), then the values
 *   (counts of 1 to 15 digits, duration_ms `<digits>[.<digits>]`), tests = pass + fail + cancelled + skipped + todo, and the exit code
 *   (1 when fail + cancelled > 0, else 0). No block: no-summary. Two or more blocks, or one that fails the second step: unexpected-summary.
 * - Names: the spec reporter's "failing tests" list after the block (`test at <location>` and then the marked name); TAP's are not read.
 * - Where the counts stop: a stdout longer than the window (PARSE_INPUT_MAX UTF-16 units) or cut by the runner is not read (§3.13).
 * Where the block came from cannot be verified: when a run ends before its own summary (it was killed, or a test ended the process) after
 * a test printed one block, that block is read if its values and the exit code agree (a known limit of decision 14).
 */
import { countOf, ItemList, type Budget, type Lines } from "./text.ts";
import { NO_SUMMARY, OUTPUT_TRUNCATED, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

/** The count keys this parser writes, in their order (aiqh history reads only these, ADR-0034 E). */
export const NODE_TEST_COUNT_KEYS: readonly string[] = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];
const WORDS: readonly string[] = [...NODE_TEST_COUNT_KEYS, "duration_ms"];
/** The spec reporter's mark of a summary or diagnostic line (U+2139) and of a failed test (U+2716). */
const INFO = String.fromCodePoint(0x2139);
const CROSS = String.fromCodePoint(0x2716);
const MARKS: readonly string[] = [`${INFO} `, "# "];
const FAILING = `${CROSS} failing tests:`;

/** One or more of `0-9` and `.` (the shape of a value; its meaning is checked in the second step). */
function isValueShape(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if ((c < 48 || c > 57) && c !== 46) return false;
  }
  return true;
}

function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** `<digits>` or `<digits>.<digits>`, any length (duration_ms). */
function isDuration(s: string): boolean {
  const dot = s.indexOf(".");
  return dot === -1 ? isDigits(s) : isDigits(s.slice(0, dot)) && isDigits(s.slice(dot + 1));
}

/** The value after `<mark><word> ` when the line has that shape, else null. */
function shapeValue(line: string | null | undefined, mark: string, word: string): string | null {
  if (line === null || line === undefined) return null;
  const head = `${mark}${word} `;
  if (!line.startsWith(head)) return null;
  const value = line.slice(head.length);
  return isValueShape(value) ? value : null;
}

/** First step: the 8 values of a block in the shape that ends at `end` (its duration_ms line), or null. */
function shapeAt(out: Lines, end: number, mark: string): string[] | null {
  if (end < WORDS.length - 1) return null;
  const values: string[] = [];
  for (let k = 0; k < WORDS.length; k += 1) {
    const v = shapeValue(out[end - (WORDS.length - 1) + k], mark, WORDS[k] ?? "");
    if (v === null) return null;
    values.push(v);
  }
  return values;
}

/** Second step: the counts when the values mean a run (1-15 digits, a duration, the sum, the exit code), else null. */
function countsOf(values: readonly string[], exitCode: number | null): number[] | null {
  const counts: number[] = [];
  for (let k = 0; k < NODE_TEST_COUNT_KEYS.length; k += 1) {
    const n = countOf(values[k] ?? "");
    if (n === null) return null;
    counts.push(n);
  }
  if (!isDuration(values[WORDS.length - 1] ?? "")) return null;
  const [tests, , pass, fail, cancelled, skipped, todo] = counts as [number, number, number, number, number, number, number];
  if (tests !== pass + fail + cancelled + skipped + todo) return null;
  if (exitCode !== (fail + cancelled > 0 ? 1 : 0)) return null;
  return counts;
}

/** The names of the spec reporter's failing list after the block: `test at <location>` followed by `<U+2716> <name> (<time>)`. */
function failingNames(out: Lines, from: number, budget: Budget, items: ItemList): void {
  let i = from;
  for (; i < out.length; i += 1) {
    budget.tick();
    if (out[i] === FAILING) break;
  }
  let location: string | null = null;
  for (i += 1; i < out.length; i += 1) {
    budget.tick();
    const line = out[i];
    if (line === null || line === undefined) {
      location = null;
      continue;
    }
    if (line.startsWith("test at ")) {
      location = line.slice("test at ".length);
      continue;
    }
    if (location !== null && line.startsWith(`${CROSS} `)) {
      let name = line.slice(2);
      const directive = name.lastIndexOf(" # ");
      if (directive !== -1 && name.slice(directive + 3).startsWith("TODO")) {
        location = null;
        continue;
      }
      const time = name.lastIndexOf(" (");
      if (time !== -1 && name.endsWith(")")) name = name.slice(0, time);
      items.add("failed-test", `${location} ${name}`);
    }
    location = null;
  }
}

export const NODE_TEST_PARSER: ToolParser = {
  tool: "node-test",
  parse(input, budget): ParserAnswer {
    if (input.stdoutTruncated) return OUTPUT_TRUNCATED;
    const out = input.stdout;
    let found: { end: number; mark: string; values: string[] } | null = null;
    let blocks = 0;
    for (let i = 0; i < out.length; i += 1) {
      budget.tick();
      for (const mark of MARKS) {
        const values = shapeAt(out, i, mark);
        if (values === null) continue;
        blocks += 1;
        found = { end: i, mark, values };
      }
    }
    if (found === null) return NO_SUMMARY;
    if (blocks > 1) return UNEXPECTED_SUMMARY;
    const counts = countsOf(found.values, input.exitCode);
    if (counts === null) return UNEXPECTED_SUMMARY;
    const result: Record<string, number> = {};
    NODE_TEST_COUNT_KEYS.forEach((key, k) => {
      result[key] = counts[k] ?? 0;
    });
    const items = new ItemList();
    if (found.mark !== "# ") failingNames(out, found.end + 1, budget, items);
    return { status: "parsed", counts: result, items: items.items, itemsOmitted: items.omitted };
  },
};
