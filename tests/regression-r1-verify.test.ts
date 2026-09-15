/**
 * Regression tests for independent review R1 — R-007
 * (docs/reviews/m0/independent-review-r1.md). Verdict wording is tied to the exit code.
 * Test names carry the review ID so the "FAIL before fix / PASS after fix" record can be traced.
 * Dummy secrets are assembled at runtime with fake() (see CLAUDE.md).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r1-");
  cleanups.push(t.cleanup);
  return t.dir;
}

describe("R-007 verify: 'PASSED' is printed only when the exit code is 0", () => {
  it("does not print PASSED when the report cannot be written", async () => {
    const root = tempDir();
    writeFileSync(
      path.join(root, "aiqh.config.jsonc"),
      JSON.stringify({
        version: 1,
        project: { name: "p" },
        checks: [{ name: "ok", kind: "lint", command: nodeEval("process.exit(0)") }],
      }),
    );
    // A regular file where the output directory should be makes mkdir fail.
    const blocker = path.join(root, "blocker");
    writeFileSync(blocker, "not a directory");

    const lines: string[] = [];
    const code = await runVerify({
      cwd: root,
      outputDir: blocker,
      toolVersion: "0.0.0",
      log: (l) => lines.push(l),
      logError: (l) => lines.push(l),
    });
    expect(code).toBe(2);
    const output = lines.join("\n");
    expect(output).not.toContain("PASSED");
    expect(output).not.toContain("VERIFY FAILED");
    expect(output).toContain("VERIFY ERROR");
  });
});
