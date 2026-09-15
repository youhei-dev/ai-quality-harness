/**
 * Regression tests for independent review R2 — R2-003
 * (docs/reviews/m0/independent-review-r2.md). Dangling symlinks in root containment.
 */
import { symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/load.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r2-cfg-");
  cleanups.push(t.cleanup);
  return t.dir;
}

const base = { version: 1, project: { name: "p" } };

function projectWithDanglingLink(target: string, config: Record<string, unknown>): string {
  const root = tempDir();
  symlinkSync(target, path.join(root, "link")); // target does not exist yet
  writeFileSync(path.join(root, "aiqh.config.jsonc"), JSON.stringify(config));
  return root;
}

describe("R2-003 resolveInsideRoot: dangling symlinks", () => {
  it("rejects cwd through a dangling symlink whose future target is outside the root", () => {
    const outside = path.join(tempDir(), "future");
    const root = projectWithDanglingLink(outside, {
      ...base,
      checks: [{ name: "a", kind: "lint", command: "true", cwd: "link/sub" }],
    });
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(ConfigError);
  });

  it("rejects cwd through a dangling symlink even when the future target is inside the root (fail-safe)", () => {
    const root = tempDir();
    symlinkSync(path.join(root, "future"), path.join(root, "link"));
    writeFileSync(
      path.join(root, "aiqh.config.jsonc"),
      JSON.stringify({ ...base, checks: [{ name: "a", kind: "lint", command: "true", cwd: "link" }] }),
    );
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(ConfigError);
  });

  it("rejects output.dir through a dangling symlink (outside target)", () => {
    const outside = path.join(tempDir(), "future");
    const root = projectWithDanglingLink(outside, {
      ...base,
      output: { dir: "link/verification" },
      checks: [{ name: "a", kind: "lint", command: "true" }],
    });
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(ConfigError);
  });

  it("rejects output.dir through a dangling symlink (inside target, fail-safe)", () => {
    const root = tempDir();
    symlinkSync(path.join(root, "future"), path.join(root, "link"));
    writeFileSync(
      path.join(root, "aiqh.config.jsonc"),
      JSON.stringify({ ...base, output: { dir: "link" }, checks: [{ name: "a", kind: "lint", command: "true" }] }),
    );
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(ConfigError);
  });

  it("still accepts a plain not-yet-created output.dir inside the root", () => {
    const root = tempDir();
    writeFileSync(
      path.join(root, "aiqh.config.jsonc"),
      JSON.stringify({ ...base, output: { dir: "artifacts/not/yet" }, checks: [{ name: "a", kind: "lint", command: "true" }] }),
    );
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).not.toThrow();
  });
});
