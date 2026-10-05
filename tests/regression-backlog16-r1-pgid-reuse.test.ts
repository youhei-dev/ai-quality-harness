/**
 * Independent review R1 of v0.5.33, B16-R1-001 (docs/reviews/backlog-16-2-19/): a process group that was seen gone (ESRCH) is not
 * probed or signalled again. The OS may give the same number to an unrelated group, and the runner kept probing it and sent its
 * SIGKILL to it (the timer did not look at what the polling had seen; terminateActiveChildren() sent SIGKILL to every target).
 *
 * The invariant is tested without waiting for a real id reuse: process.kill is replaced for the group under test. It passes
 * the calls through until the product first receives ESRCH for that group; from then on the same number answers like a live,
 * unrelated group (signal 0 returns true; any other signal is recorded and delivered nowhere). Any call for that group after the
 * first ESRCH is a violation. Every trigger is an abort or a direct call after a ready marker, and children leave by themselves
 * when their marker file disappears (the temp directory is removed in afterEach).
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand, terminateActiveChildren } from "../src/runner/execute.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

interface Watched {
  pgid: number;
  observedEsrch: boolean;
  calls: Array<{ signal: string | number; afterEsrch: boolean }>;
}

/** One spy for process.kill; `watch(pgid)` starts recording that group. Other pids and groups pass through to the real kill. */
function killSpy(): { watch: (pgid: number) => Watched } {
  const realKill = process.kill.bind(process);
  const watched = new Map<number, Watched>();
  const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    const st = pid < 0 ? watched.get(-pid) : undefined;
    if (st === undefined) return realKill(pid, signal);
    st.calls.push({ signal: signal ?? "SIGTERM", afterEsrch: st.observedEsrch });
    if (st.observedEsrch) return true; // an unrelated live group with the same number answers; nothing is delivered
    try {
      return realKill(pid, signal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") st.observedEsrch = true;
      throw err;
    }
  });
  cleanups.push(() => spy.mockRestore());
  return {
    watch: (pgid) => {
      const st: Watched = { pgid, observedEsrch: false, calls: [] };
      watched.set(pgid, st);
      return st;
    },
  };
}

const after = (st: Watched): Array<string | number> => st.calls.filter((c) => c.afterEsrch).map((c) => c.signal);

/** JS of a detached daemon that holds the stdout / stderr pipes (so `close` never comes) and leaves when its marker disappears. */
function daemonJs(up: string): string {
  return `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(up)}, String(process.pid)); ${exitWhenRemoved(up)} setTimeout(() => process.exit(0), 8000)`;
}

/** The command of a leader that spawns the daemon, records its parent (the shell = the group id) and then runs `body`. */
function leaderWithDaemon(dir: string, ready: string, body: string): string {
  const up = path.join(dir, "daemon.up");
  return `${nodeEval(
    `const { spawn } = require("child_process"); spawn(process.execPath, ["-e", ${JSON.stringify(daemonJs(up))}], { detached: true, stdio: "inherit" }).unref(); require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} ${body}`,
  )}; true`;
}

