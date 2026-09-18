/**
 * Python adapters: ruff, mypy / pyright, pytest, pip-audit, Playwright. Commands call the venv
 * interpreter by relative path (no activation). Tools that are missing are reported with an
 * install hint; aiqh never installs them.
 */
import type { Adapter, Detection, RepoContext, Suggestion } from "./types.ts";

function py(ctx: RepoContext): string | null {
  return ctx.python?.venvDir ? `${ctx.python.venvDir}/bin/python` : null;
}
function noVenv(kind: Detection["kind"], id: string): Detection {
  return { kind, adapter: id, status: "unavailable", reason: "no virtual environment (.venv or venv with bin/python)", enableHint: "create one: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt" };
}
function suggestion(kind: Suggestion["kind"], name: string, command: string, timeoutSec: number, description: string): Suggestion {
  return { name, kind, command, timeoutSec, description };
}

function tool(id: string, kind: Detection["kind"], binary: string, moduleName: string, args: string, timeoutSec: number, description: string, hint: string, extraDetect?: (ctx: RepoContext) => string | null): Adapter {
  return {
    id,
    kind,
    detect(ctx) {
      if (!ctx.python) return null;
      const python = py(ctx);
      if (python === null) return noVenv(kind, id);
      const found = ctx.python.venvBin(binary);
      const configEvidence = extraDetect?.(ctx) ?? null;
      if (found !== null) {
        return { kind, adapter: id, status: "available", reason: `${found} found${configEvidence ? `; ${configEvidence}` : ""}`, suggestion: suggestion(kind, kind, `${python} -m ${moduleName} ${args}`.trim(), timeoutSec, description) };
      }
      return { kind, adapter: id, status: "unavailable", reason: `${binary} not installed in ${ctx.python.venvDir}${configEvidence ? ` (${configEvidence})` : ""}`, enableHint: `${python} -m pip install ${hint} — aiqh does not install it` };
    },
  };
}

export const pythonRuff = tool("python-ruff", "lint", "ruff", "ruff", "check .", 300, "Lint with ruff", "ruff", (ctx) => (ctx.python?.pyproject && /\[tool\.ruff/.test(ctx.python.pyproject) ? "[tool.ruff] in pyproject.toml" : ctx.exists("ruff.toml") || ctx.exists(".ruff.toml") ? "ruff.toml found" : null));
export const pythonMypy = tool("python-mypy", "typecheck", "mypy", "mypy", ".", 600, "Type check with mypy", "mypy");
export const pythonPyright = tool("python-pyright", "typecheck", "pyright", "pyright", "", 600, "Type check with pyright", "pyright");
export const pythonPipAudit = tool("python-pip-audit", "dependency", "pip-audit", "pip_audit", "", 300, "Known-vulnerability audit of installed packages (needs network access)", "pip-audit");

export const pythonPytest: Adapter = {
  id: "python-pytest",
  kind: "unit",
  detect(ctx) {
    if (!ctx.python) return null;
    const python = py(ctx);
    if (python === null) return noVenv("unit", this.id);
    const found = ctx.python.venvBin("pytest");
    const testsDir = ctx.exists("tests");
    if (found === null) {
      return { kind: "unit", adapter: this.id, status: "unavailable", reason: `pytest not installed in ${ctx.python.venvDir}`, enableHint: `${python} -m pip install pytest — aiqh does not install it` };
    }
    const target = testsDir ? " tests/" : "";
    return { kind: "unit", adapter: this.id, status: "available", reason: `${found} found${testsDir ? "; tests/ directory present" : ""}`, suggestion: suggestion("unit", "unit", `${python} -m pytest -q${target}`, 900, "Unit tests with pytest through the venv interpreter"), notes: testsDir ? ["only tests/ is targeted; test files elsewhere are not run"] : [] };
  },
};

export const pythonBuild: Adapter = {
  id: "python-build",
  kind: "build",
  detect(ctx) {
    if (!ctx.python) return null;
    return { kind: "build", adapter: this.id, status: "unavailable", reason: "Python projects have no build step (not applicable)" };
  },
};

export const pythonPlaywright: Adapter = {
  id: "python-playwright",
  kind: "e2e",
  detect(ctx) {
    if (!ctx.python) return null;
    const python = py(ctx);
    if (python === null) return noVenv("e2e", this.id);
    const notes = ["browsers are not installed by aiqh: run `<venv>/bin/python -m playwright install` yourself", "the application server must be started by the test setup; external APIs need test keys or mocks"];
    const found = ctx.python.venvBin("playwright");
    if (found !== null && ctx.exists("tests/e2e")) {
      return { kind: "e2e", adapter: this.id, status: "available", reason: `${found} found; tests/e2e present`, suggestion: { ...suggestion("e2e", "e2e", `${python} -m pytest -q tests/e2e`, 1200, "Playwright end-to-end tests via pytest"), required: false }, notes };
    }
    return { kind: "e2e", adapter: this.id, status: "unavailable", reason: found !== null ? "playwright installed but no tests/e2e directory" : `playwright not installed in ${ctx.python.venvDir}`, enableHint: `${python} -m pip install playwright pytest-playwright and add tests/e2e — aiqh does not install it`, notes };
  },
};

export const PYTHON_ADAPTERS: readonly Adapter[] = [pythonRuff, pythonMypy, pythonPyright, pythonPytest, pythonBuild, pythonPipAudit, pythonPlaywright];
