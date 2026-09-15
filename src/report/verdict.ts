import {
  CATEGORY_KINDS,
  EXIT_FAILED,
  EXIT_PASSED,
  type CategoryKind,
  type CategoryStatus,
  type CheckResult,
  type ReportSummary,
  type Verdict,
} from "../types.ts";

export interface VerdictResult {
  verdict: Verdict;
  exitCode: number;
  summary: ReportSummary;
  categories: Record<CategoryKind, CategoryStatus>;
}

/**
 * Fail closed: PASSED only when at least one required check exists and every
 * required check has status PASS. SKIPPED is never treated as PASS.
 */
export function computeVerdict(results: readonly CheckResult[]): VerdictResult {
  const required = results.filter((r) => r.required);
  const requiredFailed = required.filter((r) => r.status !== "PASS").length;
  const passed = required.length > 0 && requiredFailed === 0;

  const summary: ReportSummary = {
    total: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    skipped: results.filter((r) => r.status === "SKIPPED").length,
    requiredFailed,
  };

  return {
    verdict: passed ? "PASSED" : "FAILED",
    exitCode: passed ? EXIT_PASSED : EXIT_FAILED,
    summary,
    categories: computeCategories(results),
  };
}

export function computeCategories(
  results: readonly CheckResult[],
): Record<CategoryKind, CategoryStatus> {
  const out = {} as Record<CategoryKind, CategoryStatus>;
  for (const kind of CATEGORY_KINDS) {
    const ofKind = results.filter((r) => r.kind === kind);
    if (ofKind.length === 0) {
      out[kind] = "NOT_APPLICABLE";
    } else if (ofKind.some((r) => r.status === "FAIL")) {
      out[kind] = "FAIL";
    } else if (ofKind.some((r) => r.status === "SKIPPED")) {
      out[kind] = "SKIPPED";
    } else {
      out[kind] = "PASS";
    }
  }
  return out;
}
