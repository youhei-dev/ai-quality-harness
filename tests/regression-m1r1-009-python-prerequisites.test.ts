/**
 * M1-R1-009: the Python Playwright adapter requires pytest (its command runs pytest); venv binaries
 * count only when they are executable.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepoContext } from "../src/adapters/context.ts";
import { PYTHON_ADAPTERS } from "../src/adapters/python.ts";
import type { Detection } from "../src/adapters/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function venvProject(bins: Record<string, number>, dirs: string[] = []): { dir: string; d: Record<string, Detection | null> } {
  const t = makeTempDir("aiqh-r1-009-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, ".venv", "bin"), { recursive: true });
  writeFileSync(path.join(t.dir, ".venv", "pyvenv.cfg"), "home = /usr/bin\n");
  writeFileSync(path.join(t.dir, "requirements.txt"), "pytest\n");
  for (const [name, mode] of Object.entries(bins)) {
    const p = path.join(t.dir, ".venv", "bin", name);
    writeFileSync(p, "#!/bin/sh\nexit 0\n");
    chmodSync(p, mode);
  }
  for (const d of dirs) mkdirSync(path.join(t.dir, d), { recursive: true });
  const ctx = buildRepoContext(t.dir);
  const d: Record<string, Detection | null> = {};
  for (const a of PYTHON_ADAPTERS) d[a.id] = a.detect(ctx);
  return { dir: t.dir, d };
}

describe("M1-R1-009: Python adapter prerequisites", () => {
  it("python + playwright + tests/e2e but no pytest → e2e unavailable, hint mentions pytest", () => {
    const { d } = venvProject({ python: 0o755, playwright: 0o755 }, ["tests/e2e"]);
    expect(d["python-playwright"]?.status).toBe("unavailable");
    expect(d["python-playwright"]?.suggestion).toBeUndefined();
    expect(d["python-playwright"]?.enableHint ?? "").toMatch(/pytest/);
  });
  it("with pytest as well → available", () => {
    const { d } = venvProject({ python: 0o755, playwright: 0o755, pytest: 0o755 }, ["tests/e2e"]);
    expect(d["python-playwright"]?.status).toBe("available");
    expect(d["python-playwright"]?.suggestion?.command).toBe(".venv/bin/python -m pytest -q tests/e2e");
  });
  it("a non-executable pytest file does not count", () => {
    const { dir, d } = venvProject({ python: 0o755, pytest: 0o644 }, ["tests"]);
    expect(buildRepoContext(dir).python?.venvBin("pytest")).toBeNull();
    expect(d["python-pytest"]?.status).toBe("unavailable");
  });
});
