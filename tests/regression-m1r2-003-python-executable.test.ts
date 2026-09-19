/**
 * M1-R2-003 (R1-009 follow-up): the venv interpreter itself must be executable; no Python adapter
 * is available when <venv>/bin/python is not.
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
function venvProject(bins: Record<string, number>, dirs: string[]): { dir: string; d: Record<string, Detection | null> } {
  const t = makeTempDir("aiqh-r2-003-");
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

describe("M1-R2-003: non-executable venv python", () => {
  it("python 0644 + pytest 0755 → pytest unavailable, context has no python", () => {
    const { dir, d } = venvProject({ python: 0o644, pytest: 0o755 }, ["tests"]);
    expect(buildRepoContext(dir).python?.python ?? null).toBeNull();
    expect(d["python-pytest"]?.status).toBe("unavailable");
    expect(d["python-pytest"]?.suggestion).toBeUndefined();
  });
  it("python 0755 + pytest 0755 → available with the venv interpreter", () => {
    const { dir, d } = venvProject({ python: 0o755, pytest: 0o755 }, ["tests"]);
    expect(buildRepoContext(dir).python?.python).toBe(".venv/bin/python");
    expect(d["python-pytest"]?.status).toBe("available");
    expect(d["python-pytest"]?.suggestion?.command).toBe(".venv/bin/python -m pytest -q tests/");
  });
  it("ruff / mypy / pip-audit / playwright are not available either when python is not executable", () => {
    const { d } = venvProject({ python: 0o644, pytest: 0o755, ruff: 0o755, mypy: 0o755, "pip-audit": 0o755, playwright: 0o755 }, ["tests/e2e"]);
    for (const id of ["python-ruff", "python-mypy", "python-pip-audit", "python-playwright"]) {
      expect(d[id]?.status, id).toBe("unavailable");
      expect(d[id]?.suggestion, id).toBeUndefined();
    }
  });
});
