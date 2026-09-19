/**
 * Adapter interfaces (M1, ADR-0011). An adapter *detects* tooling in a repository and *suggests*
 * a check definition. It never executes commands, never influences the verdict and never writes.
 * The execution path stays the M0 one: config → child process → exit code.
 */
import type { CategoryKind, CheckKind, ProjectType } from "../types.ts";

export interface PackageJsonLike {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

export interface NodeContext {
  packageJson: PackageJsonLike;
  scripts: Record<string, string>;
  lockfile: "npm" | "pnpm" | "yarn" | "bun" | null;
  /** dependencies + devDependencies names */
  deps: Set<string>;
  /**
   * Local evidence that a tool can run without a network fetch (M1-R1-007): declared in
   * dependencies / devDependencies, or present as node_modules/.bin/<bin>.
   */
  hasLocalTool(packageName: string, bin?: string): boolean;
}

export interface PythonContext {
  /** Relative venv directory (".venv" or "venv") whose bin/python is executable, or null (M1-R2-003). */
  venvDir: string | null;
  /** Relative path of the executable venv interpreter ("<venv>/bin/python"), or null. Every suggested command starts with it. */
  python: string | null;
  /** Relative path of an executable (X_OK on POSIX, M1-R1-009) in the venv's bin, or null. */
  venvBin(name: string): string | null;
  pyproject: string | null;
  requirementsFiles: string[];
}

/** Everything an adapter may look at. Built once by `buildRepoContext`; read-only. */
export interface RepoContext {
  root: string;
  /** Directory name, used as a fallback project name. */
  dirName: string;
  exists(rel: string): boolean;
  /** UTF-8 text of a file, or null when missing. Refuses `.env*` files by design. */
  readText(rel: string): string | null;
  /** Top-level entries (names only). */
  listTopLevel(): string[];
  node: NodeContext | null;
  python: PythonContext | null;
  git: { isRepo: boolean };
}

export interface Suggestion {
  name: string;
  kind: CheckKind;
  command: string;
  timeoutSec: number;
  required?: boolean;
  description: string;
}

export interface Detection {
  kind: CategoryKind;
  /** Adapter id, e.g. "node-eslint", "python-pytest", "builtin-security". */
  adapter: string;
  status: "available" | "unavailable";
  /** Evidence (available) or why not (unavailable); one human-readable line. */
  reason: string;
  suggestion?: Suggestion;
  /** How the user could enable this check (aiqh never installs anything). */
  enableHint?: string;
  /** Prerequisites / caveats, e.g. for E2E. */
  notes?: string[];
}

export interface Adapter {
  id: string;
  kind: CategoryKind;
  /** Returns null when the adapter does not apply to this repository at all. */
  detect(ctx: RepoContext): Detection | null;
}

/**
 * Optional output parser: turns a check's captured output into a one-line summary for reports.
 * Interface only in M1 — implementations arrive with the M2 report structuring.
 */
export interface OutputParser {
  id: string;
  parse(stdout: string, stderr: string): { summary: string } | null;
}

export interface KindResolution {
  chosen: Detection | null;
  alternatives: Detection[];
  unavailable: Detection[];
}

export interface Resolution {
  projectType: ProjectType;
  byKind: Record<CategoryKind, KindResolution>;
}
