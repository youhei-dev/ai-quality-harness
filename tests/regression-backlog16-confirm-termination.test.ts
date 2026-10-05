/**
 * Backlog 16 / 2 (prototype): the clean-up of a terminated command is confirmed and bounded.
 *
 * Before: after SIGKILL the runner settled on the leader's `close` without checking that the group was gone, waited for the end of the
 * grace period when the group disappeared after `close`, and waited without any bound when a descendant outside the group kept the
 * pipes open (backlog 16). A kill that failed with EPERM settled the run at once as "spawn failed" while the process kept running
 * (backlog 2). Now the run settles when `close` has fired AND the group is gone, at the latest `confirmMs` after SIGKILL, and a group that
 * is still present at that point is reported as unconfirmed (`terminationUnconfirmed`), never as terminated and never as a spawn failure.
 *
 * Test construction: every trigger is an abort sent after the child's ready marker (never a sleep), every bound has a margin of
 * more than 1.5 s over the expected time, no pid read from a file is signalled, and a child cleans itself up when its marker file
 * disappears (the test's temp directory is removed in afterEach). EPERM is simulated in this process only (process.kill and
 * ChildProcess.prototype.kill); no signal is sent to anything else.
 */
import { ChildProcess } from "node:child_process";
import { chmodSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAFETY_VALVE_EXTRA_MS } from "../src/cli-signals.ts";
import { DEFAULT_CONFIRM_MS, DEFAULT_KILL_GRACE_MS, executeCommand } from "../src/runner/execute.ts";
import { toCheckResult } from "../src/runner/run-checks.ts";
import type { ExecutionResult, ResolvedCheck } from "../src/types.ts";
import { makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

/** JS for a child: leave when `file` disappears (the test's temp directory is removed in afterEach), so a failed test leaves nothing. */
function exitWhenRemoved(file: string): string {
  return `setInterval(() => { if (!require("fs").existsSync(${JSON.stringify(file)})) process.exit(0); }, 200);`;
}

const check = (command: string, cwd: string, timeoutSec: number): ResolvedCheck => ({
  name: "c",
  kind: "custom",
  command,
  cwd: ".",
  cwdAbsolute: cwd,
  required: true,
  timeoutSec,
});

/** The group ids the runner signalled (taken from its own process.kill calls, not from a file). */
function signalledGroups(spy: { mock: { calls: unknown[][] } }): number[] {
  return spy.mock.calls.filter((c) => typeof c[0] === "number" && c[0] < 0 && c[1] !== 0).map((c) => -(c[0] as number));
}

describe("backlog 16: the run settles when the group is gone, within a bound", () => {
  it("settles when the group disappears after the leader's close, not at the end of the grace period", async () => {
    const t = makeTempDir("aiqh-b16-slow-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    // The grandchild closes its stdio (the shell's `close` comes at once) and needs 400 ms to leave after SIGTERM.
    const command = `${nodeEval(
      `const fs = require("fs"); process.on("SIGTERM", () => setTimeout(() => process.exit(0), 400)); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); ${exitWhenRemoved(ready)} fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 30000)`,
    )}; true`;
    const killGraceMs = 4000;
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), killGraceMs + SETTLE_MARGIN_MS, "the run"));
    await waitReady(ready, 8000, "the grandchild was not ready within 8000 ms (overloaded machine?)");
    const abortedAt = performance.now();
    controller.abort("SIGINT");
    const exec = await pending;
    const elapsed = performance.now() - abortedAt;
    expect(exec.interruptedBy).toBe("SIGINT");
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(elapsed, "settled when the group was gone (about 0.4 s), not after the 4 s grace period").toBeLessThan(2500);
  }, 30_000);

  it("settles within the bound when a descendant outside the group keeps the pipes open", async () => {
    const t = makeTempDir("aiqh-b16-other-group-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const daemonUp = path.join(t.dir, "daemon.up");
    // The daemon is its own process group leader (detached), holds the stdout / stderr pipes, and lives at most 8 s.
    const daemonJs = `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(daemonUp)}, String(process.pid)); ${exitWhenRemoved(daemonUp)} setTimeout(() => process.exit(0), 8000)`;
    const command = `${nodeEval(
      `const { spawn } = require("child_process"); spawn(process.execPath, ["-e", ${JSON.stringify(daemonJs)}], { detached: true, stdio: "inherit" }).unref(); require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setTimeout(() => {}, 30000)`,
    )}; true`;
    const killGraceMs = 300;
    const confirmMs = 500;
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs, confirmMs, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), 10_000 + SETTLE_MARGIN_MS, "the run"));
    await waitReady(ready, 8000, "the grandchild was not ready within 8000 ms (overloaded machine?)");
    await waitReady(daemonUp, 8000, "the daemon was not ready within 8000 ms (overloaded machine?)");
    const abortedAt = performance.now();
    controller.abort("SIGINT");
    const exec = await pending;
    const elapsed = performance.now() - abortedAt;
    expect(exec.interruptedBy).toBe("SIGINT");
    // Our own group is gone; only a process outside it holds the pipes, so this is not "unconfirmed".
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(elapsed, "bounded by grace + confirm (about 0.9 s); before: until the daemon ended (8 s)").toBeLessThan(4000);
  }, 30_000);

  // A guard, not a reproduction: on v0.5.32 the result of this test is not deterministic (it failed in 2 of 2 full-file runs and
  // passed in 5 of 5 single runs: the group is gone a few ms after SIGKILL, and the old code settled right at SIGKILL). It guards that
  // the run keeps settling only when the group is gone.
  it("SIGKILL path: the group is gone when the run settles", async () => {
    const t = makeTempDir("aiqh-b16-sigkill-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(
      `const fs = require("fs"); process.on("SIGTERM", () => {}); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); ${exitWhenRemoved(ready)} fs.closeSync(1); fs.closeSync(2); setTimeout(() => {}, 30000)`,
    )}; true`;
    const killGraceMs = 300;
    const killSpy = vi.spyOn(process, "kill");
    cleanups.push(() => killSpy.mockRestore());
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), killGraceMs + SETTLE_MARGIN_MS, "the run"));
    await waitReady(ready, 8000, "the grandchild was not ready within 8000 ms (overloaded machine?)");
    controller.abort("SIGINT");
    const exec = await pending;
    const groups = signalledGroups(killSpy);
    expect(groups.length, "precondition: the runner signalled the group").toBeGreaterThan(0);
    expect(exec.terminationUnconfirmed).toBeUndefined();
    // Probe right away, no sleep: the group must already be gone when the promise settles.
    expect(() => process.kill(-groups[0]!, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);

  it("control: SIGTERM is enough -> settled at once, nothing unconfirmed, group gone", async () => {
    const t = makeTempDir("aiqh-b16-term-");
    cleanups.push(t.cleanup);
    const ready = path.join(t.dir, "ready.pid");
    const command = `${nodeEval(
      `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`,
    )}; true`;
    const killGraceMs = 4000;
    const killSpy = vi.spyOn(process, "kill");
    cleanups.push(() => killSpy.mockRestore());
    const controller = new AbortController();
    const pending = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, killGraceMs, signal: controller.signal });
    cleanups.push(stopper(pending, () => controller.abort("clean-up"), killGraceMs + SETTLE_MARGIN_MS, "the run"));
    await waitReady(ready, 8000, "the grandchild was not ready within 8000 ms (overloaded machine?)");
    const abortedAt = performance.now();
    controller.abort("SIGINT");
    const exec = await pending;
    const elapsed = performance.now() - abortedAt;
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(exec.spawnError).toBeNull();
    expect(elapsed).toBeLessThan(2500);
    const groups = signalledGroups(killSpy);
    expect(groups.length).toBeGreaterThan(0);
    expect(() => process.kill(-groups[0]!, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  }, 30_000);
});

describe("backlog 2: a kill that fails with EPERM does not end the run as a spawn failure", () => {
  function eperm(): NodeJS.ErrnoException {
    return Object.assign(new Error("kill EPERM"), { code: "EPERM", errno: -1, syscall: "kill" });
  }

  /**
   * Make every signal (not signal 0) to `leader` or its group fail with EPERM, in this process only: process.kill throws, and
   * ChildProcess.prototype.kill emits 'error' like Node does. Nothing is delivered; the restore is registered as a clean-up.
   */
  function simulateEperm(leader: number): void {
    const realKill = process.kill.bind(process);
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (signal !== undefined && signal !== 0 && (pid === leader || pid === -leader)) throw eperm();
      return realKill(pid, signal);
    });
    const childKill = vi.spyOn(ChildProcess.prototype, "kill").mockImplementation(function (this: ChildProcess) {
      if (this.pid === leader) {
        this.emit("error", eperm());
        return false;
      }
      return true;
    });
    cleanups.push(() => {
      childKill.mockRestore();
      killSpy.mockRestore();
    });
  }

  for (const trigger of ["timeout", "abort"] as const) {
    it(`${trigger}: settles within the bound, unconfirmed (EPERM), not as a spawn failure; the child is still running`, async () => {
      const t = makeTempDir("aiqh-b16-eperm-");
      cleanups.push(t.cleanup);
      const ready = path.join(t.dir, "ready.pid");
      // The child records its parent (the shell = the group leader) only to scope the simulation; it leaves when the marker is removed.
      const command = `${nodeEval(
        `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`,
      )}; true`;
      const killGraceMs = 200;
      const confirmMs = 300;
      const timeoutMs = trigger === "timeout" ? 3000 : 20_000;
      const controller = new AbortController();
      const pending = executeCommand({ command, cwd: t.dir, timeoutMs, killGraceMs, confirmMs, signal: controller.signal });
      cleanups.push(stopper(pending, () => controller.abort("clean-up"), timeoutMs + killGraceMs + confirmMs + SETTLE_MARGIN_MS, "the run"));
      const leader = await waitReady(ready, 2000, "the child was not ready within 2000 ms (overloaded machine?)");
      simulateEperm(leader);
      const started = performance.now();
      if (trigger === "abort") controller.abort("SIGINT");
      const exec = await pending;
      const elapsed = performance.now() - started;
      if (trigger === "abort") expect(exec.interruptedBy).toBe("SIGINT");
      else expect(exec.timedOut).toBe(true);
      expect(exec.spawnError).toBeNull();
      expect(exec.terminationUnconfirmed).toEqual({ waitedMs: confirmMs, killError: "EPERM" });
      // SIGTERM at the trigger, SIGKILL after the grace period, `confirmMs` of waiting; the trigger itself is the timeout (3 s) or the abort.
      expect(elapsed).toBeGreaterThanOrEqual((trigger === "timeout" ? timeoutMs - 500 : 0) + killGraceMs + confirmMs - 100);
      expect(elapsed).toBeLessThan((trigger === "timeout" ? timeoutMs : 0) + killGraceMs + confirmMs + 2500);
      // Nothing was delivered: the group is still there (the child leaves by itself once its marker is removed).
      expect(() => process.kill(-leader, 0)).not.toThrow();
      const result = toCheckResult(check(command, t.dir, timeoutMs / 1000), exec);
      expect(result.errorSummary).toContain("process group could not be signalled (EPERM) and was still present after 300ms");
      expect(result.errorSummary).not.toContain("failed to start");
      expect(result.errorSummary).not.toContain("process group terminated");
    }, 30_000);
  }

  it.skipIf(isRoot)("control: a real spawn failure (cwd that cannot be entered, EACCES) is still a spawn failure", async () => {
    const t = makeTempDir("aiqh-b16-spawn-");
    cleanups.push(t.cleanup);
    cleanups.push(() => chmodSync(t.dir, 0o700));
    chmodSync(t.dir, 0o000);
    const exec = await executeCommand({ command: "true", cwd: t.dir, timeoutMs: 5000 });
    expect(exec.spawnError).toMatch(/^spawn failed: .*EACCES/);
    expect(exec.terminationUnconfirmed).toBeUndefined();
    expect(exec.exitCode).toBeNull();
  }, 15_000);
});

describe("backlog 16: how the report words the end of the clean-up", () => {
  const base: ExecutionResult = {
    exitCode: null,
    signal: "SIGTERM",
    timedOut: true,
    interruptedBy: null,
    spawnError: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1,
  };
  const c = check("x", "/work", 3);

  it("control: a confirmed termination keeps the existing wording", () => {
    expect(toCheckResult(c, base).errorSummary).toBe("timed out after 3s (process group terminated)");
    expect(toCheckResult(c, { ...base, timedOut: false, interruptedBy: "SIGINT" }).errorSummary).toBe(
      "interrupted by SIGINT while running (process group terminated)",
    );
  });

  it("an unconfirmed termination says so (timed out; status stays FAIL)", () => {
    const r = toCheckResult(c, { ...base, terminationUnconfirmed: { waitedMs: 2000, killError: null } });
    expect(r.status).toBe("FAIL");
    expect(r.errorSummary).toBe("timed out after 3s (process group still present 2000ms after SIGKILL)");
  });

  it("an unconfirmed termination says so (interrupted; status stays SKIPPED, the timeout note is kept)", () => {
    const r = toCheckResult(c, { ...base, interruptedBy: "SIGINT", terminationUnconfirmed: { waitedMs: 2000, killError: null } });
    expect(r.status).toBe("SKIPPED");
    expect(r.errorSummary).toBe("interrupted by SIGINT while running (process group still present 2000ms after SIGKILL; timeout had already been reached)");
  });

  it("a signal that could not be delivered is named by its errno code only", () => {
    const r = toCheckResult(c, { ...base, terminationUnconfirmed: { waitedMs: 2000, killError: "EPERM" } });
    expect(r.errorSummary).toBe("timed out after 3s (process group could not be signalled (EPERM) and was still present after 2000ms)");
  });
});

// B16-R1-002: this pins a relation between CONSTANTS, nothing more. It does not guarantee that the report is written before the CLI's
// safety valve: the valve counts from the signal, the runner's confirmation from when the SIGKILL timer really ran (late under a
// stalled event loop), and the report is written after the runner returns. A stall of 1.5 s was measured to let the valve win.
describe("backlog 16: the default bound is shorter than the CLI safety valve (a relation between constants)", () => {
  it("default grace period + default confirmation < default grace period + safety valve", () => {
    expect(DEFAULT_KILL_GRACE_MS + DEFAULT_CONFIRM_MS).toBeLessThan(DEFAULT_KILL_GRACE_MS + SAFETY_VALVE_EXTRA_MS);
  });
});
