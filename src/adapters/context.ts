import { accessSync, constants, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NodeContext, PackageJsonLike, PythonContext, RepoContext } from "./types.ts";

const ENV_FILE = /^\.env(\..+)?$/;

/**
 * Something in the repository that cannot be examined: a probe or a read that fails for any reason but ENOENT (EACCES, ENOTDIR,
 * ELOOP, EISDIR, …), a symbolic link whose target does not exist, a package.json that is not JSON. None of these is "absent": an
 * audit that went on as if the entry were not there would call a project that has a package.json "not a Node project" and propose a
 * config without its checks (backlog 8, O6; ADR-0022). `entry` is relative to the repository root.
 */
export class ExaminationError extends Error {
  readonly entry: string;
  constructor(entry: string, detail: string) {
    super(`${entry} ${detail}`);
    this.name = "ExaminationError";
    this.entry = entry;
  }
}

const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException).code ?? "unknown error";

/** Build the read-only view of a repository that adapters and `init` work from. Throws ExaminationError for what cannot be examined. */
export function buildRepoContext(root: string): RepoContext {
  const absRoot = path.resolve(root);
  /** "present" when the entry itself is there (lstat: a symbolic link counts, dangling or not); "absent" only for ENOENT. */
  const state = (rel: string): "present" | "absent" => {
    try {
      lstatSync(path.join(absRoot, rel));
      return "present";
    } catch (err) {
      if (codeOf(err) === "ENOENT") return "absent";
      throw new ExaminationError(rel, `cannot be examined (${codeOf(err)})`);
    }
  };
  const exists = (rel: string): boolean => state(rel) === "present";
  const readText = (rel: string): string | null => {
    if (ENV_FILE.test(path.basename(rel))) return null; // never read environment files
    try {
      return readFileSync(path.join(absRoot, rel), "utf8");
    } catch (err) {
      if (codeOf(err) !== "ENOENT") throw new ExaminationError(rel, `cannot be examined (${codeOf(err)})`);
      // ENOENT is absence, unless the entry itself is there: a symbolic link whose target does not exist
      if (state(rel) === "present") throw new ExaminationError(rel, "is a symbolic link whose target does not exist");
      return null;
    }
  };
  /** True when the entry exists and is executable. An entry that is there but cannot run (no x bit, a dangling link) is a property of the entry, not a failure to examine it. */
  const isExecutable = (rel: string): boolean => {
    if (!exists(rel)) return false;
    const abs = path.join(absRoot, rel);
    try {
      accessSync(abs, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return lstatSync(abs).isFile() || lstatSync(abs).isSymbolicLink();
    } catch {
      return false;
    }
  };
  const listTopLevel = (): string[] => {
    try {
      return readdirSync(absRoot);
    } catch (err) {
      if (codeOf(err) === "ENOENT") return [];
      throw new ExaminationError("the top-level entries", `cannot be listed (${codeOf(err)})`);
    }
  };
  return {
    root: absRoot,
    dirName: path.basename(absRoot),
    exists,
    readText,
    listTopLevel,
    node: buildNode(readText, exists, isExecutable),
    python: buildPython(readText, exists, isExecutable, listTopLevel),
    git: { isRepo: exists(".git") },
  };
}

/** A JSON object: not null, not an array. */
const isJsonObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The package.json fields that are read as objects; each must be one when present (backlog 26). */
const OBJECT_FIELDS = ["scripts", "dependencies", "devDependencies"] as const;

function buildNode(readText: RepoContext["readText"], exists: RepoContext["exists"], isExecutable: (rel: string) => boolean): NodeContext | null {
  const text = readText("package.json");
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExaminationError("package.json", "is not valid JSON");
  }
  // Valid JSON of the wrong shape cannot be examined either (backlog 26): `null` and `"scripts": 5` were raw TypeErrors, and an array or a
  // string was read as an empty package.json, a Node project without scripts.
  if (!isJsonObject(parsed)) throw new ExaminationError("package.json", "is not a JSON object");
  for (const field of OBJECT_FIELDS) {
    if (parsed[field] !== undefined && !isJsonObject(parsed[field])) throw new ExaminationError("package.json", `has a "${field}" field that is not a JSON object`);
  }
  const pkg = parsed as PackageJsonLike;
  const lockfile = exists("pnpm-lock.yaml")
    ? "pnpm"
    : exists("yarn.lock")
      ? "yarn"
      : exists("bun.lockb") || exists("bun.lock")
        ? "bun"
        : exists("package-lock.json")
          ? "npm"
          : null;
  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  return {
    packageJson: pkg,
    scripts: pkg.scripts ?? {},
    lockfile,
    deps,
    hasLocalTool: (packageName, bin = packageName) => deps.has(packageName) || isExecutable(path.join("node_modules", ".bin", bin)),
  };
}

function buildPython(readText: RepoContext["readText"], exists: RepoContext["exists"], isExecutable: (rel: string) => boolean, listTopLevel: RepoContext["listTopLevel"]): PythonContext | null {
  // A venv counts only when its interpreter is executable: every suggested command runs it (M1-R2-003).
  const venvDir = [".venv", "venv"].find((d) => isExecutable(path.join(d, "bin", "python"))) ?? null;
  const venvPresentButUnusable = venvDir === null && [".venv", "venv"].some((d) => exists(path.join(d, "bin", "python")));
  const pyproject = readText("pyproject.toml");
  const requirementsFiles = listTopLevel().filter((f) => /^requirements.*\.txt$/.test(f));
  if (venvDir === null && !venvPresentButUnusable && pyproject === null && requirementsFiles.length === 0) return null;
  return {
    venvDir,
    python: venvDir === null ? null : path.join(venvDir, "bin", "python"),
    venvBin: (name: string) => {
      if (venvDir === null) return null;
      const rel = path.join(venvDir, "bin", name);
      return isExecutable(rel) ? rel : null;
    },
    pyproject,
    requirementsFiles,
  };
}
