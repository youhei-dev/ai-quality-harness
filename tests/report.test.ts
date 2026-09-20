import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { historyStamp, writeReports } from "../src/report/write.ts";
import type { ResolvedConfig } from "../src/types.ts";
import { checkResult, fake, makeTempDir } from "./helpers.ts";

// Synthetic values assembled at runtime so no secret-shaped literal exists in the repo.
const GITHUB_TOKEN = fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789");
const AWS_KEY = fake("AKIA", "ABCDEFGHIJKLMNOP");

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function config(root: string): ResolvedConfig {
  return {
    projectRoot: root,
    configPath: path.join(root, "aiqh.config.jsonc"),
    project: { name: "demo" },
    outputDir: path.join(root, "artifacts", "verification"),
    security: DEFAULT_SECURITY,
    checks: [],
  };
}

describe("buildReport", () => {
  it("assembles metadata, verdict and masks every string deeply", () => {
    const report = buildReport({
      config: config("/proj"),
      results: [
        checkResult({ name: "lint", kind: "lint", status: "PASS" }),
        checkResult({
          name: "unit",
          kind: "unit",
          status: "FAIL",
          exitCode: 1,
          command: `npm test -- --token=${GITHUB_TOKEN}`,
          errorSummary: "exit code 1: password=hunter2",
          stderrTail: `AWS ${AWS_KEY} leaked`,
        }),
      ],
      git: { commit: "abc", branch: "main", dirty: true },
      startedAt: new Date("2026-01-02T03:04:05.000Z"),
      finishedAt: new Date("2026-01-02T03:05:05.000Z"),
      toolVersion: "9.9.9",
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.tool).toEqual({ name: "ai-quality-harness", version: "9.9.9" });
    expect(report.project).toEqual({ name: "demo", root: "/proj" });
    expect(report.durationMs).toBe(60_000);
    expect(report.git).toEqual({ commit: "abc", branch: "main", dirty: true });
    expect(report.verdict).toBe("FAILED");
    expect(report.exitCode).toBe(1);
    expect(report.categories.lint).toBe("PASS");
    expect(report.categories.unit).toBe("FAIL");
    expect(report.categories.e2e).toBe("NOT_APPLICABLE");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain(AWS_KEY);
    expect(serialized).not.toContain(GITHUB_TOKEN);
    expect(report.checks[1]?.command).toContain("[REDACTED:github]");
    expect(report.checks[1]?.errorSummary).toContain("[REDACTED:key-value]");
    expect(report.checks[1]?.stderrTail).toContain("[REDACTED:aws]");
  });

  it("handles a non-git project", () => {
    const report = buildReport({
      config: config("/proj"),
      results: [checkResult()],
      git: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      toolVersion: "0.0.0",
    });
    expect(report.git).toBeNull();
    expect(renderMarkdown(report)).toContain("not a git repository");
  });
});

describe("writeReports", () => {
  it("writes latest.json, latest.md and a history file; history names never collide", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const outputDir = path.join(tmp.dir, "artifacts", "verification");
    const report = buildReport({
      config: config(tmp.dir),
      results: [checkResult({ name: "a", kind: "lint" })],
      git: null,
      startedAt: new Date("2026-09-15T12:34:56.789Z"),
      finishedAt: new Date("2026-09-15T12:35:00.000Z"),
      toolVersion: "0.1.0",
    });

    const first = writeReports(report, outputDir);
    expect(first.latestJson).toBe(path.join(outputDir, "latest.json"));
    expect(first.latestMd).toBe(path.join(outputDir, "latest.md"));
    expect(first.history).toBe(path.join(outputDir, "history", "20260915T123456Z.json"));
    expect(existsSync(first.latestJson)).toBe(true);
    expect(existsSync(first.latestMd)).toBe(true);
    expect(existsSync(first.history)).toBe(true);

    const parsed = JSON.parse(readFileSync(first.latestJson, "utf8")) as typeof report;
    expect(parsed.verdict).toBe("PASSED");
    expect(readFileSync(first.history, "utf8")).toBe(readFileSync(first.latestJson, "utf8"));
    expect(readFileSync(first.latestMd, "utf8")).toContain("VERIFY PASSED");

    const second = writeReports(report, outputDir);
    expect(second.history).toBe(path.join(outputDir, "history", "20260915T123456Z-2.json"));
    expect(readdirSync(path.join(outputDir, "history")).sort()).toEqual([
      "20260915T123456Z-2.json",
      "20260915T123456Z.json",
    ]);
    // No temp files left behind.
    expect(readdirSync(outputDir).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });

  it("historyStamp formats ISO dates as a filesystem-safe UTC stamp", () => {
    expect(historyStamp("2026-09-15T12:34:56.789Z")).toBe("20260915T123456Z");
  });
});
