/**
 * Regression test for independent review R5 — R5-004
 * (docs/reviews/m0/independent-review-r5.md). Byte-wise trimming of the output buffer must land on a
 * UTF-8 code-point boundary: the kept tail must not start with a replacement character, and its
 * UTF-8 re-encoding must not exceed the cap.
 */
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("R5-004 output tail is aligned to a UTF-8 boundary", () => {
  it("a multibyte stream cut by the cap keeps whole characters only", async () => {
    const t = makeTempDir("aiqh-utf8-");
    cleanups.push(t.cleanup);
    // "あ" is 3 bytes; 3000 of them = 9000 bytes, cap 4096 is not a multiple of 3
    const r = await executeCommand({
      command: nodeEval('process.stdout.write("あ".repeat(3000) + "\\nEND\\n")'),
      cwd: t.dir,
      timeoutMs: 10_000,
      maxOutputBytes: 4096,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.startsWith("�")).toBe(false);
    expect(r.stdout).not.toContain("�");
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(4096);
    expect(r.stdout.trimEnd().endsWith("END")).toBe(true);
    expect(r.stdout.startsWith("あ")).toBe(true);
  });
});
