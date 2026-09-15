import { maskDeep } from "../security/mask.ts";
import type { CheckResult, GitInfo, ResolvedConfig, VerificationReport } from "../types.ts";
import { computeVerdict } from "./verdict.ts";

export interface BuildReportInput {
  config: ResolvedConfig;
  results: CheckResult[];
  git: GitInfo | null;
  startedAt: Date;
  finishedAt: Date;
  toolVersion: string;
}

/** Assemble the report and pass every string through the secret masker. */
export function buildReport(input: BuildReportInput): VerificationReport {
  const verdict = computeVerdict(input.results);
  const report: VerificationReport = {
    schemaVersion: 1,
    tool: { name: "ai-quality-harness", version: input.toolVersion },
    project: { name: input.config.project.name, root: input.config.projectRoot },
    configPath: input.config.configPath,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    git: input.git,
    verdict: verdict.verdict,
    exitCode: verdict.exitCode,
    summary: verdict.summary,
    categories: verdict.categories,
    checks: input.results,
  };
  return maskDeep(report);
}
