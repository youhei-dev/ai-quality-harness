/**
 * npm audit (ADR-0028): the text report of npm (npm-audit-report's detail reporter). Its summary has three forms: `found 0
 * vulnerabilities`, `<n> <severity> severity vulnerability|vulnerabilities` (one severity), `<n> vulnerabilities (<n> <severity>, ...)`
 * (several; their sum can be below the total, which also counts "info"). A package is named by its line `<name>  <range>` when the next
 * line is `Severity: <severity>`; npm prints no Severity line for "low", so low packages are counted, not named.
 */
import { countAndWord, countOf, ItemList, lastIndex, type Lines } from "./text.ts";
import { NO_SUMMARY, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
/** The count keys this parser writes, in their order (aiqh history reads only these, ADR-0034 E). */
export const NPM_AUDIT_COUNT_KEYS: readonly string[] = ["vulnerabilities", ...SEVERITIES];
type Severity = (typeof SEVERITIES)[number];

function isSeverity(word: string): word is Severity {
  return (SEVERITIES as readonly string[]).includes(word);
}

/** The counts of a summary line; null for a line of a summary form that does not fit; undefined for any other line. */
function summaryOf(line: string): Record<string, number> | null | undefined {
  const t = line.trim();
  const counts: Record<string, number> = { vulnerabilities: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  if (t.startsWith("found ") && t.endsWith(" vulnerabilities")) {
    const n = countOf(t.slice("found ".length, -" vulnerabilities".length));
    if (n === null) return null;
    counts.vulnerabilities = n;
    return counts;
  }
  for (const end of [" severity vulnerability", " severity vulnerabilities"]) {
    if (!t.endsWith(end)) continue;
    const cw = countAndWord(t.slice(0, -end.length));
    if (cw === null || !isSeverity(cw[1])) return null;
    counts.vulnerabilities = cw[0];
    counts[cw[1]] = cw[0];
    return counts;
  }
  const open = t.indexOf(" vulnerabilities (");
  if (open === -1 || !t.endsWith(")")) return undefined;
  const total = countOf(t.slice(0, open));
  if (total === null) return null;
  let sum = 0;
  const seen = new Set<string>();
  for (const part of t.slice(open + " vulnerabilities (".length, -1).split(", ")) {
    const cw = countAndWord(part);
    if (cw === null || !isSeverity(cw[1]) || seen.has(cw[1])) return null;
    seen.add(cw[1]);
    counts[cw[1]] = cw[0];
    sum += cw[0];
  }
  if (sum > total) return null;
  counts.vulnerabilities = total;
  return counts;
}

/** Runs of spaces as one space ("lodash  <=4.17.23" -> "lodash <=4.17.23"). */
function oneSpace(line: string): string {
  return line
    .split(" ")
    .filter((w) => w.length > 0)
    .join(" ");
}

function packageNames(lines: Lines, end: number, items: ItemList, tick: () => void): void {
  for (let i = 0; i + 1 < end; i += 1) {
    tick();
    const line = lines[i];
    const next = lines[i + 1];
    if (line === null || line === undefined || next === null || next === undefined) continue;
    if (line.startsWith(" ") || line.trim() === "" || !next.startsWith("Severity: ")) continue;
    const severity = next.slice("Severity: ".length).trim();
    items.add(isSeverity(severity) ? severity : "unknown", oneSpace(line));
  }
}

export const NPM_AUDIT_PARSER: ToolParser = {
  tool: "npm-audit",
  parse(input, budget): ParserAnswer {
    const out = input.stdout;
    const at = lastIndex(out, budget, (line) => summaryOf(line) !== undefined);
    const counts = at === -1 ? undefined : summaryOf(out[at] ?? "");
    if (counts === undefined) return NO_SUMMARY;
    if (counts === null) return UNEXPECTED_SUMMARY;
    const items = new ItemList();
    packageNames(out, at, items, () => budget.tick());
    return { status: "parsed", counts, items: items.items, itemsOmitted: items.omitted };
  },
};
