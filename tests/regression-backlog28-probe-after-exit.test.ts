/**
 * Backlog 28 (found in the v0.5.34 SP1, fixed in v0.5.38): when the leader ends first and `close` stays pending (a descendant in another
 * group holds the pipes), the process group can disappear long before the first signal, and its number can then name an unrelated group.
 * v0.5.37 did not probe the group before the timeout / interruption, so its first SIGTERM (and the SIGKILL after the grace period) went to
 * that number unchecked, and terminateActiveChildren() did the same. Now the group is probed every 25 ms from the leader's `exit` until
 * `close`, the escalation or the first ESRCH, so the disappearance is recorded (`gone`) when a probe runs before the number is reused.
 * A reuse before the next probe actually runs is not closed and not tested here: 25 ms is a timer setting, not an upper bound, and
 * event-loop delays add to it (ADR-0023, known limits; B28-R1-001, v0.5.39). These tests start the reuse 300 ms after the disappearance
 * and so assume that the product's next probe runs within that time; a longer event-loop stall is not covered.
 *
 * No real reuse is waited for: process.kill is replaced for the group under test and the leader's pid. The test watches the group with
 * the real kill (outside the replacement) and, REUSE_AFTER_MS after it saw the group gone, the number starts to answer like an unrelated
 * live group: signal 0 returns true, any other signal is recorded and delivered nowhere. A signal other than 0 recorded after that is a
 * violation. The leader is started with `exec`, so its pid is the group id; the member of the group leaves when the test removes its
 * marker; the daemon in another group holds the pipes and leaves when the temp directory is removed in afterEach.
 */
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand, terminateActiveChildren } from "../src/runner/execute.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

/** The real kill, taken before any test replaces it: the test's own probes never go through the replacement. */
const realKill = process.kill.bind(process);
/** How long after the test saw the group gone its number starts to answer as an unrelated group (12 probe intervals of the product). */
const REUSE_AFTER_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Call {
  target: "group" | "pid";
  signal: string | number;
  /** The number already named an unrelated group (or process) when the call was made. */
  reused: boolean;
  /** The product had already received ESRCH for the group. */
  afterEsrch: boolean;
}

interface Watch {
  calls: Call[];
  /** When the test saw the group gone (performance.now()), or null. */
  goneAt: () => number | null;
  /** The product received ESRCH for the group (before the reuse: afterwards the number answers "alive"). */
  productSawEsrch: () => boolean;
}

/** Replace process.kill for `-pgid` and `pgid` (the leader's pid) and watch the group with the real kill every 5 ms until it is gone. */
function watchGroup(pgid: number): Watch {
  const calls: Call[] = [];
  let goneAt: number | null = null;
  let esrch = false;
  const detector = setInterval(() => {
    try {
      realKill(-pgid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") {
        goneAt = performance.now();
        clearInterval(detector);
      }
    }
  }, 5);
  cleanups.push(() => clearInterval(detector));
  const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    if (pid !== -pgid && pid !== pgid) return realKill(pid, signal);
    const call: Call = { target: pid < 0 ? "group" : "pid", signal: signal ?? "SIGTERM", reused: goneAt !== null && performance.now() >= goneAt + REUSE_AFTER_MS, afterEsrch: esrch };
    calls.push(call);
    if (call.reused) return true; // an unrelated group (or process) with the same number answers; nothing is delivered
    try {
      return realKill(pid, signal);
    } catch (err) {
      if (call.target === "group" && (err as NodeJS.ErrnoException).code === "ESRCH") esrch = true;
      throw err;
    }
  });
  cleanups.push(() => spy.mockRestore());
  return { calls, goneAt: () => goneAt, productSawEsrch: () => esrch };
}

const toReused = (w: Watch): string[] => w.calls.filter((c) => c.reused && c.signal !== 0).map((c) => `${c.target}:${String(c.signal)}`);
const afterEsrch = (w: Watch): string[] => w.calls.filter((c) => c.afterEsrch).map((c) => `${c.target}:${String(c.signal)}`);

