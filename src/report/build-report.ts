import { maskDeep } from "../security/mask.ts";
import { EXIT_ERROR, SIGNAL_EXIT_CODES, type CheckResult, type GitInfo, type ResolvedConfig, type VerificationReport } from "../types.ts";
import { computeVerdict } from "./verdict.ts";

export interface BuildReportInput {
  config: ResolvedConfig;
  results: CheckResult[];
  git: GitInfo | null;
  startedAt: Date;
  finishedAt: Date;
  toolVersion: string;
  /** Signal name when the run was interrupted (R3-002). Forces verdict ERROR and exit 128 + signal. */
  interruptedBy?: string | null;
}

/** Assemble the report and pass every string through the secret masker. */
export function buildReport(input: BuildReportInput): VerificationReport {
  const verdict = computeVerdict(input.results);
  const interruptedBy = input.interruptedBy ?? null;
  const report: VerificationReport = {
    schemaVersion: 1,
    tool: { name: "ai-quality-harness", version: input.toolVersion },
    project: { name: input.config.project.name, root: input.config.projectRoot },
    configPath: input.config.configPath,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    git: input.git,
    verdict: interruptedBy === null ? verdict.verdict : "ERROR",
    exitCode: interruptedBy === null ? verdict.exitCode : (SIGNAL_EXIT_CODES[interruptedBy] ?? EXIT_ERROR),
    interruptedBy,
    summary: verdict.summary,
    categories: verdict.categories,
    checks: input.results,
  };
  return maskDeep(report);
}
