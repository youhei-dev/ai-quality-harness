/**
 * Shared types for ai-quality-harness (aiqh).
 * Runtime values that need to exist at runtime (enums) are expressed as `as const` arrays
 * because the project compiles with `erasableSyntaxOnly` (no TypeScript enums).
 */

export const CATEGORY_KINDS = [
  "lint",
  "typecheck",
  "unit",
  "build",
  "security",
  "dependency",
  "e2e",
] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CHECK_KINDS = [...CATEGORY_KINDS, "custom"] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

export type CategoryStatus = CheckStatus | "NOT_APPLICABLE";

export type Verdict = "PASSED" | "FAILED";

export type ProjectType = "node" | "python" | "mixed" | "other";

/** A check after defaults have been applied and paths resolved. */
export interface ResolvedCheck {
  name: string;
  kind: CheckKind;
  command: string;
  /** Working directory as written in the config (relative to project root). */
  cwd: string;
  /** Absolute working directory. */
  cwdAbsolute: string;
  required: boolean;
  timeoutSec: number;
  description?: string;
}

export interface ResolvedConfig {
  /** Directory containing the config file. All relative paths resolve against it. */
  projectRoot: string;
  /** Absolute path of the config file. */
  configPath: string;
  project: {
    name: string;
    type?: ProjectType;
  };
  /** Absolute output directory for reports. */
  outputDir: string;
  checks: ResolvedCheck[];
}

/** Raw result of running one command. Produced by runner/execute.ts. */
export interface ExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Set when the process could not be started at all (missing cwd, spawn error). */
  spawnError: string | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  startedAt: string;
  durationMs: number;
}

/** Result of one check as stored in the report. */
export interface CheckResult {
  name: string;
  kind: CheckKind;
  command: string;
  cwd: string;
  required: boolean;
  timeoutSec: number;
  description: string | null;
  status: CheckStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  startedAt: string | null;
  durationMs: number;
  errorSummary: string | null;
  stdoutTail: string;
  stderrTail: string;
  outputTruncated: boolean;
}

export interface GitInfo {
  commit: string | null;
  branch: string | null;
  dirty: boolean;
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  requiredFailed: number;
}

export interface VerificationReport {
  schemaVersion: 1;
  tool: { name: string; version: string };
  project: { name: string; root: string };
  configPath: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  git: GitInfo | null;
  verdict: Verdict;
  exitCode: number;
  summary: ReportSummary;
  categories: Record<CategoryKind, CategoryStatus>;
  checks: CheckResult[];
}

/** Exit codes of the CLI. */
export const EXIT_PASSED = 0;
export const EXIT_FAILED = 1;
export const EXIT_ERROR = 2;
