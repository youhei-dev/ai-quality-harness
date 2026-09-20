import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.ts";
import { formatDuration, renderMarkdown } from "../src/report/markdown.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import { checkResult } from "./helpers.ts";

describe("renderMarkdown", () => {
  const report = buildReport({
    config: {
      projectRoot: "/proj",
      configPath: "/proj/aiqh.config.jsonc",
      project: { name: "demo" },
      outputDir: "/proj/artifacts/verification",
      security: DEFAULT_SECURITY,
      checks: [],
    },
    results: [
      checkResult({ name: "lint", kind: "lint", status: "PASS", durationMs: 1500, command: "npm run lint" }),
      checkResult({
        name: "unit",
        kind: "unit",
        status: "FAIL",
        exitCode: 1,
        durationMs: 65_000,
        errorSummary: "exit code 1: 3 tests failed",
        stderrTail: "FAIL tests/x.test.ts\n  expected 1 to be 2",
        stdoutTail: "",
        command: "npm test | tee log",
      }),
      checkResult({ name: "slow", kind: "build", status: "FAIL", timedOut: true, exitCode: null, signal: "SIGTERM", timeoutSec: 5, errorSummary: "timed out after 5s" }),
    ],
    git: { commit: "0123456789abcdef", branch: "feature/x", dirty: false },
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: new Date("2026-01-01T00:01:10.000Z"),
    toolVersion: "0.1.0",
  });
  const md = renderMarkdown(report);

  it("shows the verdict, metadata and categories", () => {
    expect(md).toContain("# Verification Report — demo");
    expect(md).toContain("**VERIFY FAILED**");
    expect(md).toContain("| Git commit | 0123456789abcdef |");
    expect(md).toContain("| Git branch | feature/x |");
    expect(md).toContain("| Working tree | clean |");
    expect(md).toContain("| Lint | PASS |");
    expect(md).toContain("| Unit Test | FAIL |");
    expect(md).toContain("| E2E / Browser Test | NOT_APPLICABLE |");
  });

  it("lists every check and escapes pipes in commands", () => {
    expect(md).toContain("| 1 | lint | lint | yes | PASS | 1.5s | 0 | `npm run lint` |");
    expect(md).toContain("`npm test \\| tee log`");
  });

  it("includes failure details only for non-passing checks", () => {
    expect(md).toContain("### unit — FAIL");
    expect(md).toContain("exit code 1: 3 tests failed");
    expect(md).toContain("expected 1 to be 2");
    expect(md).toContain("### slow — FAIL");
    expect(md).toContain("Timed out after 5s");
    expect(md).not.toContain("### lint — ");
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds and minutes", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(65_000)).toBe("1m05s");
  });
});
