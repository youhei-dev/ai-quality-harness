/**
 * Backlog 8 (D group), O6 (docs/reviews/m2-2/response-r1.md), plan T (throw): src/adapters/context.ts folded every failure of a probe or a
 * read into "absent" (exists() false, readText() null, a package.json that is not JSON gives no Node context, a failed directory listing gives
 * no requirements files). A package.json that is a dangling link, unreadable, a directory or not JSON was therefore "not a Node project":
 * `init` printed the same audit as for a repository without one, `init --write` wrote a config without lint, typecheck and build (the verdict
 * of `aiqh verify` on it went from FAILED to PASSED), and `init --write-scripts` did nothing and said nothing (exit 0).
 * Now only ENOENT is absent: anything else is an ExaminationError, and `init` stops (exit 2) before it proposes or writes anything.
 * Permission cases are skipped for root. The cases that are not about O6 are controls: they pass before and after.
 */
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExaminationError, buildRepoContext } from "../src/adapters/context.ts";
import { resolveDetections } from "../src/adapters/index.ts";
import { runInit } from "../src/commands/init.ts";
import { fake, makeTempDir } from "./helpers.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function temp(): string {
  const t = makeTempDir("aiqh-b8d-o6-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Make `p` impossible to read / traverse; it is restored first on cleanup (LIFO, before the temp dir is removed). */
function lock(p: string, mode = 0o000): void {
  chmodSync(p, mode);
  cleanups.push(() => chmodSync(p, 0o755));
}

/** A Node project: package.json with lint, typecheck and build scripts (and, optionally, devDependencies). `.git` is an empty directory: no git is run. */
function nodeProject(dir: string, extra: { scripts?: Record<string, string>; devDependencies?: Record<string, string> } = {}): void {
  mkdirSync(path.join(dir, ".git"));
  const scripts = extra.scripts ?? { lint: "x", typecheck: "x", build: "x" };
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0", scripts, ...(extra.devDependencies ? { devDependencies: extra.devDependencies } : {}) }));
}

/** A Python project: a venv whose python and pytest are executable files, a pyproject.toml and tests/. */
function pythonProject(dir: string): void {
  const bin = path.join(dir, ".venv", "bin");
  mkdirSync(bin, { recursive: true });
  for (const n of ["python", "pytest"]) {
    writeFileSync(path.join(bin, n), "#!/bin/sh\nexit 0\n");
    chmodSync(path.join(bin, n), 0o755);
  }
  writeFileSync(path.join(dir, "pyproject.toml"), '[project]\nname = "demo"\n');
  mkdirSync(path.join(dir, "tests"));
}

/** Replace package.json by something else (for the broken states). */
function replacePackageJson(dir: string, how: "eacces" | "dangling" | "loop" | "dir" | "badjson"): void {
  const p = path.join(dir, "package.json");
  rmSync(p);
  if (how === "eacces") {
    writeFileSync(p, "{}");
    lock(p);
  } else if (how === "dangling") symlinkSync("missing-package.json", p);
  else if (how === "loop") symlinkSync("package.json", p);
  else if (how === "dir") mkdirSync(p);
  else writeFileSync(p, '<<<<<<< HEAD\n{ "name": "demo" }\n=======\n');
}

async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => out.push(l), logError: (l) => err.push(l), ...opts });
  return { code, out, err };
}

describe("backlog 8 O6 (plan T): an entry that cannot be examined is not absent; the audit stops", () => {
  it.skipIf(isRoot)("package.json that cannot be read (EACCES): an ExaminationError (before: no Node context, no error)", () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "eacces");
    expect(() => buildRepoContext(dir)).toThrow(ExaminationError);
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json cannot be examined \(EACCES\)$/);
  });

  it("package.json that is a dangling symbolic link: the link is there, its target is not", () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "dangling");
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json is a symbolic link whose target does not exist$/);
  });

  it("package.json that is a symbolic link that loops (ELOOP)", () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "loop");
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json cannot be examined \(ELOOP\)$/);
  });

  it("package.json that is a directory (EISDIR)", () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "dir");
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json cannot be examined \(EISDIR\)$/);
  });

  it("package.json that is not valid JSON (the marks of a merge conflict)", () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "badjson");
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json is not valid JSON$/);
  });

  it.skipIf(isRoot)("tsconfig.json that cannot be read: found while the adapters run (they probe lazily), not 'no tsconfig.json'", () => {
    const dir = temp();
    nodeProject(dir, { scripts: { build: "x" }, devDependencies: { typescript: "^5.0.0" } });
    writeFileSync(path.join(dir, "tsconfig.json"), "{}");
    lock(path.join(dir, "tsconfig.json"));
    const ctx = buildRepoContext(dir);
    expect(() => resolveDetections(ctx)).toThrow(/^tsconfig\.json cannot be examined \(EACCES\)$/);
  });

  it.skipIf(isRoot)("pyproject.toml that cannot be read, in a project that has nothing else of Python", () => {
    const dir = temp();
    writeFileSync(path.join(dir, "pyproject.toml"), "x");
    lock(path.join(dir, "pyproject.toml"));
    expect(() => buildRepoContext(dir)).toThrow(/^pyproject\.toml cannot be examined \(EACCES\)$/);
  });

  it("a probe below a regular file (tests is a file, tests/e2e is asked for: ENOTDIR)", () => {
    const dir = temp();
    pythonProject(dir);
    rmSync(path.join(dir, "tests"), { recursive: true });
    writeFileSync(path.join(dir, "tests"), "x");
    const ctx = buildRepoContext(dir);
    expect(() => resolveDetections(ctx)).toThrow(/^tests\/e2e cannot be examined \(ENOTDIR\)$/);
  });

  it.skipIf(isRoot)("a repository directory that cannot be listed (mode 0300: requirements*.txt cannot be looked for)", () => {
    const dir = temp();
    writeFileSync(path.join(dir, "requirements.txt"), "pytest\n");
    lock(dir, 0o300);
    expect(() => buildRepoContext(dir)).toThrow(/^the top-level entries cannot be listed \(EACCES\)$/);
  });

  it.skipIf(isRoot)("a repository directory that cannot be traversed (mode 0600): the first probe says so", () => {
    const dir = temp();
    nodeProject(dir);
    lock(dir, 0o600);
    expect(() => buildRepoContext(dir)).toThrow(/cannot be examined \(EACCES\)/);
  });
});

