/**
 * Backlog 8 (C group), O4 (docs/reviews/m2-2/response-r1.md): checkDirectory() in src/runner/execute.ts folded every failure of stat() into
 * "working directory does not exist". Since v0.5.29 (ADR-0022) the config load refuses a cwd that cannot be examined, so what reaches
 * here is a path that changed after the load (a check that changes permissions, replaces a directory, makes a symbolic link loop).
 * Only ENOENT is "does not exist" now; EACCES, ENOTDIR and ELOOP say that the directory cannot be examined, with the code. The check still
 * fails to start (exit 1 of verify, as for ENOENT): only the wording changes. Permission cases are skipped for root. The cases that are
 * not about O4 are controls: they pass before and after.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { fake, makeTempDir, nodeEval } from "./helpers.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(REPO_ROOT, "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function temp(): string {
  const t = makeTempDir("aiqh-b8c-o4-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Make `dir` impossible to traverse; it is restored first on cleanup (LIFO, before the temp dir is removed). */
function lock(dir: string): void {
  chmodSync(dir, 0o000);
  cleanups.push(() => chmodSync(dir, 0o755));
}

async function startIn(cwd: string): Promise<{ spawnError: string | null; exitCode: number | null }> {
  const r = await executeCommand({ command: "true", cwd, timeoutMs: 10_000 });
  return { spawnError: r.spawnError, exitCode: r.exitCode };
}

describe("backlog 8 O4: a working directory that cannot be examined is not 'does not exist'", () => {
  it.skipIf(isRoot)("below a directory that cannot be traversed (EACCES): 'cannot be examined (EACCES)' (before: 'does not exist')", async () => {
    const dir = temp();
    mkdirSync(path.join(dir, "sub", "inner"), { recursive: true });
    lock(path.join(dir, "sub"));
    const r = await startIn(path.join(dir, "sub", "inner"));
    expect(r.exitCode).toBeNull();
    expect(r.spawnError).toMatch(/^working directory cannot be examined: .*sub\/inner \(EACCES\)$/);
    expect(r.spawnError).not.toMatch(/does not exist/);
  });

  it("below a regular file (ENOTDIR): 'cannot be examined (ENOTDIR)'", async () => {
    const dir = temp();
    writeFileSync(path.join(dir, "afile"), "x");
    const r = await startIn(path.join(dir, "afile", "inner"));
    expect(r.exitCode).toBeNull();
    expect(r.spawnError).toMatch(/^working directory cannot be examined: .*afile\/inner \(ENOTDIR\)$/);
  });

  it("a symbolic link that loops (ELOOP): 'cannot be examined (ELOOP)'", async () => {
    const dir = temp();
    symlinkSync("loop", path.join(dir, "loop"));
    const r = await startIn(path.join(dir, "loop"));
    expect(r.exitCode).toBeNull();
    expect(r.spawnError).toMatch(/^working directory cannot be examined: .*loop \(ELOOP\)$/);
  });
});

describe("backlog 8 O4 controls: checkDirectory (pass before and after)", () => {
  it("a directory that does not exist (ENOENT): 'does not exist'", async () => {
    const dir = temp();
    const r = await startIn(path.join(dir, "missing"));
    expect(r.exitCode).toBeNull();
    expect(r.spawnError).toMatch(/^working directory does not exist: .*missing$/);
  });

  it("a path that is a regular file: 'is not a directory'", async () => {
    const dir = temp();
    writeFileSync(path.join(dir, "afile"), "x");
    const r = await startIn(path.join(dir, "afile"));
    expect(r.spawnError).toMatch(/^working directory is not a directory: .*afile$/);
  });

  it("a directory: the command runs", async () => {
    const dir = temp();
    const r = await startIn(dir);
    expect(r.spawnError).toBeNull();
    expect(r.exitCode).toBe(0);
  });
});

describe.skipIf(isRoot)("backlog 8 O4: through the real verify command (the path changes after the config load)", () => {
  /** Two checks: `first` (shell) changes the tree, `second` runs in `cwd`. Returns the exit code, the stdout and the report. */
  function verify(dir: string, first: string, cwd: string): { code: number | null; out: string; second: { status: string; errorSummary: string | null } } {
    const cfg = path.join(dir, "aiqh.config.jsonc");
    writeFileSync(
      cfg,
      JSON.stringify({
        version: 1,
        project: { name: "p" },
        checks: [
          { name: "first", kind: "lint", command: first },
          { name: "second", kind: "lint", command: nodeEval("process.exit(0)"), cwd },
        ],
      }),
    );
    const r = spawnSync(process.execPath, [CLI, "verify", "--config", cfg], { cwd: dir, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    const reportFile = path.join(dir, "artifacts", "verification", "latest.json");
    const report = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, "utf8")) as { checks: Array<{ name: string; status: string; errorSummary: string | null }> }) : { checks: [] };
    const second = report.checks.find((c) => c.name === "second") ?? { status: "(missing)", errorSummary: null };
    return { code: r.status, out: r.stdout, second };
  }

  it("a check that makes the directory untraversable: the second check FAILS to start (exit 1, as for ENOENT) with 'cannot be examined (EACCES)'", () => {
    const dir = temp();
    mkdirSync(path.join(dir, "sub", "inner"), { recursive: true });
    cleanups.push(() => chmodSync(path.join(dir, "sub"), 0o755)); // the check makes it 000 while verify runs
    const res = verify(dir, nodeEval('require("node:fs").chmodSync("sub", 0)'), "sub/inner");
    expect(res.code).toBe(1);
    expect(res.second.status).toBe("FAIL");
    expect(res.second.errorSummary).toMatch(/failed to start: working directory cannot be examined: .*sub\/inner \(EACCES\)/);
    expect(res.out).toMatch(/cannot be examined/);
    expect(res.out).not.toMatch(/working directory does not exist/);
  });

  it("control: a path that really is gone is still 'does not exist' (exit 1)", () => {
    const dir = temp();
    const res = verify(dir, nodeEval("process.exit(0)"), "missing");
    expect(res.code).toBe(1);
    expect(res.second.errorSummary).toMatch(/failed to start: working directory does not exist: .*missing/);
  });

  it("the new message goes through the output boundary: a secret-shaped name is masked and an ESC is written as notation", () => {
    const dir = temp();
    const esc = String.fromCodePoint(0x1b);
    const name = `inner-${fake("AKIA", "ABCDEFGHIJKLMNOP")}-${esc}x`;
    mkdirSync(path.join(dir, "sub", name), { recursive: true });
    cleanups.push(() => chmodSync(path.join(dir, "sub"), 0o755));
    const res = verify(dir, nodeEval('require("node:fs").chmodSync("sub", 0)'), `sub/${name}`);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/cannot be examined/);
    expect(res.out).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    expect(res.out).not.toContain(esc);
    expect(res.second.errorSummary).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
  });
});
