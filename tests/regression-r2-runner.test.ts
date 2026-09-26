/**
 * Regression tests for independent review R2 — R2-002
 * (docs/reviews/m0/independent-review-r2.md). Timeout clean-up lifecycle.
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
  const t = makeTempDir("aiqh-r2-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** The runner's timeout counts from spawn: the grandchild must be ready well before it (v0.5.6). */
const READY_MARGIN_MS = 3000;

/** Grandchild that ignores SIGTERM, closes fd 1 / 2 (so the leader's `close` fires early) and lingers. */
function lingeringGrandchild(pidFile: string): string {
  return `${nodeEval(
    `process.on("SIGTERM", () => {}); const fs = require("fs"); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 30000)`,
  )}; true`;
}

describe("R2-002 killTree escalation survives the leader's close event", () => {
  it("SIGKILLs a TERM-ignoring grandchild that closed its stdio after the leader exited", async () => {
    // Timing policy (v0.5.6): the timeout is the trigger and counts from spawn, so the grandchild gets a 3 s readiness
    // margin and a missed margin fails with a "precondition: …" message (never a skip). The grandchild would live 30 s,
    // so the elapsed bound (10 s) tells the SIGKILL escalation apart from its natural end.
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    const started = Date.now();
    const r = await executeCommand({
      command: lingeringGrandchild(pidFile),
      cwd: dir,
      timeoutMs: READY_MARGIN_MS,
      killGraceMs: 300,
    });
    const elapsed = Date.now() - started;

    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    expect(existsSync(pidFile), `precondition: the grandchild was ready before the ${READY_MARGIN_MS} ms timeout (overloaded machine?)`).toBe(true);
    // M2-1: never pass an empty / half-written pid file (Number("") = 0) to process.kill.
    const grandchildPid = await waitForPid(pidFile, 2000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  }, 15_000);
});