/** Wait until `done()` holds, polling every 10 ms; a precondition fails (never a skip) after `ms`. */
async function until(done: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = performance.now() + ms;
  while (!done()) {
    if (performance.now() >= deadline) throw new Error(`precondition: ${what} within ${ms} ms (overloaded machine?)`);
    await sleep(10);
  }
}

/** True once the leader's pid answers ESRCH: Node has reaped the leader, so the product has seen its `exit`. */
function leaderReaped(pid: number): boolean {
  try {
    realKill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/** JS of a daemon in another group that holds the stdout / stderr pipes (so `close` does not come); it leaves when its marker disappears. */
function daemonJs(up: string): string {
  return `require("fs").writeFileSync(${JSON.stringify(up)}, String(process.pid)); ${exitWhenRemoved(up)} setTimeout(() => process.exit(0), 20000)`;
}

/** JS of a member of the group that outlives the leader; it leaves within 20 ms of the removal of `run` (or on SIGTERM). */
function memberJs(run: string): string {
  return `setInterval(() => { if (!require("fs").existsSync(${JSON.stringify(run)})) process.exit(0); }, 20); setTimeout(() => process.exit(0), 20000)`;
}

interface RunOptions {
  /** A daemon in another group holds the pipes, so `close` does not come after the group is gone. */
  daemon: boolean;
  timeoutMs: number;
  killGraceMs: number;
  confirmMs: number;
}

/**
 * Start a leader that starts a member of its group (and, with `daemon`, the daemon), writes its pid (the group id: `exec`) to `ready`
 * and exits at once. `endMember` removes the member's marker.
 */
async function startRun(prefix: string, options: RunOptions): Promise<{ pgid: number; pending: ReturnType<typeof executeCommand>; controller: AbortController; startedAt: number; endMember: () => void }> {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const ready = path.join(t.dir, "ready.pid");
  const run = path.join(t.dir, "member.run");
  writeFileSync(run, "");
  const daemon = options.daemon ? `spawn(process.execPath, ["-e", ${JSON.stringify(daemonJs(path.join(t.dir, "daemon.up")))}], { detached: true, stdio: "inherit" }).unref();` : "";
  const leader = `const { spawn } = require("child_process"); ${daemon} spawn(process.execPath, ["-e", ${JSON.stringify(memberJs(run))}], { stdio: "inherit" }).unref(); require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.pid)); process.exit(0)`;
  const controller = new AbortController();
  const { timeoutMs, killGraceMs, confirmMs } = options;
  const startedAt = performance.now();
  const pending = executeCommand({ command: `exec ${nodeEval(leader)}`, cwd: t.dir, timeoutMs, killGraceMs, confirmMs, signal: controller.signal });
  cleanups.push(stopper(pending, () => controller.abort("clean-up"), killGraceMs + confirmMs + SETTLE_MARGIN_MS, "the run"));
  const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
  return { pgid, pending, controller, startedAt, endMember: () => rmSync(run, { force: true }) };
}

/** Leader reaped, then the member ended; returns once the number answers as an unrelated group. */
async function groupGoneThenReused(pgid: number, watch: Watch, endMember: () => void): Promise<number> {
  await until(() => leaderReaped(pgid), 5000, "the leader was not reaped");
  endMember();
  await until(() => watch.goneAt() !== null, 5000, "the group did not disappear after its member was ended");
  const reuseAt = (watch.goneAt() ?? 0) + REUSE_AFTER_MS;
  await until(() => performance.now() >= reuseAt, 5000, "the reuse did not begin");
  return reuseAt;
}

describe("backlog 28: a group that disappeared after its leader exited is seen gone before its number is reused", () => {
  it("interruption after the reuse: no signal other than 0 reaches the number (before: SIGTERM, then SIGKILL)", async () => {
    const { pgid, pending, controller, endMember } = await startRun("aiqh-b28-abort-", { daemon: true, timeoutMs: 20_000, killGraceMs: 300, confirmMs: 500 });
    const watch = watchGroup(pgid);
    await groupGoneThenReused(pgid, watch, endMember);
    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(toReused(watch), "nothing but signal 0 goes to the number once it names another group").toEqual([]);
    expect(watch.productSawEsrch(), "the product recorded the disappearance before the reuse").toBe(true);
    expect(afterEsrch(watch), "nothing at all after the product's first ESRCH (B16-R1-001)").toEqual([]);
    expect(exec.terminationUnconfirmed, "the group is gone: nothing to confirm").toBeUndefined();
  }, 30_000);

  it("timeout after the reuse: no signal other than 0 reaches the number (before: SIGTERM at the timeout, then SIGKILL)", async () => {
    const timeoutMs = 3000;
    const { pgid, pending, startedAt, endMember } = await startRun("aiqh-b28-timeout-", { daemon: true, timeoutMs, killGraceMs: 300, confirmMs: 500 });
    const watch = watchGroup(pgid);
    const reuseAt = await groupGoneThenReused(pgid, watch, endMember);
    if (reuseAt > startedAt + timeoutMs - 100) throw new Error("precondition: the reuse began too close to the timeout (overloaded machine?)");
    const exec = await pending;
    expect(exec.timedOut).toBe(true);
    expect(toReused(watch), "nothing but signal 0 goes to the number once it names another group").toEqual([]);
    expect(watch.productSawEsrch(), "the product recorded the disappearance before the reuse").toBe(true);
    expect(afterEsrch(watch)).toEqual([]);
    expect(exec.terminationUnconfirmed).toBeUndefined();
  }, 30_000);

  it("terminateActiveChildren after the reuse: no signal other than 0 reaches the number (before: SIGTERM, then SIGKILL)", async () => {
    const { pgid, pending, controller, endMember } = await startRun("aiqh-b28-tac-", { daemon: true, timeoutMs: 20_000, killGraceMs: 300, confirmMs: 500 });
    const watch = watchGroup(pgid);
    await groupGoneThenReused(pgid, watch, endMember);
    await terminateActiveChildren(300);
    controller.abort("SIGINT");
    await pending;
    expect(toReused(watch), "nothing but signal 0 goes to the number once it names another group").toEqual([]);
    expect(watch.productSawEsrch()).toBe(true);
    expect(afterEsrch(watch)).toEqual([]);
  }, 30_000);
});

describe("backlog 28 controls (pass before and after)", () => {
  it("a command whose member outlives the leader and then ends: exit code 0, only signal 0 to the group, nothing after the run settled", async () => {
    const { pgid, pending, endMember } = await startRun("aiqh-b28-end-", { daemon: false, timeoutMs: 20_000, killGraceMs: 300, confirmMs: 500 });
    const watch = watchGroup(pgid);
    await until(() => leaderReaped(pgid), 5000, "the leader was not reaped");
    endMember();
    const exec = await pending;
    const settled = watch.calls.length;
    await sleep(200);
    expect(exec.exitCode).toBe(0);
    expect(exec.timedOut).toBe(false);
    expect(watch.calls.filter((c) => c.signal !== 0), "no signal other than 0").toEqual([]);
    expect(watch.calls.filter((c) => c.target === "pid"), "nothing at all to the leader's pid").toEqual([]);
    expect(afterEsrch(watch)).toEqual([]);
    expect(watch.calls.length, "no probe after the run settled (no timer is left)").toBe(settled);
  }, 30_000);

  it("a member still running at the timeout after the leader exited: the timeout's SIGTERM still reaches the group", async () => {
    const { pgid, pending } = await startRun("aiqh-b28-live-", { daemon: false, timeoutMs: 1500, killGraceMs: 3000, confirmMs: 1500 });
    const watch = watchGroup(pgid);
    await until(() => leaderReaped(pgid), 5000, "the leader was not reaped");
    const exec = await pending;
    expect(exec.timedOut).toBe(true);
    expect(watch.calls.filter((c) => c.target === "group" && !c.reused).map((c) => c.signal), "the member ends on SIGTERM").toContain("SIGTERM");
    expect(watch.calls.map((c) => c.signal)).not.toContain("SIGKILL");
    expect(toReused(watch)).toEqual([]);
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(() => realKill(-pgid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);
});