describe("B16-R1-001: a group seen gone is not probed or signalled again", () => {
  it("close pending, group gone before the SIGKILL timer: nothing is sent to the group after the first ESRCH", async () => {
    const t = makeTempDir("aiqh-b16r1-a-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    // The leader leaves 400 ms after SIGTERM (the shell leaves at once), so the group is gone long before the 1.5 s SIGKILL timer;
    // the daemon holds the pipes, so `close` does not come. confirmMs = killGraceMs: whatever the timing, the old code's SIGKILL timer fires first.
    const command = leaderWithDaemon(t.dir, ready, `process.on("SIGTERM", () => setTimeout(() => process.exit(0), 400)); setTimeout(() => {}, 30000)`);
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: 1500, confirmMs: 1500, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 1500 + 1500 + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
    const spy = killSpy();
    const group = spy.watch(pgid);
    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(group.observedEsrch, "precondition: the product saw the group disappear").toBe(true);
    expect(after(group), "nothing, not even signal 0, goes to the group after its first ESRCH").toEqual([]);
    expect(exec.terminationUnconfirmed, "the group is gone: nothing to confirm").toBeUndefined();
  }, 30_000);

  it("close pending: the wait for `close` counts from the first sight of the disappearance, not from the SIGKILL timer", async () => {
    const t = makeTempDir("aiqh-b16r1-bound-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = leaderWithDaemon(t.dir, ready, `process.on("SIGTERM", () => setTimeout(() => process.exit(0), 400)); setTimeout(() => {}, 30000)`);
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: 1500, confirmMs: 1500, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 1500 + 1500 + SETTLE_MARGIN_MS, "the run"));
    await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
    const abortedAt = performance.now();
    controller.abort("SIGINT");
    await pending;
    const elapsed = performance.now() - abortedAt;
    // The group is gone after about 0.4 s and `confirmMs` is 1.5 s: about 1.9 s. Counted from the SIGKILL timer (1.5 s) it would be about 3.0 s.
    expect(elapsed).toBeLessThan(2600);
  }, 30_000);

  it("the first signal already got ESRCH (the leader and the group ended before the timeout): no SIGKILL, no probes afterwards", async () => {
    // Only what happens AFTER the first ESRCH is under test. That the first SIGTERM goes to a group that ended earlier is not
    // (ROADMAP: the first signal after a leader that ended before the timeout; the id may have been reused in between).
    const t = makeTempDir("aiqh-b16r1-c-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = leaderWithDaemon(t.dir, ready, `setTimeout(() => process.exit(0), 200)`);
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 1200, killGraceMs: 1500, confirmMs: 1500 });
    const controller = new AbortController();
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 1200 + 1500 + 1500 + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
    const group = killSpy().watch(pgid);
    const exec = await pending;
    expect(exec.timedOut).toBe(true);
    expect(group.observedEsrch, "precondition: the group had ended when the timeout came").toBe(true);
    expect(after(group)).toEqual([]);
  }, 30_000);

  it("terminateActiveChildren: a target seen gone is not probed or signalled again; a live target still gets its SIGKILL", async () => {
    const t1 = makeTempDir("aiqh-b16r1-d1-");
    cleanups.push(t1.cleanup);
    const t2 = makeTempDir("aiqh-b16r1-d2-");
    cleanups.push(t2.cleanup);
    const ready1 = path.join(t1.dir, "ready.pid");
    const ready2 = path.join(t2.dir, "ready.pid");
    const body = (ready: string, extra: string): string =>
      `${nodeEval(`${extra} require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`)}; true`;
    const c1 = new AbortController();
    const c2 = new AbortController();
    // target 1 ends on SIGTERM; target 2 ignores SIGTERM and stays until SIGKILL
    const run1 = executeCommand({ command: body(ready1, ""), cwd: t1.dir, timeoutMs: 20_000, signal: c1.signal });
    const run2 = executeCommand({ command: body(ready2, `process.on("SIGTERM", () => {});`), cwd: t2.dir, timeoutMs: 20_000, signal: c2.signal });
    cleanups.push(stopper(run2, () => c2.abort("clean-up"), 6000 + SETTLE_MARGIN_MS, "target 2"));
    cleanups.push(stopper(run1, () => c1.abort("clean-up"), 6000 + SETTLE_MARGIN_MS, "target 1"));
    const pgid1 = await waitReady(ready1, 8000, "target 1 was not ready within 8000 ms (overloaded machine?)");
    const pgid2 = await waitReady(ready2, 8000, "target 2 was not ready within 8000 ms (overloaded machine?)");
    const spy = killSpy();
    const g1 = spy.watch(pgid1);
    const g2 = spy.watch(pgid2);
    await terminateActiveChildren(600);
    await Promise.all([run1, run2]);
    expect(g1.observedEsrch, "precondition: target 1 was seen gone").toBe(true);
    expect(after(g1), "nothing goes to target 1 after its first ESRCH").toEqual([]);
    expect(g2.calls.map((c) => c.signal), "target 2 ignored SIGTERM and still got SIGKILL").toContain("SIGKILL");
    expect(g2.observedEsrch, "target 2 ended after the SIGKILL").toBe(true);
  }, 30_000);

  it("control: a group that is still alive after the grace period gets SIGKILL and is gone when the run settles", async () => {
    const t = makeTempDir("aiqh-b16r1-live-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(`process.on("SIGTERM", () => {}); require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`)}; true`;
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: 500, confirmMs: 1500, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 500 + 1500 + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the child was not ready within 8000 ms (overloaded machine?)");
    const realKill = process.kill.bind(process); // the spy below answers "alive" after the first ESRCH; the check at the end must not go through it
    const group = killSpy().watch(pgid);
    controller.abort("SIGINT");
    const exec = await pending;
    expect(group.calls.map((c) => c.signal)).toContain("SIGKILL");
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(() => realKill(-pgid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);

  it("control: `close` first and the group gone before the SIGKILL timer: settles when it is gone, no SIGKILL", async () => {
    const t = makeTempDir("aiqh-b16r1-b-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(`const fs = require("fs"); process.on("SIGTERM", () => setTimeout(() => process.exit(0), 400)); fs.writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 30000)`)}; true`;
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs: 1500, confirmMs: 1500, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 1500 + 1500 + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the child was not ready within 8000 ms (overloaded machine?)");
    const group = killSpy().watch(pgid);
    const abortedAt = performance.now();
    controller.abort("SIGINT");
    const exec = await pending;
    expect(performance.now() - abortedAt, "settled when the group was gone (about 0.4 s), not at the grace period").toBeLessThan(1400);
    expect(group.calls.map((c) => c.signal)).not.toContain("SIGKILL");
    expect(exec.terminationUnconfirmed).toBeUndefined();
  }, 30_000);
});
