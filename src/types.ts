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

/** PASSED / FAILED from the checks; ERROR when the run was interrupted (R3-002). */
export type Verdict = "PASSED" | "FAILED" | "ERROR";

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

/** One `security.allow` rule (M2-0 §7). Suppresses secret-shaped findings, and raw characters when it names their category (ADR-0036). */
export interface AllowRule {
  /** Glob (path.matchesGlob) over the repository-relative path. */
  path: string;
  /** Secret or raw-character category; every secret category when omitted (a raw character only by a rule that names its category). */
  category?: string;
  /** 1-based line; every line when omitted. */
  line?: number;
  /** Mandatory justification (shown in reports). */
  reason: string;
  /** ISO date (YYYY-MM-DD); the rule is inactive after that day. */
  expires?: string;
}

/** `security` section with defaults applied (M2-0 §7 / §8). */
export interface ResolvedSecurity {
  allow: AllowRule[];
  envProbePaths: string[];
  exampleEnvSuffixes: string[];
  maxLineBytes: number;
  lineOverlapBytes: number;
  maxCarryBytes: number;
}

export interface ResolvedConfig {
  /** Directory containing the config file. All relative paths resolve against it. */
  projectRoot: string;
  /** Absolute path of the config file. */
  configPath: string;
  /** SHA-256 of the config file's bytes, 64 lower-case hex digits (ADR-0033). Set by loadConfig; absent for a config made without a file. */
  configSha256?: string;
  project: {
    name: string;
    type?: ProjectType;
  };
  /** Absolute output directory for reports. */
  outputDir: string;
  checks: ResolvedCheck[];
  security: ResolvedSecurity;
}

/** Raw result of running one command. Produced by runner/execute.ts. */
export interface ExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Signal name (e.g. "SIGINT") when the run was interrupted before or during this command (R3-002). */
  interruptedBy: string | null;
  /** Set when the process could not be started at all (missing cwd, spawn error). */
  spawnError: string | null;
  /**
   * Set only when the command was terminated (timeout / interruption) and its process group was still present after SIGKILL and the
   * bounded wait for it to disappear (backlog 16): the clean-up is not confirmed. `killError` is the errno code when no signal could
   * be delivered at all (e.g. "EPERM"). Absent when the group is gone (or the command ended on its own).
   */
  terminationUnconfirmed?: { waitedMs: number; killError: string | null };
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  startedAt: string;
  durationMs: number;
}

/** The tools whose output aiqh reads (ADR-0028; pytest since v0.14.0, decision 12; node-test since v0.18.0, decision 14). */
export const PARSER_TOOLS = ["vitest", "eslint", "npm-audit", "aiqh-security-scan", "pytest", "node-test"] as const;

export type ParserTool = (typeof PARSER_TOOLS)[number];

/**
 * Why a check's output was not read (ADR-0028): a fixed word, never text from the output.
 * not-applicable: "not-run" (the command was not started), "no-parser" (nothing in the command, or in the npm script it names, is a tool
 * aiqh reads), "several-tools" (more than one is). unparsed: "script-unreadable" (package.json could not be read; not "absent", ADR-0022),
 * "no-summary" (the tool's summary was not found), "unexpected-summary" (a summary whose words or numbers do not add up),
 * "output-truncated" (a parser that reads only a whole stdout, node:test since v0.18.0, was given a cut one), "time-limit",
 * "parser-error" (the parser threw or returned what is not JSON data: a bug, and verify goes on).
 */
export type ParseReason = "not-run" | "no-parser" | "several-tools" | "script-unreadable" | "no-summary" | "unexpected-summary" | "output-truncated" | "time-limit" | "parser-error";

/** One named entry read from an output: a failed test, a lint error, a vulnerable package, a security-scan entry (ADR-0028). */
export interface ParsedItem {
  kind: string;
  /** Masked as the whole line, then cut to PARSED_NAME_MAX. */
  name: string;
}

/**
 * What aiqh read from a check's output, for display only (ADR-0028, v0.8.0): it never takes part in the verdict, the categories or the
 * exit code. Absent from reports of earlier versions.
 */
export interface ParsedOutput {
  /** The parser aiqh chose from the command (and the npm script it names), or null when none applies. */
  tool: ParserTool | null;
  status: "parsed" | "unparsed" | "not-applicable";
  /** null when parsed. */
  reason: ParseReason | null;
  /** Only the end of a stream was read (PARSE_INPUT_MAX), or the runner had already cut it: the counts are the tool's, the names may miss early ones. */
  truncated: boolean;
  /** Numbers of the tool's summary (keys by tool, ADR-0028); empty unless parsed. */
  counts: Record<string, number>;
  /** At most PARSED_ITEMS_MAX, in the order of the output. */
  items: ParsedItem[];
  /** Entries found beyond PARSED_ITEMS_MAX. */
  itemsOmitted: number;
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
  /** v0.8.0 (ADR-0028): what was read from the output, for display only. Always written by verify; absent in older reports. */
  parsed?: ParsedOutput;
}

export interface GitInfo {
  commit: string | null;
  branch: string | null;
  /** true = uncommitted changes, false = clean, null = could not be determined (R-009). */
  dirty: boolean | null;
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
  /** SHA-256 of the config file's bytes that verify read (v0.10.0, ADR-0033): a record, not a pinned value. Absent in older reports, never null. */
  configSha256?: string;
  /** One value per verify run (v0.16.0, ADR-0038): crypto.randomUUID(), also in latest.md and the history file. Absent in older reports, never null. */
  runId?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  git: GitInfo | null;
  verdict: Verdict;
  exitCode: number;
  /** Signal name when verdict is ERROR because the run was interrupted (R3-002); null otherwise. */
  interruptedBy: string | null;
  summary: ReportSummary;
  categories: Record<CategoryKind, CategoryStatus>;
  checks: CheckResult[];
}

/** Exit codes of the CLI. */
export const EXIT_PASSED = 0;
export const EXIT_FAILED = 1;
export const EXIT_ERROR = 2;
/** 128 + signal number, used when a run is interrupted (R2-002 / R3-002). */
export const SIGNAL_EXIT_CODES: Readonly<Record<string, number>> = { SIGINT: 130, SIGTERM: 143 };
