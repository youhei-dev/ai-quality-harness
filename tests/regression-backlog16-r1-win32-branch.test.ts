/**
 * Independent review R1 of v0.5.33, B16-R1-001: the Windows branch is not changed by "a group seen gone is not signalled again".
 * On Windows there is no process group to probe: groupAlive() answers false without having seen ESRCH, so nothing may be recorded as
 * "seen gone", and the SIGKILL after the grace period must still be sent (to the child's pid; the group path is skipped).
 *
 * A real Windows is not available, so the platform is set to "win32" for the run and node:child_process is replaced by a fake spawn
 * (the real one would start cmd.exe). process.kill is recorded and delivers nothing. This is a control: it passes before and after the fix.
 */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "./helpers.ts";

const fake = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: fake.spawn }));

import { executeCommand } from "../src/runner/execute.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.restoreAllMocks();
});

class FakeChild extends EventEmitter {
  pid = 4242;
  exitCode: number | null = null;
  signalCode: string | null = null;
  stdout = new PassThrough();
  stderr = new PassThrough();
  unref(): void {
    // nothing to release
  }
}

function setPlatform(value: NodeJS.Platform): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value, configurable: true });
  cleanups.push(() => {
    if (original !== undefined) Object.defineProperty(process, "platform", original);
  });
}

describe("B16-R1-001 control: the Windows branch keeps sending its signals", () => {
  it("win32: SIGTERM, then SIGKILL after the grace period, to the child's pid only; no group is probed or signalled", async () => {
    const t = makeTempDir("aiqh-b16r1-win-");
    cleanups.push(t.cleanup);
    const child = new FakeChild();
    fake.spawn.mockReturnValue(child);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    setPlatform("win32");
    const exec = await executeCommand({ command: "x", cwd: t.dir, timeoutMs: 50, killGraceMs: 200, confirmMs: 600 });
    expect(exec.timedOut).toBe(true);
    const calls = killSpy.mock.calls.map((c) => [c[0], c[1]]);
    expect(calls, "SIGTERM at the timeout and SIGKILL after the grace period, both to the pid; never a negative id (a group)").toEqual([
      [4242, "SIGTERM"],
      [4242, "SIGKILL"],
    ]);
    expect(exec.terminationUnconfirmed, "no group to confirm on Windows").toBeUndefined();
  }, 15_000);
});
