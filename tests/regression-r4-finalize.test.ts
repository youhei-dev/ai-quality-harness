/**
 * Regression tests for independent review R4 — R4-001
 * (docs/reviews/m0/independent-review-r4.md). A signal that arrives after the last check finished
 * but before the run is finalized must still be recognised (no PASSED / exit 0). Plan B (decided by
 * the human): the run is finalized once control has been yielded to the event loop after all checks
 * completed; a signal arriving after that point does not change the result.
 *
 * The OS signal is delivered to this very process. SIGUSR2 is used instead of SIGINT so the test
 * runner is not affected; the listener performs the same action as the CLI handler (abort with the
 * signal name "SIGINT"), which is what runVerify reacts to.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  process.removeAllListeners("SIGUSR2");
  while (cleanups.length > 0) cleanups.pop()?.();
});

function project(): string {
  const t = makeTempDir("aiqh-r4-fin-");
  cleanups.push(t.cleanup);
  writeFileSync(
    path.join(t.dir, "aiqh.config.jsonc"),
    JSON.stringify({
      version: 1,
      project: { name: "r4-finalize" },
      checks: [{ name: "quick", kind: "custom", command: nodeEval('console.log("ok")') }],
    }),
  );
  return t.dir;
}

function readReport(root: string): VerificationReport | null {
  const p = path.join(root, "artifacts", "verification", "latest.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as VerificationReport) : null;
}

describe("R4-001 signal in the finalization window", () => {
  it("a signal pending when the last check completed is recognised: no PASSED, exit 130, ERROR report", async () => {
    const root = project();
    const controller = new AbortController();
    // Same action as the CLI's SIGINT handler, triggered by a real OS signal.
    process.once("SIGUSR2", () => controller.abort("SIGINT"));
    const lines: string[] = [];
    const code = await runVerify({
      cwd: root,
      toolVersion: "0.0.0",
      signal: controller.signal,
      log: (l) => lines.push(l),
      logError: (l) => lines.push(l),
      // The signal is sent from the synchronous window right after all checks completed; the
      // handler cannot run until the event loop gets control back.
      afterChecksCompleted: () => process.kill(process.pid, "SIGUSR2"),
    });
    const output = lines.join("\n");
    expect(output).not.toContain("PASSED");
    expect(code).toBe(130);
    expect(output).toContain("VERIFY ERROR (interrupted by SIGINT)");
    const report = readReport(root);
    expect(report?.verdict).toBe("ERROR");
    expect(report?.interruptedBy).toBe("SIGINT");
    expect(report?.exitCode).toBe(130);
  });

  it("guard (plan B): a signal after the finalization point leaves exit 0 / PASSED / the report unchanged", async () => {
    const root = project();
    const controller = new AbortController();
    process.once("SIGUSR2", () => controller.abort("SIGINT"));
    const lines: string[] = [];
    const code = await runVerify({
      cwd: root,
      toolVersion: "0.0.0",
      signal: controller.signal,
      log: (l) => lines.push(l),
      logError: (l) => lines.push(l),
      onFinalized: () => process.kill(process.pid, "SIGUSR2"),
    });
    // let the pending signal callback run before asserting
    await new Promise((r) => setImmediate(r));
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("VERIFY PASSED");
    expect(readReport(root)?.verdict).toBe("PASSED");
    expect(readReport(root)?.interruptedBy).toBeNull();
  });
});
