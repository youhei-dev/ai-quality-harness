/**
 * Regression tests for independent review R4 — R4-002
 * (docs/reviews/m0/independent-review-r4.md). An interrupted check keeps the raw facts of its
 * execution in the report: timedOut and outputTruncated.
 */
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { toCheckResult } from "../src/runner/run-checks.ts";
import type { ResolvedCheck } from "../src/types.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function check(command: string, cwd: string, timeoutSec: number): ResolvedCheck {
  return { name: "c", kind: "custom", command, cwd: ".", cwdAbsolute: cwd, required: true, timeoutSec };
}

describe("R4-002 interrupted checks keep timedOut / outputTruncated", () => {
  it("outputTruncated stays true when a chatty check is interrupted", async () => {
    const t = makeTempDir("aiqh-r4-rep-");
    cleanups.push(t.cleanup);
    const command = `${nodeEval(
      'for (let i = 0; i < 3000; i++) console.log("line-" + i); process.on("SIGTERM", () => {}); setTimeout(() => {}, 5000)',
    )}; true`;
    const controller = new AbortController();
    setTimeout(() => controller.abort("SIGINT"), 500);
    const exec = await executeCommand({
      command,
      cwd: t.dir,
      timeoutMs: 20_000,
      killGraceMs: 200,
      maxOutputBytes: 4096,
      signal: controller.signal,
    });
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(exec.stdoutTruncated).toBe(true);
    const result = toCheckResult(check(command, t.dir, 20), exec);
    expect(result.status).toBe("SKIPPED");
    expect(result.outputTruncated).toBe(true);
  }, 15_000);

  it("timedOut stays true when an abort overlaps a timeout", async () => {
    const t = makeTempDir("aiqh-r4-rep-");
    cleanups.push(t.cleanup);
    const command = `${nodeEval('process.on("SIGTERM", () => {}); setTimeout(() => {}, 5000)')}; true`;
    const controller = new AbortController();
    setTimeout(() => controller.abort("SIGINT"), 600);
    const exec = await executeCommand({
      command,
      cwd: t.dir,
      timeoutMs: 300,
      killGraceMs: 1500,
      signal: controller.signal,
    });
    expect(exec.timedOut).toBe(true);
    expect(exec.interruptedBy).toBe("SIGINT");
    const result = toCheckResult(check(command, t.dir, 1), exec);
    expect(result.timedOut).toBe(true);
  }, 15_000);
});
