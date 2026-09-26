/**
 * Regression tests for independent review R1 — R-004
 * (docs/reviews/m0/independent-review-r1.md). Process-group kill on timeout.
 * Test names carry the review ID so the "FAIL before fix / PASS after fix" record can be traced.
 * Dummy secrets are assembled at runtime with fake() (see CLAUDE.md).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval, waitForPid } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r1-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** The runner's timeout counts from spawn: the grandchild must be ready well before it (v0.5.6). */
const READY_MARGIN_MS = 3000;

describe("R-004 killTree: SIGKILL escalation reaches the group after the leader exited", () => {
  it("kills a TERM-ignoring grandchild within the grace period", async () => {
    // Timing policy (v0.5.6): the timeout is the trigger and counts from spawn, so the grandchild gets a 3 s readiness
    // margin and a missed margin fails with a "precondition: …" message (never a skip). The grandchild would live 30 s,
    // so the elapsed bound (10 s) tells the SIGKILL escalation apart from its natural end.
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    // `; true` makes the shell fork node as a grandchild (same process group, leader = shell).
    // The grandchild ignores SIGTERM, so only the SIGKILL escalation can end it.
    const command = `${nodeEval(
      `process.on("SIGTERM", () => {}); require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 30000)`,
    )}; true`;

    const started = Date.now();
    const r = await executeCommand({ command, cwd: dir, timeoutMs: READY_MARGIN_MS, killGraceMs: 300 });
    const elapsed = Date.now() - started;

    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    expect(existsSync(pidFile), `precondition: the grandchild was ready before the ${READY_MARGIN_MS} ms timeout (overloaded machine?)`).toBe(true);
    // M2-1: never pass an empty / half-written pid file (Number("") = 0) to process.kill.
    const grandchildPid = await waitForPid(pidFile, 2000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  }, 15_000);
});
