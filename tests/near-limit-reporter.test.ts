/**
 * B1-Q25 (v0.13.2, ROADMAP item 41): the reporter that records the tests slower than half of their limit
 * (tests/support/near-limit-reporter.ts). What it prints is decided by a pure function; the class only collects the timings and
 * writes the lines once at the end of the run. The verdict is not involved.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tail } from "../src/runner/run-checks.ts";
import NearLimitReporter, { cutToBytes, MAX_LINE_BYTES, MAX_LINES, nearLimitLines, type Timing } from "./support/near-limit-reporter.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const timing = (name: string, durationMs: number, timeoutMs: number | undefined): Timing => ({ file: "tests/x.test.ts", name, durationMs, timeoutMs });
const SUMMARY = /^aiqh-test-slow: summary over-half (\d+) shown (\d+) omitted (\d+) unknown-limit (\d+) of (\d+) tests$/;

describe("B1-Q25: the lines of the near-limit record", () => {
  it("25 tests over half of their limit: the 20 largest shares, then the summary line with 5 omitted", () => {
    const over = Array.from({ length: 25 }, (_, i) => timing(`slow ${String(i).padStart(2, "0")}`, 30_500 + i * 1000, 60_000));
    const lines = nearLimitLines([...over, timing("quick", 100, 30_000)]);
    expect(lines).toHaveLength(MAX_LINES + 1);
    expect(MAX_LINES).toBe(20);
    expect(lines[0]).toBe("aiqh-test-slow: tests/x.test.ts > slow 24 54.5 s of 60 s (91%)");
    expect(lines[19]).toBe("aiqh-test-slow: tests/x.test.ts > slow 05 35.5 s of 60 s (59%)");
    expect(lines.slice(0, 20).join("\n")).not.toMatch(/slow 0[0-4]|quick/);
    expect(lines[20]).toBe("aiqh-test-slow: summary over-half 25 shown 20 omitted 5 unknown-limit 0 of 26 tests");
  });

  it("no test over half of its limit: only the summary line", () => {
    expect(nearLimitLines([timing("a", 10, 30_000), timing("b", 15_000, 30_000)])).toEqual(["aiqh-test-slow: summary over-half 0 shown 0 omitted 0 unknown-limit 0 of 2 tests"]);
    expect(nearLimitLines([])).toEqual(["aiqh-test-slow: summary over-half 0 shown 0 omitted 0 unknown-limit 0 of 0 tests"]);
  });

  it("exactly half is not listed; just over half is; a test over its limit (it timed out) is listed too", () => {
    const lines = nearLimitLines([timing("half", 20_000, 40_000), timing("over", 20_001, 40_000), timing("timed out", 311, 300)]);
    expect(lines).toEqual([
      "aiqh-test-slow: tests/x.test.ts > timed out 0.3 s of 0.3 s (104%)",
      "aiqh-test-slow: tests/x.test.ts > over 20.0 s of 40 s (50%)",
      "aiqh-test-slow: summary over-half 2 shown 2 omitted 0 unknown-limit 0 of 3 tests",
    ]);
  });

  it("a test without a usable limit (undefined, 0, infinite) is not listed and is counted as unknown-limit", () => {
    const lines = nearLimitLines([timing("u", 50_000, undefined), timing("z", 50_000, 0), timing("i", 50_000, Number.POSITIVE_INFINITY), timing("s", 40_000, 60_000)]);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("aiqh-test-slow: summary over-half 1 shown 1 omitted 0 unknown-limit 3 of 4 tests");
  });

  it("a long line is cut to MAX_LINE_BYTES bytes of UTF-8, never inside a character, and ends with …", () => {
    expect(MAX_LINE_BYTES).toBe(300);
    const [line] = nearLimitLines([timing(`${"名".repeat(200)}${String.fromCodePoint(0x1f600)}`, 50_000, 60_000)]);
    expect(Buffer.byteLength(line ?? "", "utf8")).toBeLessThanOrEqual(MAX_LINE_BYTES);
    expect(line?.endsWith("…")).toBe(true);
    expect(Buffer.from(line ?? "", "utf8").toString("utf8")).toBe(line);
    // 10 bytes into 8: the cut keeps 3 bytes for the ellipsis, and the 4-byte character does not fit in the 5 left
    expect(cutToBytes(`ab${String.fromCodePoint(0x1f600)}${String.fromCodePoint(0x1f600)}`, 8)).toBe("ab…");
    expect(cutToBytes("short", 300)).toBe("short");
  });

  it("the summary line is always the last line", () => {
    for (const n of [0, 1, 20, 21, 50]) {
      const lines = nearLimitLines(Array.from({ length: n }, (_, i) => timing(`t${i}`, 50_000, 60_000)));
      expect(lines.at(-1)).toMatch(SUMMARY);
      expect(lines.filter((l) => SUMMARY.test(l))).toHaveLength(1);
    }
  });

  it("verify keeps the summary line: 300 stderr lines before the record and 5 after, through the tail of run-checks", () => {
    const record = nearLimitLines(Array.from({ length: 40 }, (_, i) => timing(`slow ${i} ${"x".repeat(250)}`, 50_000, 60_000)));
    const stderr = [...Array.from({ length: 300 }, (_, i) => `before ${i}`), ...record, ...Array.from({ length: 5 }, (_, i) => `after ${i}`)].join("\n");
    const kept = tail(stderr).text.split("\n");
    expect(kept).toContain(record.at(-1));
    expect(record.join("\n").length).toBeLessThan(21 * (MAX_LINE_BYTES + 1));
  });
});

describe("B1-Q25: the reporter collects each finished test and writes once at the end of the run", () => {
  const testCase = (relativeModuleId: string, fullName: string, timeout: number | undefined, duration: number | undefined): Parameters<NearLimitReporter["onTestCaseResult"]>[0] =>
    ({
      module: { relativeModuleId },
      fullName,
      options: { timeout },
      diagnostic: () => (duration === undefined ? undefined : { duration }),
    }) as unknown as Parameters<NearLimitReporter["onTestCaseResult"]>[0];

  it("a skipped test (no diagnostic) is not counted; the lines go to stderr in one write at the end", () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    const r = new NearLimitReporter();
    r.onTestCaseResult(testCase("tests/a.test.ts", "group > slow", 40_000, 30_000));
    r.onTestCaseResult(testCase("tests/a.test.ts", "group > skipped", 30_000, undefined));
    r.onTestCaseResult(testCase("tests/b.test.ts", "quick", 30_000, 5));
    expect(writes).toEqual([]);
    r.onTestRunEnd();
    expect(writes).toEqual(["aiqh-test-slow: tests/a.test.ts > group > slow 30.0 s of 40 s (75%)\naiqh-test-slow: summary over-half 1 shown 1 omitted 0 unknown-limit 0 of 2 tests\n"]);
  });
});
