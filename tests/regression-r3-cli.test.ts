/**
 * Regression tests for independent review R3 — R3-002
 * (docs/reviews/m0/independent-review-r3.md). The real CLI is started as a child process with a
 * two-check config; SIGINT / SIGTERM is sent while check 1 runs. Afterwards: check 2 must not have
 * started, no descendant of check 1 may survive, the exit code is 130 / 143, and the output has no
 * "PASSED". This replaces the R2 test that called terminateActiveChildren() directly.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function killIfAlive(pidFile: string): void {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8"));
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function alive(pid: number): boolean {
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

function project(): { dir: string; one: { started: string; pid: string }; two: { started: string; pid: string } } {
  const t = makeTempDir("aiqh-r3-cli-");
  const dir = t.dir;
  const one = { started: path.join(dir, "one.started"), pid: path.join(dir, "one.pid") };
  const two = { started: path.join(dir, "two.started"), pid: path.join(dir, "two.pid") };
  cleanups.push(() => {
    killIfAlive(one.pid);
    killIfAlive(two.pid);
    t.cleanup();
  });
  // check 1: marks start, records its pid, sleeps; dies on SIGTERM (default) -> the runner moves on quickly.
  // check 2: marks start, records its pid, ignores SIGTERM and lingers -> must never be started.
  // "; true" makes the shell fork node as a grandchild (separate pid from the group leader).
  const oneCmd = `${nodeEval(
    `const fs=require("fs"); fs.writeFileSync(${JSON.stringify(one.started)}, "1"); fs.writeFileSync(${JSON.stringify(one.pid)}, String(process.pid)); setTimeout(() => {}, 10000)`,
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

async function runScenario(signal: "SIGINT" | "SIGTERM"): Promise<{
  code: number | null;
  output: string;
  onePid: number;
  twoStarted: boolean;
  report: VerificationReport | null;
}> {
  const { dir, one, two } = project();
  const cli = spawn(process.execPath, [CLI, "verify"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  cli.stdout.on("data", (d: Buffer) => (output += d.toString()));
  cli.stderr.on("data", (d: Buffer) => (output += d.toString()));
  const exited = new Promise<number | null>((resolve) => cli.on("exit", (code) => resolve(code)));

  expect(await waitFor(() => existsSync(one.started) && existsSync(one.pid), 8000)).toBe(true);
  const onePid = Number(readFileSync(one.pid, "utf8"));
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
      expect(alive(r.onePid)).toBe(false);
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
});
