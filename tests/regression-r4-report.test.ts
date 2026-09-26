/**
 * Regression tests for independent review R4 — R4-002
 * (docs/reviews/m0/independent-review-r4.md). An interrupted check keeps the raw facts of its
 * execution in the report: timedOut and outputTruncated.
 * v0.5.6: the order of the events is observed instead of assumed (under load in the v0.5.5 release verification the
 * child of scenario B was not ready before the 300 ms timeout, so the run settled before the abort).
 */
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { toCheckResult } from "../src/runner/run-checks.ts";
import type { ResolvedCheck } from "../src/types.ts";
import { assertSignalablePid, makeTempDir, nodeEval, waitForPid } from "./helpers.ts";

/** The runner's timeout counts from spawn: a timeout-triggered scenario needs the child ready well before it. */
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

function check(command: string, cwd: string, timeoutSec: number): ResolvedCheck {
  return { name: "c", kind: "custom", command, cwd: ".", cwdAbsolute: cwd, required: true, timeoutSec };
}

describe("R4-002 interrupted checks keep timedOut / outputTruncated", () => {
  it("outputTruncated stays true when a chatty check is interrupted", async () => {
    // Timing policy: the abort is the trigger, so it is sent only after the child's ready marker (SIGTERM ignored and
    // more output than the cap handed to the OS by the write callback). No timing assumption is left.
    const t = makeTempDir("aiqh-r4-rep-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(
      `const fs = require("fs"); process.on("SIGTERM", () => {}); let out = ""; for (let i = 0; i < 3000; i++) out += "line-" + i + "\\n"; process.stdout.write(out, () => fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid))); setTimeout(() => {}, 30000)`,
    )}; true`;
    const controller = new AbortController();
    const pending = executeCommand({
      command,
      cwd: t.dir,
      timeoutMs: 20_000,
      killGraceMs: 200,
      maxOutputBytes: 4096,
      signal: controller.signal,
    });
    await waitForPid(ready, 10_000);
    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(exec.timedOut).toBe(false);
    expect(exec.stdoutTruncated).toBe(true);
    const result = toCheckResult(check(command, t.dir, 20), exec);
    expect(result.status).toBe("SKIPPED");
    expect(result.outputTruncated).toBe(true);
  }, 15_000);

  it("timedOut stays true when an abort overlaps a timeout", async () => {
    // Timing policy: the timeout is the trigger and counts from spawn, so the child gets a 3 s readiness margin and a
    // missed margin fails with a "precondition: …" message (never a skip). The abort is sent only after the child
    // reports the timeout's SIGTERM (observed, not assumed), and the test ends the child itself after the abort, so the
    // grace period (20 s) never decides the outcome.
    const t = makeTempDir("aiqh-r4-rep-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const term = path.join(t.dir, "term.pid");
    // The child ignores SIGTERM but records that it received it.
    const command = `${nodeEval(
      `const fs = require("fs"); process.on("SIGTERM", () => fs.writeFileSync(${JSON.stringify(term)}, String(process.pid))); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setTimeout(() => {}, 30000)`,
    )}; true`;
    const controller = new AbortController();
    let settled = false;
    let childPid: number | null = null;
    cleanups.push(() => {
      if (childPid === null) return;
      assertSignalablePid(childPid);
      try {
        process.kill(childPid, "SIGKILL");
      } catch {
        // already gone
      }
    });
    const pending = executeCommand({
      command,
      cwd: t.dir,
      timeoutMs: READY_MARGIN_MS,
      killGraceMs: 20_000,
      signal: controller.signal,
    }).then((r) => {
      settled = true;
      return r;
    });
    childPid = await waitReady(ready);
    await waitForPid(term, 10_000);
    expect(settled, "precondition: the run is still in the grace period when the abort is sent").toBe(false);
    controller.abort("SIGINT");
    // End the child ourselves (the runner would SIGKILL it after the grace period); the run settles once the group is gone.
    assertSignalablePid(childPid);
    process.kill(childPid, "SIGKILL");
    // Not signalled again by the clean-up: the pid may be reused once the child is gone.
    childPid = null;
    const exec = await pending;
    expect(exec.timedOut).toBe(true);
    expect(exec.interruptedBy).toBe("SIGINT");
    const result = toCheckResult(check(command, t.dir, READY_MARGIN_MS / 1000), exec);
    expect(result.status).toBe("SKIPPED");
    expect(result.timedOut).toBe(true);
    expect(result.errorSummary).toContain("timeout had already been reached");
  }, 30_000);
});
