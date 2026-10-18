/**
 * eslint (ADR-0028): the stylish formatter (eslint's default). Its last line is `✖ N problems (E errors, W warnings)` (singular forms
 * for 1); without any problem eslint prints nothing at all, so an output with nothing but npm's header and blank lines is 0 problems,
 * but only with exit 0 (anything else, or another formatter's output, is no-summary). The errors are named `<file>:<line>:<column>
 * <rule>`; warnings are counted, not named.
 */
import { countAndWord, isNpmHeaderOrBlank, ItemList, lastIndex, type Lines } from "./text.ts";
import { NO_SUMMARY, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

const SUMMARY = "✖ ";

/** `<n> <singular>` or `<n> <singular>s`, the count when the word fits; null otherwise. */
function countNamed(text: string | undefined, singular: string): number | null {
  if (text === undefined) return null;
  const cw = countAndWord(text);
  return cw !== null && (cw[1] === singular || cw[1] === `${singular}s`) ? cw[0] : null;
}

function summaryOf(line: string): Record<string, number> | null {
  const t = line.trim().slice(SUMMARY.length);
  const open = t.indexOf(" (");
  if (open === -1 || !t.endsWith(")")) return null;
  const problems = countNamed(t.slice(0, open), "problem");
  const parts = t.slice(open + 2, -1).split(", ");
  const errors = countNamed(parts[0], "error");
  const warnings = countNamed(parts[1], "warning");
  if (parts.length !== 2 || problems === null || errors === null || warnings === null || errors + warnings !== problems) return null;
  return { problems, errors, warnings };
}

/** `  <line>:<column>  error|warning  <message>  <rule>`: the location and the rule of an error line, or null. */
function errorAt(line: string): { at: string; rule: string | null } | null {
  if (!line.startsWith("  ")) return null;
  const t = line.trimStart();
  const sp = t.indexOf(" ");
  if (sp === -1) return null;
  const at = t.slice(0, sp);
  const colon = at.indexOf(":");
  if (colon <= 0 || !/^[0-9]+$/.test(at.slice(0, colon)) || !/^[0-9]+$/.test(at.slice(colon + 1))) return null;
  const rest = t.slice(sp).trimStart();
  if (!rest.startsWith("error ")) return null;
  const message = rest.slice("error".length).trim();
  const gap = message.lastIndexOf("  ");
  const rule = gap === -1 ? null : message.slice(gap).trim();
  return { at, rule: rule === null || rule === "" || rule.includes(" ") ? null : rule };
}

function errorNames(lines: Lines, end: number, items: ItemList, tick: () => void): void {
  let file: string | null = null;
  for (let i = 0; i < end; i += 1) {
    tick();
    const line = lines[i];
    if (line === null || line === undefined) continue;
    if (line.trim() === "") {
      file = null;
      continue;
    }
    if (!line.startsWith(" ")) {
      file = isNpmHeaderOrBlank(line) ? null : line.trim();
      continue;
    }
    const e = errorAt(line);
    if (e !== null && file !== null) items.add("error", `${file}:${e.at} ${e.rule ?? "(no rule)"}`);
  }
}

/** The count keys this parser writes, in their order (aiqh history reads only these, ADR-0034 E). */
export const ESLINT_COUNT_KEYS: readonly string[] = ["problems", "errors", "warnings"];

export const ESLINT_PARSER: ToolParser = {
  tool: "eslint",
  parse(input, budget): ParserAnswer {
    const out = input.stdout;
    const at = lastIndex(out, budget, (line) => line.trim().startsWith(SUMMARY));
    if (at === -1) {
      for (const line of out) {
        budget.tick();
        if (line === null || !isNpmHeaderOrBlank(line)) return NO_SUMMARY;
      }
      return input.exitCode === 0 ? { status: "parsed", counts: { problems: 0, errors: 0, warnings: 0 }, items: [], itemsOmitted: 0 } : NO_SUMMARY;
    }
    const counts = summaryOf(out[at] ?? "");
    if (counts === null) return UNEXPECTED_SUMMARY;
    const items = new ItemList();
    errorNames(out, at, items, () => budget.tick());
    return { status: "parsed", counts, items: items.items, itemsOmitted: items.omitted };
  },
};
