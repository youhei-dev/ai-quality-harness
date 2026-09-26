/**
 * M2-2-FLAKE-001 (found in the investigation of the v0.5.5 unit-minpath flake, fixed in v0.5.6): for an interrupted
 * check, `timedOut` means "the timeout had been reached before the interruption" (ARCHITECTURE R4-002). The runner
 * cleared its timeout timer only when the run settled, so a timeout that expired during the clean-up after an
 * interruption (the grace period) still set `timedOut` — with the default grace of 5 s, a check whose timeout was due
 * within 5 s of a Ctrl+C was reported with "timeout had already been reached" (latest.json / latest.md). The status
 * (SKIPPED), the verdict (ERROR) and the exit code (130 / 143) were right. Now the interruption cancels the pending
 * timeout.
 */
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { toCheckResult } from "../src/runner/run-checks.ts";
import type { ResolvedCheck } from "../src/types.ts";
import { makeTempDir, nodeEval, waitForPid } from "./helpers.ts";

/** The runner's timeout counts from spawn: the child must be ready, and the abort sent, well before it. */
const READY_MARGIN_MS = 3000;

/** waitForPid, naming the precondition when the child never became ready (the timeout ended it first). */
async function waitReady(file: string): Promise<number> {
  try {
    return await waitForPid(file, 10_000);
  } catch (err) {
    throw new Error(
      `precondition: the child was not ready before the ${READY_MARGIN_MS} ms timeout (overloaded machine?): ${(err as Error).message}`,
      { cause: err },
    );
  }
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("M2-2-FLAKE-001 a timeout that expires after the interruption is not recorded", () => {
  it("abort first; the timeout expires during the grace period -> timedOut stays false", async () => {
    // Timing policy: the abort is the trigger, so it is sent only after the child's ready marker; it must also come
    // well before the timeout, which counts from spawn (3 s readiness margin; a missed margin fails with a
    // "precondition: …" message, never a skip). The grace period is longer than the timeout, so the runner's timeout
    // timer is due before its SIGKILL timer: without the fix the timeout always fires inside the grace period.
    const t = makeTempDir("aiqh-flake-001-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(
      `process.on("SIGTERM", () => {}); require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setTimeout(() => {}, 30000)`,
    )}; true`;
    const controller = new AbortController();
    const started = performance.now();
    const pending = executeCommand({
      command,
      cwd: t.dir,
      timeoutMs: READY_MARGIN_MS,
      killGraceMs: READY_MARGIN_MS + 1000,
      signal: controller.signal,
    });
    await waitReady(ready);
    const abortAt = performance.now() - started;
    expect(abortAt, "precondition: the abort is sent well before the timeout").toBeLessThan(READY_MARGIN_MS - 500);
    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.durationMs, "precondition: the run settled only after the timeout was due (the window under test)").toBeGreaterThanOrEqual(
      READY_MARGIN_MS,
    );
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(exec.timedOut).toBe(false);
    const c: ResolvedCheck = {
      name: "c",
      kind: "custom",
      command,
      cwd: ".",
      cwdAbsolute: t.dir,
      required: true,
      timeoutSec: READY_MARGIN_MS / 1000,
    };
    const result = toCheckResult(c, exec);
    expect(result.status).toBe("SKIPPED");
    expect(result.timedOut).toBe(false);
    expect(result.errorSummary).toBe("interrupted by SIGINT while running (process group terminated)");
  }, 30_000);
});
