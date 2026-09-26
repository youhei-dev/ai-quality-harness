/**
 * Regression tests for independent review R3 — R3-002
 * (docs/reviews/m0/independent-review-r3.md). The real CLI is started as a child process with a
 * two-check config; SIGINT / SIGTERM is sent while check 1 runs. Afterwards: check 2 must not have
 * started, no descendant of check 1 may survive, the exit code is 130 / 143, and the output has no
 * "PASSED". This replaces the R2 test that called terminateActiveChildren() directly.
 * v0.5.8 (M2-2-R5-001): a CLI still running when the test fails or times out is stopped by the clean-up in afterEach,
 * before the project directory is removed; no pid read from a file is signalled any more (it may be reused).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_KILL_GRACE_MS } from "../src/runner/execute.ts";
import type { VerificationReport } from "../src/types.ts";
import { assertSignalablePid, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
/** The CLI's own bound on its exit after SIGINT / SIGTERM: the grace period, then its safety valve 3 s later (src/cli.ts). */
const CLI_EXIT_BOUND_MS = DEFAULT_KILL_GRACE_MS + 3_000;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

function alive(pid: number): boolean {
  assertSignalablePid(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!pred() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  return pred();
}

interface ScenarioOptions {
  /**
   * M2-1 (v0.3.5): when > 0, check 1 creates its pid file empty and writes the pid this many ms
   * later. This widens the window between file creation and write that a reader can fall into.
   */
  pidWriteDelayMs?: number;
}

function project(options: ScenarioOptions = {}): { dir: string; one: { started: string; pid: string }; two: { started: string; pid: string } } {
  const t = makeTempDir("aiqh-r3-cli-");
  cleanups.push(t.cleanup);
  const dir = t.dir;
  const one = { started: path.join(dir, "one.started"), pid: path.join(dir, "one.pid") };
  const two = { started: path.join(dir, "two.started"), pid: path.join(dir, "two.pid") };
  // check 1: marks start, records its pid, sleeps; dies on SIGTERM (default) -> the runner moves on quickly.
  // check 2: marks start, records its pid, ignores SIGTERM and lingers -> must never be started.
  // "; true" makes the shell fork node as a grandchild (separate pid from the group leader).
  const delay = options.pidWriteDelayMs ?? 0;
  const writePid =
    delay > 0
      ? `fs.writeFileSync(${JSON.stringify(one.pid)}, ""); setTimeout(() => fs.writeFileSync(${JSON.stringify(one.pid)}, String(process.pid)), ${delay});`
      : `fs.writeFileSync(${JSON.stringify(one.pid)}, String(process.pid));`;
  const oneCmd = `${nodeEval(
    `const fs=require("fs"); fs.writeFileSync(${JSON.stringify(one.started)}, "1"); ${writePid} setTimeout(() => {}, 10000)`,
  )}; true`;
  const twoCmd = `${nodeEval(
    `const fs=require("fs"); fs.writeFileSync(${JSON.stringify(two.started)}, "1"); process.on("SIGTERM", () => {}); fs.writeFileSync(${JSON.stringify(two.pid)}, String(process.pid)); setTimeout(() => {}, 8000)`,
  )}; true`;
  writeFileSync(
    path.join(dir, "aiqh.config.jsonc"),
    JSON.stringify({
      version: 1,
      project: { name: "r3-signal" },
      checks: [
        { name: "one", kind: "custom", command: oneCmd, timeoutSec: 30 },
        { name: "two", kind: "custom", command: twoCmd, timeoutSec: 30 },
      ],
    }),
  );
  return { dir, one, two };
}

async function runScenario(signal: "SIGINT" | "SIGTERM", options: ScenarioOptions = {}): Promise<{
  code: number | null;
  output: string;
  onePid: number;
  twoStarted: boolean;
  report: VerificationReport | null;
}> {
  const { dir, one, two } = project(options);
  const cli = spawn(process.execPath, [CLI, "verify"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  cli.stdout.on("data", (d: Buffer) => (output += d.toString()));
  cli.stderr.on("data", (d: Buffer) => (output += d.toString()));
  const exited = new Promise<number | null>((resolve) => cli.on("exit", (code) => resolve(code)));
  // M2-2-R5-001: if the test fails before the signal below, the clean-up sends the CLI SIGTERM through its handle (nothing
  // is sent once the CLI has been reaped) and waits for its exit; the CLI's own clean-up ends the checks and writes its
  // report before the project directory is removed. This relies on the CLI's SIGTERM handling (the path under test): if
  // that is broken, the SIGKILL and the clean-up error make it visible, and its checks may live out their own lifetime (at most 10 s).
  cleanups.push(stopper(exited, () => cli.kill("SIGTERM"), CLI_EXIT_BOUND_MS + SETTLE_MARGIN_MS, "the CLI", () => cli.kill("SIGKILL")));

  expect(await waitFor(() => existsSync(one.started), 8000), "precondition: check 1 did not start within 8000 ms (overloaded machine?)").toBe(true);
  // M2-1: wait for a valid pid, not for the file to exist (see the delayed-write case below).
  const onePid = await waitReady(one.pid, 8000, "check 1 did not write its pid within 8000 ms (overloaded machine?)");
  await new Promise((r) => setTimeout(r, 100));
  cli.kill(signal);

  const code = await exited;
  // give a possibly-started check 2 a moment to write its marker before we assert on it
  await new Promise((r) => setTimeout(r, 300));
  const reportPath = path.join(dir, "artifacts", "verification", "latest.json");
  const report = existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, "utf8")) as VerificationReport) : null;
  return { code, output, onePid, twoStarted: existsSync(two.started), report };
}

