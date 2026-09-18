/**
 * M1 — Python adapters: venv-relative commands (no activation), hints instead of installing.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { PYTHON_ADAPTERS } from "../src/adapters/python.ts";
import type { Detection } from "../src/adapters/types.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
function detectAll(fixture: string): Record<string, Detection | null> {
  const ctx = buildRepoContext(path.join(FIX, fixture));
  const out: Record<string, Detection | null> = {};
  for (const a of PYTHON_ADAPTERS) out[a.id] = a.detect(ctx);
  return out;
}

describe("Python adapters on the pytest-only venv fixture", () => {
  const d = detectAll("python-venv");
  it("unit: pytest through the venv python, targeting tests/", () => {
    expect(d["python-pytest"]?.status).toBe("available");
    expect(d["python-pytest"]?.suggestion?.command).toBe(".venv/bin/python -m pytest -q tests/");
  });
  it("lint / typecheck / dependency: unavailable with install hints that aiqh does not execute", () => {
    expect(d["python-ruff"]?.status).toBe("unavailable");
    expect(d["python-ruff"]?.enableHint).toMatch(/ruff/);
    expect(d["python-mypy"]?.status).toBe("unavailable");
    expect(d["python-pip-audit"]?.status).toBe("unavailable");
    expect(d["python-pip-audit"]?.enableHint).toMatch(/pip-audit/);
  });
  it("build: not applicable for Python", () => {
    expect(d["python-build"]?.status).toBe("unavailable");
    expect(d["python-build"]?.reason).toMatch(/build/i);
  });
  it("e2e: unavailable without playwright", () => {
    expect(d["python-playwright"]?.status).toBe("unavailable");
  });
});

describe("Python adapters on the fully equipped venv fixture", () => {
  const d = detectAll("python-full");
  it("suggests venv-relative module invocations", () => {
    expect(d["python-ruff"]?.suggestion?.command).toBe(".venv/bin/python -m ruff check .");
    expect(d["python-mypy"]?.suggestion?.command).toBe(".venv/bin/python -m mypy .");
    expect(d["python-pip-audit"]?.suggestion?.command).toBe(".venv/bin/python -m pip_audit");
    expect(d["python-pytest"]?.suggestion?.command).toBe(".venv/bin/python -m pytest -q tests/");
  });
  it("e2e: playwright in the venv and tests/e2e present", () => {
    expect(d["python-playwright"]?.status).toBe("available");
    expect(d["python-playwright"]?.suggestion?.command).toBe(".venv/bin/python -m pytest -q tests/e2e");
  });
});

describe("Python adapters outside a Python project", () => {
  it("return null", () => {
    const d = detectAll("node-vite");
    for (const det of Object.values(d)) expect(det).toBeNull();
  });
});
