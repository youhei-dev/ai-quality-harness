/**
 * The exit-code priority of `aiqh review-packet` (ADR-0015, M2-1-R3-002). A finding (exit 1) is reported only
 * after every input has been obtained and checked — except an inspection that depends on a value that has a
 * finding itself (such a value is never passed to git or used as a path; it is `Rejected`). When an input that
 * must be inspected cannot be obtained, the result is exit 2 even if findings are known (they are listed as an
 * incomplete list). An error that does not stop the inspection (a size limit, a --doc that is not a file, …)
 * is exit 2 only when there is no finding.
 */
import { EXIT_ERROR, EXIT_FAILED } from "../types.ts";
import type { PacketFinding } from "./packet.ts";

/** An input that must be inspected could not be obtained (row "inspection": exit 2, before findings). */
export class InspectionError extends Error {
  override readonly name = "InspectionError";
  /** The findings known when the inspection stopped (an incomplete list; set by the code that stopped). */
  findings: PacketFinding[] = [];
}

/** The inspection was possible, but nothing will be written (row "deferred": exit 2 only without findings). */
export class DeferredError extends Error {
  override readonly name = "DeferredError";
}

export type ExitCategory = "usage" | "config" | "inspection" | "finding" | "deferred" | "write";

/**
 * ADR-0015's table, in order: the first category that applies decides the exit code. "usage" and "config" are
 * decided before any input is read, "write" after the decision; decideOutcome decides the three in between.
 */
export const EXIT_PRIORITY: ReadonlyArray<{ category: ExitCategory; exit: 1 | 2; examples: string }> = [
  { category: "usage", exit: 2, examples: "commander: unknown option, missing --range, a --max-*-bytes that is not a positive integer" },
  { category: "config", exit: 2, examples: "--config missing or invalid, an invalid default aiqh.config.jsonc" },
  {
    category: "inspection",
    exit: 2,
    examples:
      "unreadable --request / --review / standard input, not a git work tree, --range without <from>..<to>, a ref that does not resolve, <from> not an ancestor, no commits, a git failure (missing object, timeout, output limit), an empty diff, an unreadable latest.json",
  },
  {
    category: "finding",
    exit: 1,
    examples: "option values, paths, changed files and diffs, commit messages, request, reviews, --doc, latest.json (all of a malformed one), derived values, the assembled packet, the default output name",
  },
  {
    category: "deferred",
    exit: 2,
    examples:
      "a changed file or --doc over --max-file-bytes, a --doc that is not a file, latest.json not JSON or of an unexpected shape, the packet over --max-packet-bytes, an invalid --label, a forbidden character in the resolved --cwd / -o / --zip-output, an output name outside [A-Za-z0-9._-], the same target for packet and ZIP",
  },
  { category: "write", exit: 2, examples: "prepare / commit of the two-phase write, rollback" },
];

export type Decision =
  | { category: "inspection"; exit: typeof EXIT_ERROR; message: string; findings: readonly PacketFinding[] }
  | { category: "finding"; exit: typeof EXIT_FAILED; findings: readonly PacketFinding[] }
  | { category: "deferred"; exit: typeof EXIT_ERROR; message: string }
  | { category: "none" };

/** The single decision between "inspection", "finding" and "deferred" (EXIT_PRIORITY). */
export function decideOutcome(state: { inspection: InspectionError | null; findings: readonly PacketFinding[]; deferred: readonly DeferredError[] }): Decision {
  if (state.inspection !== null) return { category: "inspection", exit: EXIT_ERROR, message: state.inspection.message, findings: state.findings };
  if (state.findings.length > 0) return { category: "finding", exit: EXIT_FAILED, findings: state.findings };
  if (state.deferred.length > 0) return { category: "deferred", exit: EXIT_ERROR, message: state.deferred.map((d) => d.message).join("; ") };
  return { category: "none" };
}
