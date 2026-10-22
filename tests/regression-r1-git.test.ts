/**
 * Regression tests for independent review R1 — R-009
 * (docs/reviews/m0/independent-review-r1.md). Unknown working-tree state is never reported as clean.
 * Test names carry the review ID so the "FAIL before fix / PASS after fix" record can be traced.
 * Dummy secrets are assembled at runtime with fake() (see fake() in tests/helpers.ts).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getGitInfo } from "../src/git/info.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r1-");
  cleanups.push(t.cleanup);
  return t.dir;
}

describe("R-009 git info: unknown dirty state is not reported as clean", () => {
  it("returns dirty=null when `git status` fails inside a work tree", () => {
    const dir = tempDir();
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    writeFileSync(path.join(dir, "f.txt"), "x");
    execFileSync("git", ["add", "f.txt"], { cwd: dir });
    // An unreadable index makes `git status` fail while rev-parse still works.
    const index = path.join(dir, ".git", "index");
    chmodSync(index, 0o000);
    cleanups.push(() => chmodSync(index, 0o644));

    const info = getGitInfo(dir);
    expect(info).not.toBeNull();
    expect(info?.dirty).toBeNull();
  });

  it("renders an unknown working-tree state as 'unknown' in Markdown", () => {
    const report: VerificationReport = {
      schemaVersion: 1,
      tool: { name: "ai-quality-harness", version: "0.0.0" },
      project: { name: "p", root: "/p" },
      configPath: "/p/aiqh.config.jsonc",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      git: { commit: "abc", branch: "main", dirty: null },
      verdict: "FAILED",
      exitCode: 1,
      interruptedBy: null,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, requiredFailed: 0 },
      categories: {
        lint: "NOT_APPLICABLE",
        typecheck: "NOT_APPLICABLE",
        unit: "NOT_APPLICABLE",
        build: "NOT_APPLICABLE",
        security: "NOT_APPLICABLE",
        dependency: "NOT_APPLICABLE",
        e2e: "NOT_APPLICABLE",
      },
      checks: [],
    };
    const md = renderMarkdown(report);
    expect(md).toContain("| Working tree | unknown |");
    expect(md).not.toContain("| Working tree | clean |");
  });
});
