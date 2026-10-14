/**
 * The `parsed` field as text (ADR-0028): one summary per tool, from the counts only, for the terminal and latest.md. The callers send it
 * through their output boundary (the terminal: createOutput; latest.md: the cell / one-line notation and the masked report).
 */
import type { ParsedOutput } from "../types.ts";

/** Names shown under a check in the terminal; the report has up to PARSED_ITEMS_MAX. */
export const CONSOLE_ITEMS_MAX = 10;

const VITEST_WORDS: ReadonlyArray<readonly [string, string]> = [
  ["Failed", "failed"],
  ["Passed", "passed"],
  ["ExpectedFail", "expected fail"],
  ["Skipped", "skipped"],
  ["Todo", "todo"],
];

const n = (counts: Record<string, number>, key: string): number => counts[key] ?? 0;
const plural = (count: number, word: string, many = `${word}s`): string => `${count} ${count === 1 ? word : many}`;

function vitestState(counts: Record<string, number>, prefix: string): string {
  const words = VITEST_WORDS.filter(([suffix]) => n(counts, `${prefix}${suffix}`) > 0).map(([suffix, word]) => `${n(counts, `${prefix}${suffix}`)} ${word}`);
  return `${words.length > 0 ? words.join(" | ") : "0"} (${n(counts, prefix)})`;
}

/** The counts of a parsed output in the words of its tool. */
export function summaryText(p: ParsedOutput): string {
  const c = p.counts;
  switch (p.tool) {
    case "vitest":
      return `test files ${vitestState(c, "testFiles")}; tests ${vitestState(c, "tests")}${n(c, "errors") > 0 ? `; errors ${n(c, "errors")}` : ""}`;
    case "eslint":
      return `${plural(n(c, "problems"), "problem")} (${plural(n(c, "errors"), "error")}, ${plural(n(c, "warnings"), "warning")})`;
    case "npm-audit": {
      const severities = ["low", "moderate", "high", "critical"].filter((s) => n(c, s) > 0).map((s) => `${n(c, s)} ${s}`);
      return `${plural(n(c, "vulnerabilities"), "vulnerability", "vulnerabilities")}${severities.length > 0 ? ` (${severities.join(", ")})` : ""}`;
    }
    case "aiqh-security-scan":
      return (
        `findings ${n(c, "findings")} (secret-shaped ${n(c, "secretShaped")}, oversized candidates ${n(c, "oversizedCandidates")}, tracked .env ${n(c, "trackedEnv")}, ` +
        `untracked .env not ignored ${n(c, "untrackedEnv")}, .gitignore ${n(c, "gitignore")}); suppressed by security.allow ${n(c, "suppressed")}; ` +
        `allow rules used ${n(c, "allowRulesUsed")}, expired ${n(c, "expiredAllowRules")}, unused ${n(c, "unusedAllowRules")}`
      );
    default:
      return "-";
  }
}

/** The status as one cell: `parsed`, `parsed (truncated)`, `unparsed (<reason>)`, `not-applicable (<reason>)`. */
export function statusText(p: ParsedOutput): string {
  if (p.status === "parsed") return p.truncated ? "parsed (truncated)" : "parsed";
  return `${p.status} (${p.reason ?? "-"})`;
}

/** Lines under a check in the terminal (without their indent): none when no parser applies. */
export function consoleLines(p: ParsedOutput | undefined): string[] {
  if (p === undefined || p.status === "not-applicable") return [];
  if (p.status === "unparsed") return [`parsed: ${p.tool ?? "output"} — not read (${p.reason ?? "-"})`];
  const lines = [`parsed: ${p.tool ?? "output"} — ${summaryText(p)}${p.truncated ? " (output truncated: read from its end)" : ""}`];
  for (const item of p.items.slice(0, CONSOLE_ITEMS_MAX)) lines.push(`  ${item.kind}: ${item.name}`);
  const more = Math.max(0, p.items.length - CONSOLE_ITEMS_MAX) + p.itemsOmitted;
  if (more > 0) lines.push(`  … ${more} more`);
  return lines;
}
