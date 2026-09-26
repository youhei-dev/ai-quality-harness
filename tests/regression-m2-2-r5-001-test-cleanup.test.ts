/**
 * M2-2-R5-001 (Medium, fixed in v0.5.8): a test that failed before it stopped what it had started left it running.
 * vitest stops the worker when the file ends, so the runner's own timeout / grace timers never fire and the child lived
 * its own lifetime (about 30 s in the M2-2-FLAKE-001 regression test); a `finally` in the test does not run on a test
 * timeout either. The tests now end what they start in afterEach (which also runs after a test timeout) with the
 * helpers below; these tests pin the helpers' contract. The bounds are short (a few hundred ms) on purpose.
 */
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, runCleanups, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

describe("M2-2-R5-001 test clean-up helpers", () => {
  it("M2-2-R5-001: stopper stops what is still pending once and waits until it ends", async () => {
    let end: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      end = resolve;
    });
    let stops = 0;
    const cleanUp = stopper(
      done,
      () => {
        stops++;
        setTimeout(end, 50);
      },
      2000,
      "the run",
    );
    await cleanUp();
    expect(stops).toBe(1);
  });

  it("M2-2-R5-001: stopper fails when what it stopped does not end within the bound", async () => {
    let stops = 0;
    let lates = 0;
    const never = new Promise<void>(() => {});
    const cleanUp = stopper(
      never,
      () => {
        stops++;
      },
      200,
      "the run",
      () => {
        lates++;
      },
    );
    await expect(cleanUp()).rejects.toThrow("clean-up: the run did not end within 200 ms after it was stopped");
    expect(stops).toBe(1);
    expect(lates).toBe(1);
  });

  it("M2-2-R5-001: stopper does nothing once what it guards has settled (fulfilled or rejected)", async () => {
    let stops = 0;
    const stop = (): void => {
      stops++;
    };
    const fulfilled = Promise.resolve(0);
    const afterFulfilled = stopper(fulfilled, stop, 200, "the run");
    await fulfilled;
    await afterFulfilled();
    const rejected = Promise.reject(new Error("spawn failed"));
    const afterRejected = stopper(rejected, stop, 200, "the run");
    await expect(rejected).rejects.toThrow("spawn failed");
    await afterRejected();
    expect(stops).toBe(0);
  });

  it("M2-2-R5-001: runCleanups runs newest first, awaits each, runs every one even if one throws, then throws the first error", async () => {
    const order: string[] = [];
    const list: Array<() => void | Promise<void>> = [
      () => {
        order.push("oldest");
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push("middle");
        throw new Error("middle failed");
      },
      () => {
        order.push("newest");
        throw new Error("newest failed");
      },
    ];
    await expect(runCleanups(list)).rejects.toThrow("newest failed");
    expect(order).toEqual(["newest", "middle", "oldest"]);
    expect(list).toEqual([]);
  });

  it("M2-2-R5-001: waitReady names the precondition when no valid pid appears in time", async () => {
    const t = makeTempDir("aiqh-r5-001-");
    cleanups.push(t.cleanup);
    const file = path.join(t.dir, "ready.pid");
    await expect(waitReady(file, 200, "the child was not ready within 200 ms")).rejects.toThrow(
      /^precondition: the child was not ready within 200 ms: no valid pid in .* within 200ms \(last content: file missing\)$/,
    );
  });
});
