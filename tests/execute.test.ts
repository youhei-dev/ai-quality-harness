import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval, waitForPid } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function tempDir(): string {
  const t = makeTempDir();
  cleanups.push(t.cleanup);
  return t.dir;
}

describe("executeCommand", () => {
  it("captures stdout / stderr and exit code 0", async () => {
    const r = await executeCommand({
      command: nodeEval('console.log("out"); console.error("err")'),
      cwd: tempDir(),
      timeoutMs: 10_000,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("out");
    expect(r.stderr).toContain("err");
    expect(r.timedOut).toBe(false);
    expect(r.spawnError).toBeNull();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(r.startedAt).getTime()).not.toBeNaN();
  });

  it("reports non-zero exit codes", async () => {
    const r = await executeCommand({ command: nodeEval("process.exit(7)"), cwd: tempDir(), timeoutMs: 10_000 });
    expect(r.exitCode).toBe(7);
    expect(r.spawnError).toBeNull();
  });

  it("runs through the shell so pipes and && work", async () => {
    const r = await executeCommand({
      command: `${nodeEval('console.log("a\\nb")')} | wc -l && echo joined`,
      cwd: tempDir(),
      timeoutMs: 10_000,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("joined");
  });

  it("uses the given working directory", async () => {
    const dir = tempDir();
    const r = await executeCommand({
      command: nodeEval("console.log(process.cwd())"),
      cwd: dir,
      timeoutMs: 10_000,
    });
    expect(r.exitCode).toBe(0);
    // macOS may resolve /var -> /private/var; compare realpath-insensitively via basename.
    expect(r.stdout.trim().endsWith(path.basename(dir))).toBe(true);
  });

  it("fails cleanly when the working directory does not exist", async () => {
    const r = await executeCommand({
      command: "true",
      cwd: path.join(tempDir(), "missing"),
      timeoutMs: 10_000,
    });
    expect(r.spawnError).toMatch(/does not exist/);
    expect(r.exitCode).toBeNull();
  });

  it("treats a missing executable as a failed check (shell exit 127)", async () => {
    const r = await executeCommand({
      command: "definitely-not-a-real-command-aiqh-42",
      cwd: tempDir(),
      timeoutMs: 10_000,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.exitCode).not.toBeNull();
  });

  it("times out and kills the whole process group, including grandchildren", async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    // `; true` forces the shell to fork node as a grandchild instead of exec-ing it.
    const command = `${nodeEval(
      `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 30000)`,
    )}; true`;

    const started = Date.now();
    const r = await executeCommand({ command, cwd: dir, timeoutMs: 800, killGraceMs: 500 });
    const elapsed = Date.now() - started;

    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    expect(existsSync(pidFile)).toBe(true);

    // M2-1: never pass an empty / half-written pid file (Number("") = 0) to process.kill.
    const grandchildPid = await waitForPid(pidFile, 2000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  });

  it("keeps only the tail when output exceeds the cap", async () => {
    const r = await executeCommand({
      command: nodeEval('for (let i = 0; i < 2000; i++) console.log("line-" + i)'),
      cwd: tempDir(),
      timeoutMs: 10_000,
      maxOutputBytes: 4096,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(4096 + 64);
    expect(r.stdout).toContain("line-1999");
    expect(r.stdout).not.toContain("line-0\n");
  });
});
