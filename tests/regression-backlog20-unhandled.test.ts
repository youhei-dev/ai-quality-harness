/**
 * Backlog 20 (the minimal version, wave 1): an exception or a promise rejection that nothing handled ended the CLI through Node's
 * default handler: the raw message and the source line on standard error (not through the output boundary, so not masked), exit 1,
 * and the running checks left behind in their own process groups. v0.5.42 handles both at the top of src/cli.ts (ADR-0024): one line
 * through the output boundary, no new check, the running groups terminated through terminateActiveChildren, exit 2. If a signal had
 * interrupted the run first, the signal path keeps its exit code (130 / 143); a second exception, or a signal after the first
 * exception, changes nothing.
 *
 * The exception is raised inside the real CLI by a module preloaded with Node's --import, written into the test's temporary
 * directory (nothing in src/ exists for the test). Once the check has written its pid (or once the report is written), it throws
 * from a timer or rejects a promise. Before the fix every case ends with exit 1 (the record of the failure before the fix), the
 * secret in the message is printed raw, and the check outlives the CLI until the test's directory is removed.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_KILL_GRACE_MS } from "../src/runner/execute.ts";
import { assertSignalablePid, exitWhenRemoved, fake, makeTempDir, nodeEval, runCleanups, SETTLE_MARGIN_MS, stopper, waitReady } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
/** The CLI's own bound on its exit after the first exception or a signal: the grace period, then its safety valve 3 s later (src/cli.ts). */
const CLI_EXIT_BOUND_MS = DEFAULT_KILL_GRACE_MS + 3_000;
/** A secret-shaped value in the thrown message: the line must come out masked. */
const SECRET = fake("AKIA", "ABCDEFGHIJKLMNOP");

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  await runCleanups(cleanups);
});

type Trigger = "throw" | "reject" | "throw-twice" | "throw-then-sigint" | "sigint-then-throw" | "throw-after-report";

