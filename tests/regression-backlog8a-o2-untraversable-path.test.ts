/**
 * Backlog 8 (A group), O2 (docs/reviews/m2-2/response-r1.md): `realpathNearest()` took every lstat failure for "this entry does
 * not exist" and climbed to the parent, so a path behind a directory that cannot be traversed (or below a regular file) was
 * judged "inside the project" without looking at what is on it — a symbolic link there is never seen. Only ENOENT is "absent"
 * (the same rule as M2-2-R1-007); every other failure is a ConfigError, raised when the configuration is read, before any check runs.
 * The cases that are not about O2 (absent paths, a link that stays inside, a dangling link) are controls: they pass before and after.
 */
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import { ConfigError, loadConfig } from "../src/config/load.ts";
import { fake, makeTempDir, nodeEval } from "./helpers.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(prefix = "aiqh-b8a-o2-"): string {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  return t.dir;
}
/** Make `dir` impossible to traverse; the permission is restored first on cleanup (LIFO: after the temp dir's cleanup was pushed). */
function lockDir(dir: string, mode = 0o000): void {
  chmodSync(dir, mode);
  cleanups.push(() => chmodSync(dir, 0o755));
}

const base = { version: 1, project: { name: "p" } };
function write(root: string, config: Record<string, unknown>): string {
  const file = path.join(root, "aiqh.config.jsonc");
  writeFileSync(file, JSON.stringify(config));
  return file;
}
const check = { name: "a", kind: "lint", command: "node -e 0" };

describe("backlog 8 O2: a path that cannot be examined is not 'inside the project'", () => {
  it.skipIf(isRoot)("output.dir below a directory that cannot be traversed (EACCES) is a ConfigError", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "locked"));
    lockDir(path.join(root, "locked"));
    const file = write(root, { ...base, output: { dir: "locked/out" }, checks: [check] });
    expect(() => loadConfig(file)).toThrow(ConfigError);
    expect(() => loadConfig(file)).toThrow(/output\.dir cannot be resolved: \S*locked\/out cannot be examined \(EACCES\)/);
  });

  it.skipIf(isRoot)("checks[].cwd below a directory that cannot be traversed (EACCES) is a ConfigError", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "locked"));
    lockDir(path.join(root, "locked"));
    const file = write(root, { ...base, checks: [{ ...check, cwd: "locked/sub" }] });
    expect(() => loadConfig(file)).toThrow(/checks "a" cwd cannot be resolved: .*cannot be examined \(EACCES\)/);
  });

  it.skipIf(isRoot)("a symbolic link to the outside, behind a directory that cannot be traversed, is not accepted as inside", () => {
    const root = tempDir();
    const outside = tempDir("aiqh-b8a-o2-outside-");
    mkdirSync(path.join(root, "locked"));
    symlinkSync(outside, path.join(root, "locked", "link"));
    lockDir(path.join(root, "locked"));
    const file = write(root, { ...base, output: { dir: "locked/link/out" }, checks: [check] });
    expect(() => loadConfig(file)).toThrow(ConfigError);
  });

  it.skipIf(isRoot)("a readable but not searchable directory (r--) is the same", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "ro"));
    lockDir(path.join(root, "ro"), 0o444);
    const file = write(root, { ...base, output: { dir: "ro/out" }, checks: [check] });
    expect(() => loadConfig(file)).toThrow(/cannot be examined \(EACCES\)/);
  });

  // The decision point of the design: ENOTDIR is rejected too (only ENOENT is "absent", the rule of ADR-0010 / ADR-0015). Treating ENOTDIR as
  // absent would keep the behavior before the change for these two (a late exit 2 for output.dir, a check FAIL for cwd).
  it("output.dir below a regular file (ENOTDIR) is a ConfigError", () => {
    const root = tempDir();
    writeFileSync(path.join(root, "file.txt"), "x");
    const file = write(root, { ...base, output: { dir: "file.txt/out" }, checks: [check] });
    expect(() => loadConfig(file)).toThrow(/cannot be examined \(ENOTDIR\)/);
  });

  it("checks[].cwd below a regular file (ENOTDIR) is a ConfigError", () => {
    const root = tempDir();
    writeFileSync(path.join(root, "file.txt"), "x");
    const file = write(root, { ...base, checks: [{ ...check, cwd: "file.txt/sub" }] });
    expect(() => loadConfig(file)).toThrow(/cannot be examined \(ENOTDIR\)/);
  });

  it.skipIf(isRoot)("verify stops at the configuration: exit 2, 'configuration error', and no check is started", async () => {
    const root = tempDir();
    const marker = path.join(root, "marker.txt");
    mkdirSync(path.join(root, "locked"));
    lockDir(path.join(root, "locked"));
    write(root, {
      ...base,
      output: { dir: "locked/out" },
      checks: [{ name: "a", kind: "lint", command: nodeEval(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")`) }],
    });
    const lines: string[] = [];
    const code = await runVerify({ cwd: root, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("VERIFY ERROR (configuration error)");
    expect(existsSync(marker)).toBe(false); // the check never ran
  });

  it.skipIf(isRoot)("the message carries no raw control character and masks a secret-shaped name in the path", async () => {
    const root = tempDir(`aiqh-b8a-o2-${fake("AKIA", "ABCDEFGHIJKLMNOP")}-`);
    mkdirSync(path.join(root, "locked"));
    lockDir(path.join(root, "locked"));
    write(root, { ...base, output: { dir: "locked/out" }, checks: [check] });
    const lines: string[] = [];
    const code = await runVerify({ cwd: root, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(2);
    const output = lines.join("\n");
    expect(output).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
  });
});

describe("backlog 8 O2 controls (pass before and after)", () => {
  it("a not-yet-created output.dir is accepted (ENOENT is the one 'absent')", () => {
    const root = tempDir();
    const file = write(root, { ...base, output: { dir: "artifacts/not/yet" }, checks: [check] });
    expect(() => loadConfig(file)).not.toThrow();
  });

  it("a cwd that does not exist is accepted at load (CONFIG_SPEC 4, rule 7: that check FAILs when it runs)", async () => {
    const root = tempDir();
    const file = write(root, { ...base, checks: [{ ...check, cwd: "missing/sub" }] });
    expect(() => loadConfig(file)).not.toThrow();
    const lines: string[] = [];
    const code = await runVerify({ cwd: root, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(1);
  });

  it("a symbolic link that stays inside the root is accepted", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "real"));
    symlinkSync(path.join(root, "real"), path.join(root, "alias"));
    const file = write(root, { ...base, output: { dir: "alias/out" }, checks: [check] });
    expect(() => loadConfig(file)).not.toThrow();
  });

  it("a dangling symbolic link is still rejected", () => {
    const root = tempDir();
    symlinkSync(path.join(root, "nowhere"), path.join(root, "dang"));
    const file = write(root, { ...base, output: { dir: "dang/out" }, checks: [check] });
    expect(() => loadConfig(file)).toThrow(ConfigError);
  });
});
