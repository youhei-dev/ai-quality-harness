/**
 * M1 — resolution of detections per category and the built-in security adapter.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { resolveDetections } from "../src/adapters/index.ts";
import { CATEGORY_KINDS } from "../src/types.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");

describe("resolveDetections", () => {
  it("covers all seven categories and marks missing ones unavailable", () => {
    const r = resolveDetections(buildRepoContext(path.join(FIX, "node-vite")));
    for (const kind of CATEGORY_KINDS) expect(r.byKind[kind]).toBeDefined();
    expect(r.byKind.typecheck.chosen?.suggestion?.command).toBe("npx --no-install tsc -b");
    expect(r.byKind.lint.chosen).toBeNull();
    expect(r.byKind.lint.unavailable.length).toBeGreaterThan(0);
    expect(r.byKind.e2e.chosen).toBeNull();
  });
  it("security is always available in a git repository (built-in scanner), required by default", () => {
    const r = resolveDetections(buildRepoContext(path.resolve(import.meta.dirname, "..")));
    expect(r.byKind.security.chosen?.adapter).toBe("builtin-security");
    expect(r.byKind.security.chosen?.suggestion?.command).toBe("aiqh security-scan");
    expect(r.byKind.security.chosen?.suggestion?.required ?? true).toBe(true);
  });
  it("security is unavailable outside a git repository", () => {
    const r = resolveDetections(buildRepoContext(path.join(FIX, "empty")));
    expect(r.byKind.security.chosen).toBeNull();
    expect(r.projectType).toBe("other");
  });
  it("reports the project type", () => {
    expect(resolveDetections(buildRepoContext(path.join(FIX, "node-vite"))).projectType).toBe("node");
    expect(resolveDetections(buildRepoContext(path.join(FIX, "python-venv"))).projectType).toBe("python");
  });
  it("context refuses to read .env files even when asked", () => {
    const ctx = buildRepoContext(path.join(FIX, "node-vite"));
    expect(ctx.readText(".env")).toBeNull();
    expect(ctx.readText(".env.local")).toBeNull();
    expect(ctx.readText("package.json")).not.toBeNull();
  });
});
