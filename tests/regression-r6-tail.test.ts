/**
 * Regression tests for independent review R6 — R6-001
 * (docs/reviews/m0/independent-review-r6.md). The 64 KiB report tail (tail() in run-checks.ts) must
 * land on a UTF-8 code-point boundary like the runtime OutputBuffer does (R5-004): no U+FFFD, the
 * re-encoded tail must not exceed TAIL_BYTES, and the end-of-stream marker must survive — for
 * stdout and stderr alike.
 */
import { describe, expect, it } from "vitest";
import { TAIL_BYTES, tail, toCheckResult } from "../src/runner/run-checks.ts";
import type { ExecutionResult, ResolvedCheck } from "../src/types.ts";

// "あ" is 3 bytes; 30,000 of them = 90,000 bytes > 64 KiB, in few lines (line cap not hit).
// The marker length is chosen so that (total - 64 KiB) is not a multiple of 3: the byte cut lands
// inside a character (90,006 - 65,536 = 24,470; 24,470 mod 3 = 2).
const MULTIBYTE = `${"あ".repeat(30000)}\nEND-1`;

describe("R6-001 report tail is aligned to a UTF-8 boundary", () => {
  it("tail(): a multibyte stream over 64 KiB keeps whole characters and stays within TAIL_BYTES", () => {
    const t = tail(MULTIBYTE);
    expect(t.truncated).toBe(true);
    expect(t.text).not.toContain("�");
    expect(Buffer.byteLength(t.text, "utf8")).toBeLessThanOrEqual(TAIL_BYTES);
    expect(t.text.endsWith("END-1")).toBe(true);
    expect(t.text.startsWith("あ")).toBe(true);
  });

  it("toCheckResult(): stdout and stderr tails are both aligned", () => {
    const check: ResolvedCheck = { name: "c", kind: "custom", command: "x", cwd: ".", cwdAbsolute: "/", required: true, timeoutSec: 1 };
    const exec: ExecutionResult = {
      exitCode: 0,
      signal: null,
      timedOut: false,
      interruptedBy: null,
      spawnError: null,
      stdout: MULTIBYTE,
      stderr: `${"い".repeat(30000)}\nERR-END`,
      stdoutTruncated: false,
      stderrTruncated: false,
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
    };
    const r = toCheckResult(check, exec);
    expect(r.outputTruncated).toBe(true);
    for (const [text, marker] of [
      [r.stdoutTail, "END-1"],
      [r.stderrTail, "ERR-END"],
    ] as const) {
      expect(text).not.toContain("�");
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(TAIL_BYTES);
      expect(text.endsWith(marker)).toBe(true);
    }
  });
});
