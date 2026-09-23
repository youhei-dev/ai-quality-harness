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

describe("R-004 killTree: SIGKILL escalation reaches the group after the leader exited", () => {
  it("kills a TERM-ignoring grandchild within the grace period", async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    // `; true` makes the shell fork node as a grandchild (same process group, leader = shell).
    // The grandchild ignores SIGTERM, so only the SIGKILL escalation can end it.
    const command = `${nodeEval(
      `process.on("SIGTERM", () => {}); require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 8000)`,
    )}; true`;

    const started = Date.now();
    const r = await executeCommand({ command, cwd: dir, timeoutMs: 700, killGraceMs: 300 });
    const elapsed = Date.now() - started;

    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(4000);
    expect(existsSync(pidFile)).toBe(true);
    // M2-1: never pass an empty / half-written pid file (Number("") = 0) to process.kill.
    const grandchildPid = await waitForPid(pidFile, 2000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  }, 15_000);
});
