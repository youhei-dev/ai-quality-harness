/**
 * aiqh security-scan (ADR-0028, Q2): the text that `aiqh security-scan` prints (src/commands/security-scan.ts renderText). It is aiqh's
 * own format, so the header line `aiqh security-scan — <root>` is required, the findings line must add up, and the last line must
 * agree with it. The entries — findings by kind, what `security.allow` suppressed, and the allow rules used, expired and unused — are
 * named as printed, after their marker. Reading them changes nothing: an oversized candidate is still a finding (exit 1 of the scan).
 */
import { countOf, ItemList, type Lines } from "./text.ts";
import { NO_SUMMARY, UNEXPECTED_SUMMARY, type ParserAnswer, type ToolParser } from "./tool.ts";

const HEADER = "aiqh security-scan — ";
const FINDINGS = "findings: ";
const SUPPRESSED = "suppressed by security.allow: ";
const NO_FINDINGS = "SECURITY SCAN: no findings";
const FINDINGS_PRESENT = "SECURITY SCAN: findings present (see above)";
/** The kinds of the findings line, in its order, and their count keys (v0.13.0 added raw characters, ADR-0036: the five kinds of an older aiqh are an unexpected summary). */
const KINDS: ReadonlyArray<readonly [string, string]> = [
  ["secret-shaped", "secretShaped"],
  ["oversized candidates", "oversizedCandidates"],
  ["tracked .env", "trackedEnv"],
  ["untracked .env not ignored", "untrackedEnv"],
  [".gitignore", "gitignore"],
  ["raw characters", "rawChars"],
];
/** The count keys this parser writes, in their order (aiqh history reads only these, ADR-0034 E). */
export const SECURITY_SCAN_COUNT_KEYS: readonly string[] = ["findings", ...KINDS.map(([, key]) => key), "suppressed", "allowRulesUsed", "expiredAllowRules", "unusedAllowRules"];
/** The entry lines: their marker (after the two spaces of the indent) and the item kind. */
const ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ["[secret] ", "secret"],
  ["[oversized-candidate] ", "oversized-candidate"],
  ["[tracked-env] ", "tracked-env"],
  ["[untracked-env] ", "untracked-env"],
  ["[gitignore] ", "gitignore"],
  ["[raw-char] ", "raw-char"],
  ["[allowed] ", "allowed"],
  ["rule used ", "allow-rule-used"],
  ["warning: expired allow rule ", "expired-allow-rule"],
  ["warning: unused allow rule ", "unused-allow-rule"],
];

function findingsOf(line: string): Record<string, number> | null {
  const t = line.slice(FINDINGS.length);
  const open = t.indexOf(" (");
  if (open === -1 || !t.endsWith(")")) return null;
  const total = countOf(t.slice(0, open));
  const parts = t.slice(open + 2, -1).split(", ");
  if (total === null || parts.length !== KINDS.length) return null;
  const counts: Record<string, number> = { findings: total };
  let sum = 0;
  for (const [i, [label, key]] of KINDS.entries()) {
    const part = parts[i] ?? "";
    if (!part.startsWith(`${label}: `)) return null;
    const n = countOf(part.slice(label.length + 2));
    if (n === null) return null;
    counts[key] = n;
    sum += n;
  }
  return sum === total ? counts : null;
}

function lastNonBlank(lines: Lines): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line === null || line === undefined) return null;
    if (line.trim() !== "") return line.trim();
  }
  return null;
}

export const SECURITY_SCAN_PARSER: ToolParser = {
  tool: "aiqh-security-scan",
  parse(input, budget): ParserAnswer {
    const out = input.stdout;
    let header = false;
    let findings: Record<string, number> | null | undefined;
    let suppressed = 0;
    let used = 0;
    let expired = 0;
    let unused = 0;
    const items = new ItemList();
    for (const line of out) {
      budget.tick();
      if (line === null) continue;
      if (line.startsWith(HEADER)) {
        header = true;
        continue;
      }
      if (!header) continue;
      if (line.startsWith(FINDINGS)) {
        findings = findingsOf(line);
        continue;
      }
      if (line.startsWith(SUPPRESSED)) {
        const n = countOf(line.slice(SUPPRESSED.length));
        if (n === null) return UNEXPECTED_SUMMARY;
        suppressed = n;
        continue;
      }
      if (!line.startsWith("  ")) continue;
      const t = line.slice(2);
      const entry = ENTRIES.find(([marker]) => t.startsWith(marker));
      if (entry === undefined) continue;
      const [marker, kind] = entry;
      if (kind === "allow-rule-used") used += 1;
      if (kind === "expired-allow-rule") expired += 1;
      if (kind === "unused-allow-rule") unused += 1;
      items.add(kind, t.slice(marker.length));
    }
    const last = lastNonBlank(out);
    if (!header || findings === undefined || (last !== NO_FINDINGS && last !== FINDINGS_PRESENT)) return NO_SUMMARY;
    if (findings === null || (last === NO_FINDINGS) !== (findings.findings === 0)) return UNEXPECTED_SUMMARY;
    return {
      status: "parsed",
      counts: { ...findings, suppressed, allowRulesUsed: used, expiredAllowRules: expired, unusedAllowRules: unused },
      items: items.items,
      itemsOmitted: items.omitted,
    };
  },
};
