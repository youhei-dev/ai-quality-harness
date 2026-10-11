/**
 * Independent review R2 of v0.5.34, B16-R2-001 (docs/reviews/backlog-16-2-19/): once a process group was seen gone, killTree() skipped
 * the group branch but fell through to the direct signal to the leader's pid, whose only guards are the leader's `exitCode` and
 * `signalCode`. After the command's own clean-up had latched `gone` (the shared GroupState), terminateActiveChildren() reached that
 * direct signal. The R1 test spy watched negative ids only, so it could not see it.
 *
 * Here process.kill is replaced for the group under test and for the positive id with the same number (the leader's pid). The first
 * signal to the group answers ESRCH (made up: the real leader is still running, so its `exitCode` is still null, which is exactly the
 * state in which the old guard lets the direct signal through); from then on the group number answers like a live unrelated group
 * and the positive id answers like another process; nothing is delivered. Any call to either after the first ESRCH is a violation.
 *
 * The controls pass before and after the fix: a group send that fails with EPERM still falls back to the leader, and a group that
 * is signalled successfully never gets a direct signal. Every trigger is an abort or a direct call after a ready marker, and
 * children leave by themselves when their marker file disappears (the temp directory is removed in afterEach).
 * v0.5.38 (backlog 28): the last control's expectation changed from "no call at all" to "no signal other than 0, nothing to the
 * leader's pid": the group is now probed with signal 0 after the leader's `exit` (tests/regression-backlog28-probe-after-exit.test.ts).
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand, terminateActiveChildren } from "../src/runner/execute.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

type Mode =
  /** The first call to the group answers ESRCH (made up); afterwards the group and the leader's pid answer "alive". Nothing is delivered. */
  | "gone-on-first-group-signal"
  /** Every signal (not signal 0) to the group fails with EPERM; signals to the leader's pid are recorded and answer "delivered" (nothing is). */
  | "group-eperm"
  /** Everything is recorded and passed to the real kill. */
  | "passthrough";

interface Call {
  target: "group" | "pid";
  signal: string | number;
  afterGone: boolean;
}

/** The spy for process.kill. Only the group `-pgid` and the positive id `pgid` are watched; any other id passes through to the real kill. */
function watchKill(pgid: number, mode: Mode): { calls: Call[]; sawGone: () => boolean } {
  const realKill = process.kill.bind(process);
  const calls: Call[] = [];
  let gone = false;
  const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    const sig = signal ?? "SIGTERM";
    if (pid !== -pgid && pid !== pgid) return realKill(pid, signal);
    const target = pid < 0 ? "group" : "pid";
    calls.push({ target, signal: sig, afterGone: gone });
    if (mode === "passthrough") return realKill(pid, signal);
    if (mode === "group-eperm") {
      if (target === "pid") return true;
      if (sig === 0) return realKill(pid, signal);
      throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
    }
    if (gone) return true;
    if (target === "group") {
      gone = true;
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    }
    return realKill(pid, signal);
  });
  cleanups.push(() => spy.mockRestore());
  return { calls, sawGone: () => gone };
}

const sent = (calls: Call[], target: Call["target"]): Array<string | number> => calls.filter((c) => c.target === target).map((c) => c.signal);
const afterGone = (calls: Call[]): string[] => calls.filter((c) => c.afterGone).map((c) => `${c.target}:${String(c.signal)}`);

/** The command of a leader: writes the shell's pid (= the group id) to `ready`, leaves when `ready` disappears. `; true` keeps the shell as the leader. */
function leader(ready: string, extra = ""): string {
  return `${nodeEval(`${extra} require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`)}; true`;
}

/** A run of one leader that ends only when its marker is removed, plus the clean-up that stops it. */
async function startRun(
  prefix: string,
  extra: string,
  options: { killGraceMs: number; confirmMs: number },
): Promise<{ pgid: number; pending: ReturnType<typeof executeCommand>; controller: AbortController }> {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const ready = path.join(t.dir, "ready.pid");
  const controller = new AbortController();
  const pending = executeCommand({ command: leader(ready, extra), cwd: t.dir, timeoutMs: 20_000, ...options, signal: controller.signal });
  cleanups.push(stopper(pending, () => controller.abort("clean-up"), options.killGraceMs + options.confirmMs + SETTLE_MARGIN_MS, "the run"));
  const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
  return { pgid, pending, controller };
}

