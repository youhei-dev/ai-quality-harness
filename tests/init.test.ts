/**
 * M1 — `aiqh init`: audit → proposal → --write / --force / --write-gitignore / --write-scripts.
 */
import { cpSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { loadConfig } from "../src/config/load.ts";
import { makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function copyFixture(name: string): string {
  const t = makeTempDir("aiqh-init-");
  cleanups.push(t.cleanup);
  cpSync(path.join(FIX, name), t.dir, { recursive: true });
  return t.dir;
}
async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}) {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}

describe("aiqh init (proposal only)", () => {
  it("prints the audit table and a config proposal without writing anything", async () => {
    const dir = copyFixture("node-vite");
    const r = await init(dir);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(false);
    expect(r.output).toContain("typecheck");
    expect(r.output).toContain("npx tsc -b");
    expect(r.output).toContain('"kind": "build"');
    // unavailable kinds are explained in comments, not configured
    expect(r.output).toMatch(/lint.*not detected|lint.*unavailable|NOT APPLICABLE/i);
    expect(r.output).not.toContain('"kind": "lint"');
    // proposals that are never written by default
    expect(r.output).toContain("artifacts/");
    expect(r.output).toContain('"verify": "aiqh verify"');
    // where aiqh was resolved from (PATH) is shown
    expect(r.output).toMatch(/aiqh (resolved|not found)/i);
  });

  it("does not write $schema when no schema file is resolvable from the target", async () => {
    const dir = copyFixture("node-vite");
    const r = await init(dir);
    expect(r.output).not.toContain('"$schema"');
  });
});

describe("aiqh init --write", () => {
  it("writes a loadable aiqh.config.jsonc with only the available checks", async () => {
    const dir = copyFixture("node-vite");
    const r = await init(dir, { write: true });
    expect(r.code).toBe(0);
    const file = path.join(dir, "aiqh.config.jsonc");
    expect(existsSync(file)).toBe(true);
    const cfg = loadConfig(file);
    expect(cfg.project.type).toBe("node");
    expect(cfg.checks.map((c) => c.kind).sort()).toEqual(["build", "dependency", "typecheck"].sort());
    expect(cfg.checks.find((c) => c.kind === "typecheck")?.command).toBe("npx tsc -b");
    expect(readFileSync(file, "utf8")).toContain("//");
  });

  it("includes the security check when the target is a git repository", async () => {
    const dir = copyFixture("node-vite");
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    await init(dir, { write: true });
    const cfg = loadConfig(path.join(dir, "aiqh.config.jsonc"));
    expect(cfg.checks.find((c) => c.kind === "security")?.command).toBe("aiqh security-scan");
    expect(cfg.checks.find((c) => c.kind === "security")?.required).toBe(true);
  });

  it("refuses to overwrite an existing config without --force (exit 2) and overwrites with --force", async () => {
    const dir = copyFixture("node-vite");
    expect((await init(dir, { write: true })).code).toBe(0);
    const before = readFileSync(path.join(dir, "aiqh.config.jsonc"), "utf8");
    const second = await init(dir, { write: true });
    expect(second.code).toBe(2);
    expect(second.output).toMatch(/already exists/);
    expect(readFileSync(path.join(dir, "aiqh.config.jsonc"), "utf8")).toBe(before);
    expect((await init(dir, { write: true, force: true })).code).toBe(0);
  });

  it("--write-gitignore appends artifacts/ once; --write-scripts adds only missing scripts", async () => {
    const dir = copyFixture("node-vite");
    await init(dir, { writeGitignore: true, writeScripts: true });
    const gi = readFileSync(path.join(dir, ".gitignore"), "utf8");
    expect(gi.split("\n").filter((l) => l.trim() === "artifacts/")).toHaveLength(1);
    await init(dir, { writeGitignore: true });
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8").split("\n").filter((l) => l.trim() === "artifacts/")).toHaveLength(1);
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.verify).toBe("aiqh verify");
    expect(pkg.scripts.build).toBe("tsc -b && vite build"); // untouched
    // config itself was not written (no --write)
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(false);
  });

  it("Python fixture: venv-relative pytest and hints for the rest", async () => {
    const dir = copyFixture("python-venv");
    await init(dir, { write: true });
    const cfg = loadConfig(path.join(dir, "aiqh.config.jsonc"));
    expect(cfg.project.type).toBe("python");
    expect(cfg.checks.map((c) => c.kind)).toEqual(["unit"]);
    expect(cfg.checks[0]?.command).toBe(".venv/bin/python -m pytest -q tests/");
    expect(readFileSync(path.join(dir, "aiqh.config.jsonc"), "utf8")).toMatch(/pip-audit/);
  });

  it("empty directory: no checks → exit 2 with an explanation (fail closed: no always-passing config)", async () => {
    const dir = copyFixture("empty");
    const r = await init(dir, { write: true });
    expect(r.code).toBe(2);
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(false);
  });
});

describe("aiqh init on this repository", () => {
  it("proposes the same kinds and commands as the committed aiqh.config.jsonc (security command differs by design)", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const lines: string[] = [];
    const code = await runInit({ cwd: root, toolVersion: "0.0.0", json: true, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(0);
    const proposal = JSON.parse(lines.join("\n")) as { config: { checks: Array<{ kind: string; command: string }> } };
    const byKind = Object.fromEntries(proposal.config.checks.map((c) => [c.kind, c.command]));
    expect(byKind.lint).toBe("npm run lint");
    expect(byKind.typecheck).toBe("npm run typecheck");
    expect(byKind.unit).toBe("npm run test");
    expect(byKind.build).toBe("npm run build");
    expect(byKind.dependency).toBe("npm audit --audit-level=high");
    expect(byKind.security).toBe("aiqh security-scan");
    const committed = loadConfig(path.join(root, "aiqh.config.jsonc"));
    for (const c of committed.checks) {
      if (c.kind === "custom" || c.kind === "security") continue;
      expect(byKind[c.kind], c.kind).toBe(c.command);
    }
  });
});
