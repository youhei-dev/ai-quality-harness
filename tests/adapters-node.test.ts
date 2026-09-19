/**
 * M1 — Node adapters detect tools and suggest commands; they never execute anything.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { NODE_ADAPTERS } from "../src/adapters/node.ts";
import type { Detection } from "../src/adapters/types.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
function detectAll(fixture: string): Record<string, Detection | null> {
  const ctx = buildRepoContext(path.join(FIX, fixture));
  const out: Record<string, Detection | null> = {};
  for (const a of NODE_ADAPTERS) out[a.id] = a.detect(ctx);
  return out;
}

describe("Node adapters on the Vite fixture (tsconfig references, no lint / test)", () => {
  const d = detectAll("node-vite");
  it("typecheck: tsc -b for a project-references tsconfig", () => {
    expect(d["node-tsc"]?.status).toBe("available");
    expect(d["node-tsc"]?.suggestion?.command).toBe("npx --no-install tsc -b");
    expect(d["node-tsc"]?.suggestion?.kind).toBe("typecheck");
  });
  it("build: reuses the build script", () => {
    expect(d["node-build"]?.suggestion?.command).toBe("npm run build");
  });
  it("lint / unit: unavailable with an enable hint, no command", () => {
    expect(d["node-eslint"]?.status).toBe("unavailable");
    expect(d["node-eslint"]?.enableHint).toMatch(/eslint/i);
    expect(d["node-eslint"]?.suggestion).toBeUndefined();
    expect(d["node-vitest"]?.status).toBe("unavailable");
    expect(d["node-jest"]?.status).toBe("unavailable");
  });
  it("dependency: npm audit because a package-lock.json exists", () => {
    expect(d["node-npm-audit"]?.suggestion?.command).toBe("npm audit --audit-level=high");
  });
  it("e2e: unavailable without playwright, with a template note", () => {
    expect(d["node-playwright"]?.status).toBe("unavailable");
    expect(d["node-playwright"]?.notes?.join(" ")).toMatch(/playwright/i);
  });
});

describe("Node adapters on the Next + Vitest + Playwright fixture", () => {
  const d = detectAll("node-next-vitest");
  it("prefers existing scripts", () => {
    expect(d["node-eslint"]?.suggestion?.command).toBe("npm run lint");
    expect(d["node-tsc"]?.suggestion?.command).toBe("npm run typecheck");
    expect(d["node-vitest"]?.suggestion?.command).toBe("npm run test");
    expect(d["node-build"]?.suggestion?.command).toBe("npm run build");
  });
  it("e2e: playwright config detected, browsers are not installed by aiqh", () => {
    expect(d["node-playwright"]?.status).toBe("available");
    expect(d["node-playwright"]?.suggestion?.command).toBe("npm run e2e");
    expect(d["node-playwright"]?.notes?.join(" ")).toMatch(/playwright install/);
  });
  it("every suggestion has a sane timeout and a description", () => {
    for (const det of Object.values(d)) {
      if (det?.suggestion) {
        expect(det.suggestion.timeoutSec).toBeGreaterThan(0);
        expect(det.suggestion.description?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe("Node adapters outside a Node project", () => {
  it("return null (not applicable) instead of unavailable", () => {
    const d = detectAll("python-venv");
    for (const det of Object.values(d)) expect(det).toBeNull();
  });
});
