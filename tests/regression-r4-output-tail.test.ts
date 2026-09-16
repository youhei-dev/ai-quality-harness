/**
 * Regression test for the OutputBuffer defect found during the R4 cycle (v0.1.3 verification):
 * when a single chunk is larger than the retention cap, the buffer dropped the whole chunk and
 * the captured output became empty instead of keeping the tail. The test is deterministic: one
 * write of 20,000 bytes against a 4,096-byte cap.
 */
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("OutputBuffer keeps the tail when a single chunk exceeds the cap", () => {
  it("a single 20,000-byte write with a 4,096-byte cap keeps the last bytes", async () => {
    const t = makeTempDir("aiqh-tail-");
    cleanups.push(t.cleanup);
    const r = await executeCommand({
      command: nodeEval('process.stdout.write("x".repeat(20000) + "\\nEND\\n")'),
      cwd: t.dir,
      timeoutMs: 10_000,
      maxOutputBytes: 4096,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(r.stdout.length).toBeLessThanOrEqual(4096);
    expect(r.stdout.trimEnd().endsWith("END")).toBe(true);
  });

  it("several writes: the front is trimmed byte-wise, the tail is complete", async () => {
    const t = makeTempDir("aiqh-tail-");
    cleanups.push(t.cleanup);
    const r = await executeCommand({
      command: nodeEval(
        'process.stdout.write("a".repeat(3000)); process.stdout.write("b".repeat(3000)); process.stdout.write("\\nLAST\\n")',
      ),
      cwd: t.dir,
      timeoutMs: 10_000,
      maxOutputBytes: 4096,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(4096);
    expect(r.stdout.trimEnd().endsWith("LAST")).toBe(true);
    // everything that was kept must be the *end* of the stream
    expect(r.stdout).toContain("b".repeat(1000));
  });
});