describe("R3-002 CLI signal handling cancels the pipeline", () => {
  for (const [signal, expectedCode] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    it(`${signal}: check 2 never starts, check 1's descendants are gone, exit ${expectedCode}, no PASSED`, async () => {
      const r = await runScenario(signal);
      expect(r.code).toBe(expectedCode);
      expect(r.twoStarted).toBe(false);
      expect(alive(r.onePid), `pid=${r.onePid}`).toBe(false);
      expect(r.output).not.toContain("PASSED");
      expect(r.output).not.toContain("VERIFY FAILED");
      expect(r.output).toContain("VERIFY ERROR");
      // the report is written with verdict ERROR, the signal name, and later checks SKIPPED
      expect(r.report).not.toBeNull();
      expect(r.report?.verdict).toBe("ERROR");
      expect(r.report?.interruptedBy).toBe(signal);
      expect(r.report?.exitCode).toBe(expectedCode);
      expect(r.report?.checks.map((c) => c.status)).toEqual(["SKIPPED", "SKIPPED"]);
      // R4-003: the check that never started must not be shown as started (no "$ <command>" line for it)
      expect(r.output).not.toMatch(/\$ .*two\.started/);
      expect(r.output).toContain("SKIPPED");
    }, 20_000);
  }

  // M2-1 (v0.3.5): the flaky failure at "descendants are gone" came from reading the pid file
  // between its creation and the write: Number("") = 0 and kill(0, 0) hits the test's own process
  // group, so alive() was true. The writer is kept non-atomic on purpose so this case keeps
  // exercising the reader's wait.
  it("pid file created empty and written later: the pid read is valid and the SIGTERM guarantees hold", async () => {
    const r = await runScenario("SIGTERM", { pidWriteDelayMs: 400 });
    expect(r.onePid).toBeGreaterThan(0);
    expect(r.code).toBe(143);
    expect(r.twoStarted).toBe(false);
    expect(alive(r.onePid), `pid=${r.onePid}`).toBe(false);
    expect(r.output).not.toContain("PASSED");
    expect(r.output).toContain("VERIFY ERROR");
    expect(r.report?.interruptedBy).toBe("SIGTERM");
  }, 20_000);
});
