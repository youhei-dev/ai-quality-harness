/**
 * Regression test for independent review R5 — R5-001
 * (docs/reviews/m0/independent-review-r5.md). Swapping the CLI signal handlers at the finalization
 * point must never leave SIGINT / SIGTERM without a listener: with zero listeners Node restores the
 * default action and a signal in that instant would kill the process. The helper exposes an internal
 * hook that runs between the two listener operations; the test asserts the listener count there.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CLI_SIGNALS, swapSignalHandlers, type SignalHandlers } from "../src/cli-signals.ts";

const registered: Array<[string, () => void]> = [];
/** Listener counts before the test, restored and asserted afterwards so other tests (real-CLI signal checks) are unaffected. */
const initialCounts = { SIGINT: process.listenerCount("SIGINT"), SIGTERM: process.listenerCount("SIGTERM") };
afterEach(() => {
  for (const [signal, fn] of registered) process.off(signal, fn);
  registered.length = 0;
  expect(process.listenerCount("SIGINT")).toBe(initialCounts.SIGINT);
  expect(process.listenerCount("SIGTERM")).toBe(initialCounts.SIGTERM);
});

function handlers(): SignalHandlers {
  const h: SignalHandlers = { SIGINT: () => {}, SIGTERM: () => {} };
  return h;
}

describe("R5-001 swapSignalHandlers is atomic with respect to the listener count", () => {
  it("never lets the listener count of SIGINT / SIGTERM drop to 0 during the swap", () => {
    const before = handlers();
    const after = handlers();
    for (const signal of CLI_SIGNALS) {
      process.on(signal, before[signal]);
      registered.push([signal, before[signal]]);
    }
    const seen: Array<{ signal: string; sigint: number; sigterm: number }> = [];
    swapSignalHandlers(before, after, {
      betweenAddAndRemove: (signal) => {
        seen.push({ signal, sigint: process.listenerCount("SIGINT"), sigterm: process.listenerCount("SIGTERM") });
      },
    });
    for (const signal of CLI_SIGNALS) registered.push([signal, after[signal]]);

    expect(seen).toHaveLength(CLI_SIGNALS.length);
    for (const s of seen) {
      expect(s.sigint, `SIGINT listeners while swapping ${s.signal}`).toBeGreaterThanOrEqual(1);
      expect(s.sigterm, `SIGTERM listeners while swapping ${s.signal}`).toBeGreaterThanOrEqual(1);
    }
    // after the swap only the new handlers remain
    for (const signal of CLI_SIGNALS) {
      expect(process.listeners(signal)).toContain(after[signal]);
      expect(process.listeners(signal)).not.toContain(before[signal]);
    }
  });
});