function alive(pid: number): boolean {
  assertSignalablePid(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether the check's process is gone within `ms` (the pid was recorded by the check itself while the CLI ran it). */
async function goneWithin(pid: number | null, ms: number): Promise<boolean> {
  if (pid === null) throw new Error("precondition: the check's pid was not recorded");
  const deadline = Date.now() + ms;
  while (alive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  return !alive(pid);
}

/** The preloaded module: raise the exception inside the CLI process at the point the trigger names. */
function preloadSource(trigger: Trigger, pidFile: string, reportFile: string): string {
  return `import { existsSync, readFileSync } from "node:fs";
const trigger = ${JSON.stringify(trigger)};
const message = ${JSON.stringify(`boom ${SECRET}`)};
const raise = () => { throw new Error(message); };
const ready = () => {
  if (trigger === "throw-after-report") return existsSync(${JSON.stringify(reportFile)});
  try { return /^[0-9]+$/.test(readFileSync(${JSON.stringify(pidFile)}, "utf8")); } catch { return false; }
};
if (trigger === "sigint-then-throw") {
  process.on("SIGINT", () => setTimeout(raise, 20));
} else {
  const timer = setInterval(() => {
    if (!ready()) return;
    clearInterval(timer);
    if (trigger === "reject") { void Promise.reject(new Error(message)); return; }
    if (trigger === "throw-twice") setTimeout(() => { throw new Error("second " + message); }, 10);
    if (trigger === "throw-then-sigint") setImmediate(() => process.kill(process.pid, "SIGINT"));
    raise();
  }, 25);
}
`;
}

interface Run {
  code: number | null;
  stderr: string;
  stdout: string;
  checkPid: number | null;
}

async function runCli(trigger: Trigger): Promise<Run> {
  const t = makeTempDir("aiqh-b20-");
  cleanups.push(t.cleanup);
  const pidFile = path.join(t.dir, "check.pid");
  const reportFile = path.join(t.dir, "artifacts", "verification", "latest.json");
  const preload = path.join(t.dir, "preload.mjs");
  writeFileSync(preload, preloadSource(trigger, pidFile, reportFile));
  // The check records its pid and waits ("; true" makes the shell fork node, so the pid is not the group leader's); it leaves by
  // itself within 200 ms once its pid file is removed with the directory (a check the CLI failed to stop does not live on).
  const waiting = `${nodeEval(`const fs=require("fs"); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${exitWhenRemoved(pidFile)} setTimeout(() => {}, 10000)`)}; true`;
  const command = trigger === "throw-after-report" ? "true" : waiting;
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "b20" }, checks: [{ name: "one", kind: "custom", command, timeoutSec: 30 }] }));

  const cli = spawn(process.execPath, ["--import", pathToFileURL(preload).href, CLI, "verify"], { cwd: t.dir, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  cli.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  cli.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<number | null>((resolve) => cli.on("exit", (code) => resolve(code)));
  cleanups.push(stopper(exited, () => cli.kill("SIGTERM"), CLI_EXIT_BOUND_MS + SETTLE_MARGIN_MS, "the CLI", () => cli.kill("SIGKILL")));

  let checkPid: number | null = null;
  if (trigger !== "throw-after-report") {
    checkPid = await waitReady(pidFile, 8000, "the check did not write its pid within 8000 ms (overloaded machine?)");
    if (trigger === "sigint-then-throw") {
      await new Promise((r) => setTimeout(r, 100));
      cli.kill("SIGINT");
    }
  }
  const code = await exited;
  return { code, stderr, stdout, checkPid };
}

const errorLines = (r: Run): string[] => r.stderr.split("\n").filter((l) => l.startsWith("aiqh: unexpected error: "));

describe("backlog 20: an exception nothing handled ends the CLI with exit 2, through the output boundary, after the clean-up", () => {
  for (const trigger of ["throw", "reject"] as const) {
    it(`${trigger === "throw" ? "an exception from a timer" : "a rejected promise"} while a check runs: exit 2, one masked line, the check is gone`, async () => {
      const r = await runCli(trigger);
      expect(r.code).toBe(2);
      expect(errorLines(r)).toEqual(["aiqh: unexpected error: boom [REDACTED:aws]"]);
      expect(r.stderr).toContain("VERIFY ERROR (internal error)");
      expect(r.stderr + r.stdout).not.toContain(SECRET);
      expect(await goneWithin(r.checkPid, 2000), "the check's process is gone after the CLI exited").toBe(true);
    }, 20_000);
  }

  it("a second exception while the first is handled: still exit 2, one line, the check is gone", async () => {
    const r = await runCli("throw-twice");
    expect(r.code).toBe(2);
    expect(errorLines(r)).toEqual(["aiqh: unexpected error: boom [REDACTED:aws]"]);
    expect(r.stderr + r.stdout).not.toContain(SECRET);
    expect(await goneWithin(r.checkPid, 2000)).toBe(true);
  }, 20_000);

  it("a SIGINT after the exception changes nothing: exit 2, the signal is not taken as an interruption", async () => {
    const r = await runCli("throw-then-sigint");
    expect(r.code).toBe(2);
    expect(errorLines(r)).toEqual(["aiqh: unexpected error: boom [REDACTED:aws]"]);
    expect(r.stderr).not.toContain("received SIGINT");
    expect(await goneWithin(r.checkPid, 2000)).toBe(true);
  }, 20_000);

  it("an exception after a SIGINT: the interruption keeps its exit code 130, the line is still written, the check is gone", async () => {
    const r = await runCli("sigint-then-throw");
    expect(r.code).toBe(130);
    expect(r.stderr).toContain("received SIGINT");
    expect(errorLines(r)).toEqual(["aiqh: unexpected error: boom [REDACTED:aws]"]);
    expect(r.stderr + r.stdout).not.toContain(SECRET);
    expect(await goneWithin(r.checkPid, 2000)).toBe(true);
  }, 20_000);

  it("an exception after the report was written (the verdict was fixed as PASSED): exit 2, never 0", async () => {
    const r = await runCli("throw-after-report");
    expect(r.stdout).toContain("VERIFY PASSED");
    expect(r.code).toBe(2);
    expect(errorLines(r)).toEqual(["aiqh: unexpected error: boom [REDACTED:aws]"]);
    expect(r.stderr).toContain("VERIFY ERROR (internal error)");
    expect(r.stderr + r.stdout).not.toContain(SECRET);
  }, 20_000);
});

