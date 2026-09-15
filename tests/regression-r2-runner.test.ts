/**
 * Regression tests for independent review R2 — R2-002
 * (docs/reviews/m0/independent-review-r2.md). Timeout clean-up lifecycle.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r2-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Grandchild that ignores SIGTERM, closes fd 1 / 2 (so the leader's `close` fires early) and lingers. */
function lingeringGrandchild(pidFile: string): string {
  return `${nodeEval(
    `process.on("SIGTERM", () => {}); const fs = require("fs"); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 8000)`,
  )}; true`;
}

describe("R2-002 killTree escalation survives the leader's close event", () => {
  it("SIGKILLs a TERM-ignoring grandchild that closed its stdio after the leader exited", async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    const started = Date.now();
    const r = await executeCommand({
      command: lingeringGrandchild(pidFile),
      cwd: dir,
      timeoutMs: 700,
      killGraceMs: 300,
    });
    const elapsed = Date.now() - started;

    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(4000);
    expect(existsSync(pidFile)).toBe(true);
    const grandchildPid = Number(readFileSync(pidFile, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  }, 15_000);
});
