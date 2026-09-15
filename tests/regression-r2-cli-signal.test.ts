/**
 * Regression tests for independent review R2 — R2-002 (CLI signal path)
 * (docs/reviews/m0/independent-review-r2.md). The CLI's SIGINT / SIGTERM handling must use the
 * same clean-up path: SIGTERM to every active group → grace → SIGKILL → exit.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand, terminateActiveChildren } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("R2-002 terminateActiveChildren (CLI signal path)", () => {
  it("SIGKILLs TERM-ignoring descendants of every active check after the grace period", async () => {
    const t = makeTempDir("aiqh-r2-sig-");
    cleanups.push(t.cleanup);
    const pidFile = path.join(t.dir, "grandchild.pid");
    const command = `${nodeEval(
      `process.on("SIGTERM", () => {}); const fs = require("fs"); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 8000)`,
    )}; true`;

    const running = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000 });
    while (!existsSync(pidFile)) await new Promise((resolve) => setTimeout(resolve, 20));
    const grandchildPid = Number(readFileSync(pidFile, "utf8"));

    const started = Date.now();
    await terminateActiveChildren(300);
    expect(Date.now() - started).toBeLessThan(4000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(grandchildPid, 0)).toThrow();

    const r = await running;
    expect(r.exitCode === 0 || r.signal !== null).toBe(true);
  }, 15_000);
});
