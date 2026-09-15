import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd: string): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function project(config: unknown): string {
  const tmp = makeTempDir();
  cleanups.push(tmp.cleanup);
  writeFileSync(path.join(tmp.dir, "aiqh.config.jsonc"), JSON.stringify(config, null, 2));
  return tmp.dir;
}

function readReport(root: string): VerificationReport {
  return JSON.parse(
    readFileSync(path.join(root, "artifacts", "verification", "latest.json"), "utf8"),
  ) as VerificationReport;
}

describe("aiqh verify (end-to-end)", () => {
  it("exits 0 and writes reports when all required checks pass", async () => {
    const root = project({
      version: 1,
      project: { name: "e2e-pass" },
      checks: [
        { name: "one", kind: "lint", command: nodeEval('console.log("ok")') },
        { name: "two", kind: "unit", command: nodeEval("process.exit(0)") },
      ],
    });
    const r = await runCli(["verify"], root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("VERIFY PASSED");
    expect(r.stdout).toContain("lint PASS");
    expect(r.stdout).toContain("e2e N/A");

    const report = readReport(root);
    expect(report.verdict).toBe("PASSED");
    expect(report.exitCode).toBe(0);
    expect(report.checks.map((c) => c.status)).toEqual(["PASS", "PASS"]);
    expect(report.categories.typecheck).toBe("NOT_APPLICABLE");
    expect(existsSync(path.join(root, "artifacts", "verification", "latest.md"))).toBe(true);
    expect(report.git).toBeNull();
  });

  it("exits 1 when a required check fails, still runs the rest, and masks secrets", async () => {
    const root = project({
      version: 1,
      project: { name: "e2e-fail" },
      checks: [
        { name: "first", kind: "lint", command: nodeEval('console.error("password=abc123"); process.exit(2)') },
        { name: "second", kind: "unit", command: nodeEval('console.log("still ran")') },
        { name: "opt", kind: "custom", command: nodeEval("process.exit(1)"), required: false },
      ],
    });
    const r = await runCli(["verify"], root);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("VERIFY FAILED");
    expect(r.stdout).toContain("required failed: 1 (first)");
    expect(r.stdout).toContain("optional failed: 1 (opt)");
    expect(r.stdout).not.toContain("abc123");
    expect(r.stdout).toContain("[REDACTED:key-value]");

    const report = readReport(root);
    expect(report.verdict).toBe("FAILED");
    expect(report.checks.map((c) => c.status)).toEqual(["FAIL", "PASS", "FAIL"]);
    expect(report.checks[1]?.stdoutTail).toContain("still ran");
    expect(JSON.stringify(report)).not.toContain("abc123");
    const md = readFileSync(path.join(root, "artifacts", "verification", "latest.md"), "utf8");
    expect(md).not.toContain("abc123");
  });

  it("--fail-fast skips later checks and the verdict stays FAILED", async () => {
    const root = project({
      version: 1,
      project: { name: "e2e-failfast" },
      checks: [
        { name: "first", kind: "lint", command: nodeEval("process.exit(1)") },
        { name: "second", kind: "unit", command: nodeEval('console.log("should not run")') },
      ],
    });
    const r = await runCli(["verify", "--fail-fast"], root);
    expect(r.code).toBe(1);
    const report = readReport(root);
    expect(report.checks.map((c) => c.status)).toEqual(["FAIL", "SKIPPED"]);
    expect(report.summary.requiredFailed).toBe(2);
  });

  it("exits 2 without writing a report when the config is invalid", async () => {
    const root = project({ version: 1, project: { name: "bad" }, checks: [] });
    const r = await runCli(["verify"], root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("config is invalid");
    expect(r.stderr).toContain("VERIFY FAILED");
    expect(existsSync(path.join(root, "artifacts"))).toBe(false);
  });

  it("exits 2 when the config file is missing", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const r = await runCli(["verify"], tmp.dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("config file not found");
  });

  it("honours --config and --output-dir", async () => {
    const root = project({
      version: 1,
      project: { name: "e2e-paths" },
      checks: [{ name: "one", kind: "build", command: nodeEval("process.exit(0)") }],
    });
    const elsewhere = makeTempDir();
    cleanups.push(elsewhere.cleanup);
    const r = await runCli(
      ["verify", "--config", path.join(root, "aiqh.config.jsonc"), "--output-dir", elsewhere.dir],
      elsewhere.dir,
    );
    expect(r.code).toBe(0);
    expect(existsSync(path.join(elsewhere.dir, "latest.json"))).toBe(true);
    expect(existsSync(path.join(root, "artifacts"))).toBe(false);
  });

  it("prints a version", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const r = await runCli(["--version"], tmp.dir);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
