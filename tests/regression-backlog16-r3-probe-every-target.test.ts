/**
 * Self-review S-1 of v0.5.35 (not an independent review; docs/reviews/backlog-16-2-19/response-r2.md, ROADMAP item 31):
 * terminateActiveChildren() asked "is any target alive?" with `some`, which stops at the first live target. While an earlier target
 * stayed alive, a later one was never probed during the grace period, so a later group that had already disappeared was never seen
 * gone and still got SIGKILL at the end of the grace period (its number may name an unrelated group by then). The CLI runs one check
 * at a time and is not affected; a library caller with several commands running is.
 *
 * process.kill is watched (recorded, then passed to the real kill) for the two groups under test; nothing is made up. Both commands
 * leave by themselves when their marker file disappears (the temp directories are removed in afterEach).
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCommand, terminateActiveChildren } from "../src/runner/execute.ts";
import { exitWhenRemoved, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

interface Call {
  signal: string | number;
  result: string;
}

/** Record every call to the watched groups (negative ids) with its result; every call goes to the real kill. */
function watchGroups(pgids: number[]): Map<number, Call[]> {
  const realKill = process.kill.bind(process);
  const calls = new Map<number, Call[]>(pgids.map((g) => [g, []]));
  const spy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    const list = pid < 0 ? calls.get(-pid) : undefined;
    if (list === undefined) return realKill(pid, signal);
    try {
      const r = realKill(pid, signal);
      list.push({ signal: signal ?? "SIGTERM", result: "ok" });
      return r;
    } catch (err) {
      list.push({ signal: signal ?? "SIGTERM", result: String((err as NodeJS.ErrnoException).code) });
      throw err;
    }
  });
  cleanups.push(() => spy.mockRestore());
  return calls;
}

/** Start one command (no timeout in reach, no abort): it records the shell's pid (= the group id) and stays until its marker is removed. */
async function start(prefix: string, extra: string): Promise<{ pgid: number; run: ReturnType<typeof executeCommand> }> {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const ready = path.join(t.dir, "ready.pid");
  const command = `${nodeEval(`${extra} require("fs").writeFileSync(${JSON.stringify(ready)}, String(process.ppid)); ${exitWhenRemoved(ready)} setTimeout(() => {}, 30000)`)}; true`;
  const controller = new AbortController();
  const run = executeCommand({ command, cwd: t.dir, timeoutMs: 20_000, signal: controller.signal });
  cleanups.push(stopper(run, () => controller.abort("clean-up"), 8000 + SETTLE_MARGIN_MS, prefix));
  const pgid = await waitReady(ready, 8000, `${prefix} was not ready within 8000 ms (overloaded machine?)`);
  return { pgid, run };
}

const IGNORES_SIGTERM = `process.on("SIGTERM", () => {});`;
const signals = (calls: Call[] | undefined, signal: string | number): Call[] => (calls ?? []).filter((c) => c.signal === signal);

describe("S-1: terminateActiveChildren probes every target during the grace period", () => {
  it("a later target that leaves on SIGTERM while an earlier one stays is probed, seen gone, and gets no SIGKILL", async () => {
    // Map order is the start order: the target that stays is first, the one that leaves is second.
    const stays = await start("aiqh-b16r3-s1-stays-", IGNORES_SIGTERM);
    const leaves = await start("aiqh-b16r3-s1-leaves-", "");
    const calls = watchGroups([stays.pgid, leaves.pgid]);
    // 1.5 s of grace: the later group is gone within milliseconds of its SIGTERM, long before the grace period ends.
    await terminateActiveChildren(1500);
    await Promise.all([stays.run, leaves.run]);
    const later = calls.get(leaves.pgid);
    expect(signals(later, "SIGTERM"), "precondition: the later target got its SIGTERM").toHaveLength(1);
    expect(signals(later, 0).map((c) => c.result), "the later target was probed and seen gone (ESRCH)").toContain("ESRCH");
    expect(signals(later, "SIGKILL"), "no SIGKILL to a group seen gone during the grace period").toEqual([]);
    expect(signals(calls.get(stays.pgid), "SIGKILL"), "the target that ignored SIGTERM still got SIGKILL").toHaveLength(1);
  }, 30_000);

  it("control: an earlier target that leaves on SIGTERM while a later one stays: the later one gets SIGKILL, the earlier one nothing after its ESRCH", async () => {
    const leaves = await start("aiqh-b16r3-s1c-leaves-", "");
    const stays = await start("aiqh-b16r3-s1c-stays-", IGNORES_SIGTERM);
    const calls = watchGroups([leaves.pgid, stays.pgid]);
    await terminateActiveChildren(1500);
    await Promise.all([leaves.run, stays.run]);
    const earlier = calls.get(leaves.pgid) ?? [];
    const firstEsrch = earlier.findIndex((c) => c.result === "ESRCH");
    expect(firstEsrch, "precondition: the earlier target was seen gone").toBeGreaterThanOrEqual(0);
    expect(earlier.slice(firstEsrch + 1), "nothing goes to the earlier target after its first ESRCH").toEqual([]);
    expect(signals(earlier, "SIGKILL")).toEqual([]);
    expect(signals(calls.get(stays.pgid), "SIGKILL"), "the later target ignored SIGTERM and got SIGKILL").toHaveLength(1);
  }, 30_000);
});
