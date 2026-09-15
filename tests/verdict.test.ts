import { describe, expect, it } from "vitest";
import { computeCategories, computeVerdict } from "../src/report/verdict.ts";
import { checkResult } from "./helpers.ts";

describe("computeVerdict (fail closed)", () => {
  it("PASSED only when every required check passes", () => {
    const v = computeVerdict([
      checkResult({ name: "a", status: "PASS" }),
      checkResult({ name: "b", status: "PASS" }),
    ]);
    expect(v.verdict).toBe("PASSED");
    expect(v.exitCode).toBe(0);
    expect(v.summary).toEqual({ total: 2, passed: 2, failed: 0, skipped: 0, requiredFailed: 0 });
  });

  it("FAILED when any required check fails", () => {
    const v = computeVerdict([
      checkResult({ name: "a", status: "PASS" }),
      checkResult({ name: "b", status: "FAIL", exitCode: 1 }),
      checkResult({ name: "c", status: "PASS" }),
    ]);
    expect(v.verdict).toBe("FAILED");
    expect(v.exitCode).toBe(1);
    expect(v.summary.requiredFailed).toBe(1);
  });

  it("an optional failure does not change the verdict but is counted as FAIL", () => {
    const v = computeVerdict([
      checkResult({ name: "a", status: "PASS" }),
      checkResult({ name: "opt", status: "FAIL", required: false }),
    ]);
    expect(v.verdict).toBe("PASSED");
    expect(v.exitCode).toBe(0);
    expect(v.summary.failed).toBe(1);
    expect(v.summary.requiredFailed).toBe(0);
  });

  it("a SKIPPED required check is not a pass", () => {
    const v = computeVerdict([
      checkResult({ name: "a", status: "FAIL" }),
      checkResult({ name: "b", status: "SKIPPED" }),
    ]);
    expect(v.verdict).toBe("FAILED");
    expect(v.summary.requiredFailed).toBe(2);
    expect(v.summary.skipped).toBe(1);
  });

  it("FAILED when there are no required checks at all (defensive)", () => {
    expect(computeVerdict([]).verdict).toBe("FAILED");
    expect(computeVerdict([checkResult({ required: false, status: "PASS" })]).verdict).toBe("FAILED");
  });
});

describe("computeCategories", () => {
  it("marks categories without checks as NOT_APPLICABLE and aggregates the rest", () => {
    const c = computeCategories([
      checkResult({ kind: "lint", status: "PASS" }),
      checkResult({ kind: "unit", status: "PASS" }),
      checkResult({ kind: "unit", status: "FAIL" }),
      checkResult({ kind: "build", status: "SKIPPED" }),
      checkResult({ kind: "custom", status: "FAIL" }),
    ]);
    expect(c).toEqual({
      lint: "PASS",
      typecheck: "NOT_APPLICABLE",
      unit: "FAIL",
      build: "SKIPPED",
      security: "NOT_APPLICABLE",
      dependency: "NOT_APPLICABLE",
      e2e: "NOT_APPLICABLE",
    });
  });
});
