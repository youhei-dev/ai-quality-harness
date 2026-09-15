/**
 * Regression tests for independent review R1 — R-005
 * (docs/reviews/m0/independent-review-r1.md). Symlink-aware root containment.
 * Test names carry the review ID so the "FAIL before fix / PASS after fix" record can be traced.
 * Dummy secrets are assembled at runtime with fake() (see CLAUDE.md).
 */
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/load.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function tempDir(): string {
  const t = makeTempDir("aiqh-r1-");
  cleanups.push(t.cleanup);
  return t.dir;
}

describe("R-005 resolveInsideRoot: symlink escape", () => {
  function project(config: Record<string, unknown>): string {
    const root = tempDir();
    const outside = tempDir();
    symlinkSync(outside, path.join(root, "link"));
    writeFileSync(path.join(root, "aiqh.config.jsonc"), JSON.stringify(config));
    return root;
  }
  const base = { version: 1, project: { name: "p" } };

  it("rejects checks[].cwd that is a symlink to a directory outside the root", () => {
    const root = project({ ...base, checks: [{ name: "a", kind: "lint", command: "true", cwd: "link" }] });
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(ConfigError);
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(/escapes the project root/);
  });

  it("rejects output.dir under a symlink to outside, even when the leaf does not exist yet", () => {
    const root = project({
      ...base,
      output: { dir: "link/not-created-yet/verification" },
      checks: [{ name: "a", kind: "lint", command: "true" }],
    });
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).toThrow(/escapes the project root/);
  });

  it("still accepts a symlink that stays inside the root", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "real"));
    symlinkSync(path.join(root, "real"), path.join(root, "alias"));
    writeFileSync(
      path.join(root, "aiqh.config.jsonc"),
      JSON.stringify({ ...base, checks: [{ name: "a", kind: "lint", command: "true", cwd: "alias" }] }),
    );
    expect(() => loadConfig(path.join(root, "aiqh.config.jsonc"))).not.toThrow();
  });
});
