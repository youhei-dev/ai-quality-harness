/**
 * History files for the aiqh history tests (ADR-0034): verify reports in the shape of src/types.ts, built in memory and written under a
 * temporary directory outside the repository. Every field aiqh history must not show can carry a marker (SENTINELS), so that a test can
 * look for it in the terminal, the --json document and the errors.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "./helpers.ts";

/** One marker per field that is not shown (D6, Q2): none of them may appear in any output. */
export const SENTINELS = {
  root: "SENTINEL-ROOT-7Q1",
  configPath: "SENTINEL-CONFIGPATH-7Q2",
  commit: "SENTINEL-COMMIT-7Q3",
  branch: "SENTINEL-BRANCH-7Q4",
  command: "SENTINEL-COMMAND-7Q5",
  cwd: "SENTINEL-CWD-7Q6",
  description: "SENTINEL-DESCRIPTION-7Q7",
  errorSummary: "SENTINEL-ERRORSUMMARY-7Q8",
  stdoutTail: "SENTINEL-STDOUT-7Q9",
  stderrTail: "SENTINEL-STDERR-7QA",
  itemName: "SENTINEL-ITEMNAME-7QB",
  allowRule: "SENTINEL-ALLOWRULE-7QC",
  reason: "SENTINEL-REASON-7QD",
} as const;

export type Json = Record<string, unknown>;

/** A check result as verify writes it (v0.8.0 and later: with `parsed`). */
export function check(over: Json = {}): Json {
  return {
    name: "unit",
    kind: "unit",
    command: `npm test ${SENTINELS.command}`,
    cwd: SENTINELS.cwd,
    required: true,
    timeoutSec: 600,
    description: SENTINELS.description,
    status: "PASS",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    errorSummary: SENTINELS.errorSummary,
    stdoutTail: SENTINELS.stdoutTail,
    stderrTail: SENTINELS.stderrTail,
    outputTruncated: false,
    parsed: {
      tool: "vitest",
      status: "parsed",
      reason: SENTINELS.reason,
      truncated: false,
      counts: { testFiles: 1, testFilesPassed: 1, tests: 10, testsPassed: 10, testsFailed: 0, errors: 0 },
      items: [{ kind: "failed-test", name: SENTINELS.itemName }],
      itemsOmitted: 0,
    },
    ...over,
  };
}

/** A verify report (schemaVersion 1) with the given top-level fields replaced. */
export function report(over: Json = {}): Json {
  return {
    schemaVersion: 1,
    tool: { name: "ai-quality-harness", version: "0.11.0" },
    project: { name: "alpha", root: `/abs/${SENTINELS.root}` },
    configPath: `/abs/${SENTINELS.configPath}/aiqh.config.jsonc`,
    configSha256: "a".repeat(64),
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    git: { commit: SENTINELS.commit, branch: SENTINELS.branch, dirty: false },
    verdict: "PASSED",
    exitCode: 0,
    interruptedBy: null,
    summary: { total: 1, passed: 1, failed: 0, skipped: 0, requiredFailed: 0 },
    categories: { lint: "NOT_APPLICABLE", typecheck: "NOT_APPLICABLE", unit: "PASS", build: "NOT_APPLICABLE", security: "NOT_APPLICABLE", dependency: "NOT_APPLICABLE", e2e: "NOT_APPLICABLE" },
    checks: [check()],
    ...over,
  };
}

/** The history name of the i-th run (`20260101T000000Z.json` + i seconds). */
export function stamp(i: number): string {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 1000);
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z.json`;
}

/** The ISO time of the i-th run on day `day` (0 = 2026-01-01). */
export function at(i: number, day = 0): string {
  return new Date(Date.UTC(2026, 0, 1 + day) + i * 1000).toISOString();
}

/** A project root with artifacts/verification/history, or a bare history directory. */
export function historyDir(cleanups: Array<() => void>, form: "root" | "history" = "root"): { root: string; history: string } {
  const t = makeTempDir("aiqh-history-");
  cleanups.push(t.cleanup);
  const history = form === "root" ? path.join(t.dir, "artifacts", "verification", "history") : path.join(t.dir, "history");
  mkdirSync(history, { recursive: true });
  return { root: form === "root" ? t.dir : history, history };
}

/** Write a history file: a report object (as verify writes it: JSON with two-space indentation), a string or bytes. */
export function put(dir: string, name: string, content: Json | string | Buffer): string {
  const file = path.join(dir, name);
  writeFileSync(file, typeof content === "string" || Buffer.isBuffer(content) ? content : `${JSON.stringify(content, null, 2)}\n`);
  return file;
}