describe("backlog 8 O6 (plan T): init says so and stops (exit 2), before it proposes or writes", () => {
  it.skipIf(isRoot)("--write with an unreadable package.json: exit 2, no config (before: exit 0 and a config with only the security check)", async () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "eacces");
    const r = await init(dir, { write: true });
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/^aiqh init: cannot audit .*: package\.json cannot be examined \(EACCES\)$/);
    expect(r.out).toEqual([]);
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(false);
  });

  it("--write-scripts with a dangling package.json: exit 2 and a message (before: exit 0 and nothing said)", async () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "dangling");
    const r = await init(dir, { writeScripts: true });
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/package\.json is a symbolic link whose target does not exist/);
    expect(existsSync(path.join(dir, "missing-package.json"))).toBe(false);
  });

  it("the dry run with a package.json that is not JSON: exit 2 (before: exit 0, 'not-applicable' for every Node check)", async () => {
    const dir = temp();
    nodeProject(dir);
    replacePackageJson(dir, "badjson");
    const r = await init(dir);
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/package\.json is not valid JSON/);
    expect(r.out).toEqual([]);
  });

  it.skipIf(isRoot)("the message goes through the output boundary: a secret-shaped directory name is masked and an ESC is written as notation", async () => {
    const dir = path.join(temp(), `p-${fake("AKIA", "ABCDEFGHIJKLMNOP")}-${String.fromCodePoint(0x1b)}x`);
    mkdirSync(dir);
    nodeProject(dir);
    replacePackageJson(dir, "eacces");
    const r = await init(dir);
    expect(r.code).toBe(2);
    const text = r.err.join("\n");
    expect(text).toMatch(/cannot audit /);
    expect(text).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    expect(text).not.toContain(String.fromCodePoint(0x1b));
  });
});

describe("backlog 8 O6 controls: what is really absent, and the healthy cases (pass before and after)", () => {
  it("a healthy Node project: the context, the detections and the dry run are as before", async () => {
    const dir = temp();
    nodeProject(dir);
    const ctx = buildRepoContext(dir);
    expect(ctx.node?.scripts.lint).toBe("x");
    const r = resolveDetections(ctx);
    expect(r.byKind.lint.chosen?.adapter).toBe("node-eslint");
    expect(r.byKind.typecheck.chosen?.adapter).toBe("node-tsc");
    expect(r.byKind.build.chosen?.adapter).toBe("node-build");
    expect((await init(dir)).code).toBe(0);
  });

  it("a healthy Node project: --write writes the config with its checks", async () => {
    const dir = temp();
    nodeProject(dir);
    const r = await init(dir, { write: true });
    expect(r.code).toBe(0);
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(true);
  });

  it("no package.json at all (ENOENT): no Node context, project type 'other', exit 0; --write-scripts has nothing to do and is silent", async () => {
    const dir = temp();
    mkdirSync(path.join(dir, ".git"));
    const ctx = buildRepoContext(dir);
    expect(ctx.node).toBeNull();
    expect(resolveDetections(ctx).projectType).toBe("other");
    expect((await init(dir)).code).toBe(0);
    const w = await init(dir, { writeScripts: true });
    expect(w.code).toBe(0);
    expect(w.err).toEqual([]);
  });

  it("no tsconfig.json at all: typecheck is 'no tsconfig.json'", () => {
    const dir = temp();
    nodeProject(dir, { scripts: { build: "x" }, devDependencies: { typescript: "^5.0.0" } });
    const r = resolveDetections(buildRepoContext(dir));
    expect(r.byKind.typecheck.unavailable[0]?.reason).toBe("no tsconfig.json");
  });

  it("a .git that is a dangling symbolic link: the link is there (lstat), so it is a repository for the audit, as in C", () => {
    const dir = temp();
    nodeProject(dir);
    rmSync(path.join(dir, ".git"), { recursive: true });
    symlinkSync("missing-gitdir", path.join(dir, ".git"));
    expect(buildRepoContext(dir).git.isRepo).toBe(true);
  });

  it("a venv whose python is a dangling link: a known state ('present but unusable'), not an error", () => {
    const dir = temp();
    pythonProject(dir);
    rmSync(path.join(dir, ".venv", "bin", "python"));
    symlinkSync("missing-python", path.join(dir, ".venv", "bin", "python"));
    const ctx = buildRepoContext(dir);
    expect(ctx.python).not.toBeNull();
    expect(ctx.python?.venvDir).toBeNull();
  });

  it("a healthy Python project: pytest is found", () => {
    const dir = temp();
    pythonProject(dir);
    const r = resolveDetections(buildRepoContext(dir));
    expect(r.byKind.unit.chosen?.adapter).toBe("python-pytest");
  });

  it.skipIf(isRoot)("an environment file is never read, even one that cannot be read: no error", () => {
    const dir = temp();
    writeFileSync(path.join(dir, ".env"), "SECRET=x\n");
    lock(path.join(dir, ".env"));
    const ctx = buildRepoContext(dir);
    expect(ctx.readText(".env")).toBeNull();
  });
});
