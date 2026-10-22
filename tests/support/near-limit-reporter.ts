/**
 * B1-Q25 (v0.13.2, ROADMAP item 41; time budgets in docs/ops/ci-and-branch-protection.md 8-1): a vitest reporter that records,
 * at the end of the whole run, the tests that took more than half of their time limit — on stderr, at most MAX_LINES lines with
 * the largest share first, then one summary line that is always the last line. The verdict does not change.
 *
 * verify does not print a PASS check's output, but the check's stderrTail in latest.json keeps the end of it (the last 200 lines
 * and 64 KiB): the list is capped and each line is cut to MAX_LINE_BYTES, so the record can never push its own summary line out.
 * The limit is the test's own timeout as vitest resolved it (the number argument, the describe options or testTimeout of the
 * config; checked with vitest 5.0.0 before v0.13.2: it is the value of the test's timer). The time is vitest's duration of the
 * test, which includes its beforeEach / afterEach hooks, so the share is an upper bound for the test body. A finished test
 * without a usable limit is counted in the summary as unknown-limit, never dropped silently; a skipped test has no duration.
 */
import type { Reporter, TestCase } from "vitest/node";

export interface Timing {
  file: string;
  name: string;
  durationMs: number;
  timeoutMs: number | undefined;
}

export const MAX_LINES = 20;
export const MAX_LINE_BYTES = 300;
const PREFIX = "aiqh-test-slow:";
const ELLIPSIS = "…";

/** `line` cut to at most `max` bytes of UTF-8, never inside a character; a cut line ends with the ellipsis. */
export function cutToBytes(line: string, max: number): string {
  if (Buffer.byteLength(line, "utf8") <= max) return line;
  const budget = max - Buffer.byteLength(ELLIPSIS, "utf8");
  let out = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > budget) break;
    out += ch;
    bytes += n;
  }
  return `${out}${ELLIPSIS}`;
}

const seconds = (ms: number): string => (Number.isInteger(ms / 1000) ? String(ms / 1000) : (ms / 1000).toFixed(1));

/** The lines to print for these timings: the tests over half of their limit (largest share first, at most MAX_LINES), then the summary. */
export function nearLimitLines(timings: readonly Timing[]): string[] {
  const withLimit = timings.filter((t): t is Timing & { timeoutMs: number } => t.timeoutMs !== undefined && Number.isFinite(t.timeoutMs) && t.timeoutMs > 0);
  const over = withLimit
    .filter((t) => t.durationMs > t.timeoutMs / 2)
    .map((t) => ({ ...t, share: t.durationMs / t.timeoutMs }))
    .sort((a, b) => b.share - a.share || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  const shown = over.slice(0, MAX_LINES);
  const lines = shown.map((t) => cutToBytes(`${PREFIX} ${t.file} > ${t.name} ${(t.durationMs / 1000).toFixed(1)} s of ${seconds(t.timeoutMs)} s (${Math.round(t.share * 100)}%)`, MAX_LINE_BYTES));
  lines.push(`${PREFIX} summary over-half ${over.length} shown ${shown.length} omitted ${over.length - shown.length} unknown-limit ${timings.length - withLimit.length} of ${timings.length} tests`);
  return lines;
}

export default class NearLimitReporter implements Reporter {
  private readonly timings: Timing[] = [];

  onTestCaseResult(testCase: TestCase): void {
    const diagnostic = testCase.diagnostic();
    if (diagnostic === undefined) return;
    this.timings.push({ file: testCase.module.relativeModuleId, name: testCase.fullName, durationMs: diagnostic.duration, timeoutMs: testCase.options.timeout });
  }

  onTestRunEnd(): void {
    process.stderr.write(`${nearLimitLines(this.timings).join("\n")}\n`);
    this.timings.length = 0;
  }
}
