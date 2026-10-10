/**
 * Independent review R3 of v0.5.35, B16-R3-001 (docs/reviews/backlog-16-2-19/): when the signal to the group failed with something
 * other than ESRCH (EPERM, …) and the direct fallback to the leader's pid then found the leader gone (ESRCH), killTree() returned null
 * and dropped the group's errno. The group was still there (EPERM counts as alive), so the clean-up ended unconfirmed with
 * `killError: null` and the summary said "still present … after SIGKILL" instead of "could not be signalled (EPERM)". The property
 * dates from v0.5.33 (backlog 2). Only the diagnosis changes: status, verdict and exit code are the same either way.
 *
 * EPERM and the leader's ESRCH are simulated in this process only: process.kill is replaced for the group under test and for the
 * positive id with the same number (the leader's pid), and nothing is delivered to them. Signal 0 to the group passes through: the
 * group is really there. Every trigger is an abort or a timeout after a ready marker, and children leave by themselves when their
 * marker file disappears (the temp directory is removed in afterEach).
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { toCheckResult } from "../src/runner/run-checks.ts";
import type { ResolvedCheck } from "../src/types.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

type Mode =
  /** Every signal (not signal 0) to the group fails with EPERM; every signal to the leader's pid fails with ESRCH. Nothing is delivered. */
  | "group-eperm-leader-esrch"
  /** Every signal (not signal 0) to the group fails with EPERM; signals to the leader's pid answer "delivered" (nothing is). */
  | "group-eperm"
  /** The first signal to the group answers ESRCH (made up); afterwards the group and the leader's pid answer "alive". Nothing is delivered. */
  | "group-esrch";

interface Call {
  target: "group" | "pid";
  signal: string | number;
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`kill ${code}`), { code, errno: -1, syscall: "kill" });
}

/** The spy for process.kill. Only the group `-pgid` and the positive id `pgid` are watched; any other id passes through to the real kill. */
function watchKill(pgid: number, mode: Mode): Call[] {
  const realKill = process.kill.bind(process);
  const calls: Call[] = [];
  let gone = false;
  const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    const sig = signal ?? "SIGTERM";
    if (pid !== -pgid && pid !== pgid) return realKill(pid, signal);
    const target = pid < 0 ? "group" : "pid";
    calls.push({ target, signal: sig });
    if (mode === "group-esrch") {
      if (gone) return true;
      if (target === "group") {
        gone = true;
        throw errno("ESRCH");
      }
      return true;
    }
    if (target === "pid") {
      if (mode === "group-eperm-leader-esrch") throw errno("ESRCH");
      return true;
    }
    if (sig === 0) return realKill(pid, signal);
    throw errno("EPERM");
  });
  cleanups.push(() => spy.mockRestore());
  return calls;
}

const sent = (calls: Call[], target: Call["target"]): Array<string | number> =>
  calls.filter((c) => c.target === target && c.signal !== 0).map((c) => c.signal);

const check = (command: string, cwd: string, timeoutSec: number): ResolvedCheck => ({
  name: "c",
  kind: "custom",
  command,
  cwd: ".",
  cwdAbsolute: cwd,
  required: true,
  timeoutSec,
});

const KILL_GRACE_MS = 300;
const CONFIRM_MS = 400;

/** A run of one leader that stays until its marker is removed; `timeoutMs` is long unless the trigger is the timeout itself. */
async function startRun(prefix: string, timeoutMs: number) {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const ready = path.join(t.dir, "ready.pid");
  const command = `${nodeEval(`require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`)}; true`;
  const controller = new AbortController();
  const pending = executeCommand({ command, cwd: t.dir, timeoutMs, killGraceMs: KILL_GRACE_MS, confirmMs: CONFIRM_MS, signal: controller.signal });
  cleanups.push(stopper(pending, () => controller.abort("clean-up"), timeoutMs + KILL_GRACE_MS + CONFIRM_MS + SETTLE_MARGIN_MS, "the run"));
  const pgid = await waitReady(ready, 8000, "the leader was not ready within 8000 ms (overloaded machine?)");
  return { pgid, pending, controller, command, dir: t.dir };
}

describe("B16-R3-001: the group's errno is kept when the direct fallback finds the leader gone", () => {
  for (const trigger of ["abort", "timeout"] as const) {
    it(`${trigger}: group EPERM, leader ESRCH: unconfirmed with killError EPERM and "could not be signalled (EPERM)"`, async () => {
      // The timeout counts from the spawn and the spy goes in after the ready marker: 3 s leaves room for a slow start.
      const timeoutMs = trigger === "timeout" ? 3000 : 20_000;
      const run = await startRun(`aiqh-b16r3-errno-${trigger}-`, timeoutMs);
      const calls = watchKill(run.pgid, "group-eperm-leader-esrch");
      if (trigger === "abort") run.controller.abort("SIGINT");
      const exec = await run.pending;
      if (trigger === "abort") expect(exec.interruptedBy).toBe("SIGINT");
      else expect(exec.timedOut).toBe(true);
      expect(sent(calls, "group"), "precondition: SIGTERM and SIGKILL to the group both failed").toEqual(["SIGTERM", "SIGKILL"]);
      expect(sent(calls, "pid"), "precondition: each time the direct fallback was tried and found the leader gone").toEqual(["SIGTERM", "SIGKILL"]);
      expect(exec.terminationUnconfirmed).toEqual({ waitedMs: CONFIRM_MS, killError: "EPERM" });
      const result = toCheckResult(check(run.command, run.dir, timeoutMs / 1000), exec);
      expect(result.errorSummary).toContain(`process group could not be signalled (EPERM) and was still present after ${CONFIRM_MS}ms`);
      expect(result.status).toBe(trigger === "abort" ? "SKIPPED" : "FAIL");
    }, 30_000);
  }

  it("control: group EPERM, the direct signal to the leader is delivered: the leader is signalled directly and no errno is kept", async () => {
    const run = await startRun("aiqh-b16r3-errno-delivered-", 20_000);
    const calls = watchKill(run.pgid, "group-eperm");
    run.controller.abort("SIGINT");
    const exec = await run.pending;
    expect(sent(calls, "pid"), "the leader is signalled directly each time the group cannot be").toEqual(["SIGTERM", "SIGKILL"]);
    expect(exec.terminationUnconfirmed, "nothing was delivered, so the group is still present").toEqual({ waitedMs: CONFIRM_MS, killError: null });
  }, 30_000);

  it("control: group ESRCH: `gone` is latched, nothing more is sent and the leader gets no direct signal", async () => {
    const run = await startRun("aiqh-b16r3-errno-gone-", 20_000);
    const calls = watchKill(run.pgid, "group-esrch");
    run.controller.abort("SIGINT");
    const exec = await run.pending;
    expect(calls, "one SIGTERM to the group (answered ESRCH), then nothing at all").toEqual([{ target: "group", signal: "SIGTERM" }]);
    expect(exec.terminationUnconfirmed, "the group was seen gone: nothing to confirm").toBeUndefined();
  }, 30_000);
});
