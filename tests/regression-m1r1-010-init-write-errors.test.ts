/**
 * M1-R1-010: failures while updating .gitignore / package.json are reported as init errors
 * (exit 2, "aiqh init: failed to update …"), not as an internal error / rejected promise.
 */
import { chmodSync, cpSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function copyFixture(name: string): string {
  const t = makeTempDir("aiqh-r1-010-");
  cleanups.push(t.cleanup);
  cpSync(path.join(FIX, name), t.dir, { recursive: true });
  return t.dir;
}
async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}) {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("M1-R1-010: optional write errors", () => {
  it.skipIf(isRoot)("read-only .gitignore + --write-gitignore → exit 2 with an init-specific message", async () => {
    const dir = copyFixture("node-vite");
    chmodSync(path.join(dir, ".gitignore"), 0o444);
    const r = await init(dir, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*\.gitignore/);
    expect(r.output).not.toMatch(/internal error/);
    chmodSync(path.join(dir, ".gitignore"), 0o644);
  });
  it.skipIf(isRoot)("read-only package.json + --write-scripts → exit 2 with an init-specific message (no throw)", async () => {
    const dir = copyFixture("node-vite");
    chmodSync(path.join(dir, "package.json"), 0o444);
    const r = await init(dir, { writeScripts: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*package\.json/);
    expect(r.output).not.toMatch(/internal error/);
    chmodSync(path.join(dir, "package.json"), 0o644);
  });
});
