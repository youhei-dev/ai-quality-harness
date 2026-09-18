import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NodeContext, PackageJsonLike, PythonContext, RepoContext } from "./types.ts";

const ENV_FILE = /^\.env(\..+)?$/;

/** Build the read-only view of a repository that adapters and `init` work from. */
export function buildRepoContext(root: string): RepoContext {
  const absRoot = path.resolve(root);
  const exists = (rel: string): boolean => {
    try {
      lstatSync(path.join(absRoot, rel));
      return true;
    } catch {
      return false;
    }
  };
  const readText = (rel: string): string | null => {
    if (ENV_FILE.test(path.basename(rel))) return null; // never read environment files
    try {
      return readFileSync(path.join(absRoot, rel), "utf8");
    } catch {
      return null;
    }
  };
  const listTopLevel = (): string[] => {
    try {
      return readdirSync(absRoot);
    } catch {
      return [];
    }
  };
  return {
    root: absRoot,
    dirName: path.basename(absRoot),
    exists,
    readText,
    listTopLevel,
    node: buildNode(readText, exists),
    python: buildPython(absRoot, exists, readText),
    git: { isRepo: exists(".git") },
  };
}

function buildNode(readText: RepoContext["readText"], exists: RepoContext["exists"]): NodeContext | null {
  const text = readText("package.json");
  if (text === null) return null;
  let pkg: PackageJsonLike;
  try {
    pkg = JSON.parse(text) as PackageJsonLike;
  } catch {
    return null;
  }
  const lockfile = exists("pnpm-lock.yaml")
    ? "pnpm"
    : exists("yarn.lock")
      ? "yarn"
      : exists("bun.lockb") || exists("bun.lock")
        ? "bun"
        : exists("package-lock.json")
          ? "npm"
          : null;
  return {
    packageJson: pkg,
    scripts: pkg.scripts ?? {},
    lockfile,
    deps: new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]),
  };
}

function buildPython(absRoot: string, exists: RepoContext["exists"], readText: RepoContext["readText"]): PythonContext | null {
  const venvDir = [".venv", "venv"].find((d) => exists(path.join(d, "bin", "python"))) ?? null;
  const pyproject = readText("pyproject.toml");
  const requirementsFiles = (() => {
    try {
      return readdirSync(absRoot).filter((f) => /^requirements.*\.txt$/.test(f));
    } catch {
      return [];
    }
  })();
  if (venvDir === null && pyproject === null && requirementsFiles.length === 0) return null;
  return {
    venvDir,
    venvBin: (name: string) => {
      if (venvDir === null) return null;
      const rel = path.join(venvDir, "bin", name);
      return existsSync(path.join(absRoot, rel)) ? rel : null;
    },
    pyproject,
    requirementsFiles,
  };
}
