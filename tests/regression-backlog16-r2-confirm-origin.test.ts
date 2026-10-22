/**
 * Independent review R2 of v0.5.34, B16-R2-002 (docs/reviews/backlog-16-2-19/): where the bounded wait for `close` counts from.
 * The implementation is `anchor = sigkillSentAt ?? goneAt`: from the SIGKILL when it was sent, otherwise from the moment the group was
 * first seen gone. v0.5.34 documented only the second case ("from the first sight of the disappearance"). The documentation is
 * corrected; the implementation is not changed (the case needs a descendant in another group that holds the pipes, and sharing a
 * timestamp between the command and terminateActiveChildren() would be a bigger change for little gain).
 *
 * This test pins the case the documentation had left out: the SIGKILL is sent first, the group is seen gone later, `close` is still
 * pending. The wait counts from the SIGKILL, so the run settles `confirmMs` after it, not `confirmMs` after the group was seen gone.
 * The other case (the group gone before the SIGKILL timer) is pinned by regression-backlog16-r1-pgid-reuse.test.ts.
 *
 * Making the two origins differ: a real group dies within milliseconds of a SIGKILL, so the probe (signal 0) is made to answer "alive"
 * for FAKE_ALIVE_MS after the SIGKILL; after that the real answer (ESRCH) comes. Counted from the SIGKILL the run settles after about
 * CONFIRM_MS; counted from the first sight of the disappearance, after about FAKE_ALIVE_MS + CONFIRM_MS. The margins are 500 ms on both sides.
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

const KILL_GRACE_MS = 600;
const CONFIRM_MS = 1200;
const FAKE_ALIVE_MS = 1000;

/** JS of a detached daemon that holds the stdout / stderr pipes (so `close` never comes) and leaves when its marker disappears. */
function daemonJs(up: string): string {
  return `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(up)}, String(process.pid)); ${exitWhenRemoved(up)} setTimeout(() => process.exit(0), 8000)`;
}

/**
 * The command of a leader that spawns the daemon, runs `beforeReady`, records its parent (the shell = the group id) and then runs
 * `body`. Item 41 (v0.13.2): a SIGTERM handler goes in `beforeReady`, so it is in place before the test sees the marker and aborts
 * (it used to come after the marker: a SIGTERM in between ended the leader and no SIGKILL was needed). `afterReady` runs right
 * after the marker; only the test of that order uses it.
 */
function leaderWithDaemon(dir: string, ready: string, beforeReady: string, body: string, afterReady = ""): string {
  const up = path.join(dir, "daemon.up");
  return `${nodeEval(
    `const { spawn } = require("child_process"); spawn(process.execPath, ["-e", ${JSON.stringify(daemonJs(up))}], { detached: true, stdio: "inherit" }).unref(); ${beforeReady} require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${afterReady} ${exitWhenRemoved(ready)} ${body}`,
  )}; true`;
}

/** A loaded machine in the leader: the thread stops for 400 ms right after the ready marker (the abort comes in that time). */
const PAUSE_AFTER_READY = "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);";

describe("B16-R2-002: the bounded wait for `close` counts from the SIGKILL when the SIGKILL came first", () => {
  it("close pending, SIGKILL sent, the group seen gone later: the run settles CONFIRM_MS after the SIGKILL", async () => {
    const t = makeTempDir("aiqh-b16r2-origin-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    // The leader ignores SIGTERM, so the group is alive when the SIGKILL timer fires; the daemon (another group) holds the pipes.
    const command = leaderWithDaemon(t.dir, ready, `process.on("SIGTERM", () => {});`, `setTimeout(() => {}, 30000)`);
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: KILL_GRACE_MS, confirmMs: CONFIRM_MS, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), KILL_GRACE_MS + CONFIRM_MS + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");

    const realKill = process.kill.bind(process);
    let sigkillAt: number | null = null;
    let fakeAliveProbes = 0;
    const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (pid !== -pgid) return realKill(pid, signal);
      if (signal === "SIGKILL" && sigkillAt === null) sigkillAt = performance.now();
      if (signal === 0 && sigkillAt !== null && performance.now() - sigkillAt < FAKE_ALIVE_MS) {
        fakeAliveProbes++;
        return true;
      }
      return realKill(pid, signal);
    });
    cleanups.push(() => spy.mockRestore());

    controller.abort("SIGINT");
    const exec = await pending;
    const settledAt = performance.now();
    expect(sigkillAt, "precondition: the group ignored SIGTERM and got the SIGKILL").not.toBeNull();
    expect(fakeAliveProbes, "precondition: the probe answered `alive` for a while after the SIGKILL").toBeGreaterThan(0);
    const afterSigkill = settledAt - (sigkillAt ?? 0);
    expect(afterSigkill, "it waited for `close` (which does not come) for the whole bound").toBeGreaterThanOrEqual(CONFIRM_MS - 100);
    expect(afterSigkill, `counted from the SIGKILL, not from the group's disappearance (that would be about ${FAKE_ALIVE_MS + CONFIRM_MS} ms)`).toBeLessThan(CONFIRM_MS + 500);
    expect(exec.terminationUnconfirmed, "the group was gone when the wait ended").toBeUndefined();
  }, 30_000);

  it("item 41: the SIGTERM handler is in place before the ready marker, so a pause right after the marker does not end the leader", async () => {
    // Before v0.13.2 the handler came after the marker; with this pause the SIGTERM arrived first and ended the leader (no SIGKILL).
    const t = makeTempDir("aiqh-b16r2-order-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = leaderWithDaemon(t.dir, ready, `process.on("SIGTERM", () => {});`, `setTimeout(() => {}, 30000)`, PAUSE_AFTER_READY);
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: KILL_GRACE_MS, confirmMs: CONFIRM_MS, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), KILL_GRACE_MS + CONFIRM_MS + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");

    const realKill = process.kill.bind(process);
    let sigkillAt: number | null = null;
    const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (pid === -pgid && signal === "SIGKILL" && sigkillAt === null) sigkillAt = performance.now();
      return realKill(pid, signal);
    });
    cleanups.push(() => spy.mockRestore());

    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(sigkillAt, "the group ignored SIGTERM (its handler came before the marker) and got the SIGKILL").not.toBeNull();
  }, 30_000);
});