describe("B16-R2-001: nothing is sent to the leader of a group that was seen gone", () => {
  it("the CLI interrupt order (abort, then terminateActiveChildren): no signal to the group or to the leader after the first ESRCH", async () => {
    const { pgid, pending, controller } = await startRun("aiqh-b16r2-a-", "", { killGraceMs: 600, confirmMs: 800 });
    const watch = watchKill(pgid, "gone-on-first-group-signal");
    // src/cli.ts: interruption.abort() runs the command's onAbort synchronously (its SIGTERM sees the ESRCH), then terminateActiveChildren()
    controller.abort("SIGINT");
    await Promise.all([pending, terminateActiveChildren(600)]);
    expect(watch.sawGone(), "precondition: the product saw the group disappear").toBe(true);
    expect(afterGone(watch.calls), "nothing goes to the group (not even signal 0) or to the leader's pid after the first ESRCH").toEqual([]);
  }, 30_000);

  it("the opposite order (terminateActiveChildren sees the ESRCH first, then the command is aborted): same invariant", async () => {
    const { pgid, pending, controller } = await startRun("aiqh-b16r2-b-", "", { killGraceMs: 600, confirmMs: 800 });
    const watch = watchKill(pgid, "gone-on-first-group-signal");
    const terminating = terminateActiveChildren(600);
    controller.abort("SIGINT");
    await Promise.all([pending, terminating]);
    expect(watch.sawGone(), "precondition: the product saw the group disappear").toBe(true);
    expect(afterGone(watch.calls)).toEqual([]);
  }, 30_000);

  it("control: a group send that fails with EPERM still falls back to the leader (SIGTERM, then SIGKILL after the grace period)", async () => {
    const { pgid, pending, controller } = await startRun("aiqh-b16r2-eperm-", "", { killGraceMs: 500, confirmMs: 800 });
    const watch = watchKill(pgid, "group-eperm");
    controller.abort("SIGINT");
    const exec = await pending;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(sent(watch.calls, "pid"), "the leader is signalled directly each time the group cannot be").toEqual(["SIGTERM", "SIGKILL"]);
    expect(exec.terminationUnconfirmed, "nothing was delivered, so the group is still present").toBeDefined();
  }, 30_000);

  it("control: a group that is signalled successfully gets SIGTERM and no direct signal to the leader", async () => {
    const realKill = process.kill.bind(process); // the spy below must not answer the check at the end
    const { pgid, pending, controller } = await startRun("aiqh-b16r2-term-", "", { killGraceMs: 3000, confirmMs: 1500 });
    const watch = watchKill(pgid, "passthrough");
    controller.abort("SIGINT");
    const exec = await pending;
    expect(sent(watch.calls, "group")).toContain("SIGTERM");
    expect(sent(watch.calls, "group")).not.toContain("SIGKILL");
    expect(sent(watch.calls, "pid"), "no direct signal while the group send works").toEqual([]);
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(() => realKill(-pgid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);

  it("control: a group that ignores SIGTERM gets SIGKILL after the grace period, still without a direct signal", async () => {
    const realKill = process.kill.bind(process);
    const { pgid, pending, controller } = await startRun("aiqh-b16r2-kill-", `process.on("SIGTERM", () => {});`, { killGraceMs: 500, confirmMs: 1500 });
    const watch = watchKill(pgid, "passthrough");
    controller.abort("SIGINT");
    const exec = await pending;
    expect(sent(watch.calls, "group")).toContain("SIGKILL");
    expect(sent(watch.calls, "pid")).toEqual([]);
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(() => realKill(-pgid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);

  it("control: a command that ends by itself gets no signal other than 0 (changed in v0.5.38, backlog 28: before, no call at all)", async () => {
    const t = makeTempDir("aiqh-b16r2-exit-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(`require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); setTimeout(() => process.exit(0), 300)`)}; true`;
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 5000 + SETTLE_MARGIN_MS, "the run"));
    const pgid = await waitReady(ready, 8000, "the child was not ready within 8000 ms (overloaded machine?)");
    const watch = watchKill(pgid, "passthrough");
    const exec = await pending;
    expect(exec.exitCode).toBe(0);
    // v0.5.38 (backlog 28): after the leader's `exit`, the group is probed with signal 0 until `close`; nothing else is sent.
    expect(watch.calls.filter((c) => c.signal !== 0), "no signal other than 0").toEqual([]);
    expect(sent(watch.calls, "pid"), "nothing at all to the leader's pid").toEqual([]);
  }, 30_000);
});
