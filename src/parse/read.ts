/**
 * Reading a check's output (ADR-0028, v0.8.0): the parser chosen from the command (select.ts) reads the end of stdout and stderr
 * (text.ts) into `parsed`, a field for display only. It never throws (P2): a parser that throws or returns what is not JSON data is
 * "parser-error", one that runs past PARSE_TIME_LIMIT_MS is "time-limit", and the check's result is the same either way (P1: the
 * status, the exit code and every other field of the check are decided before this and do not look at it).
 */
import type { ExecutionResult, ParsedItem, ParsedOutput, ParseReason, ParserTool, ResolvedCheck } from "../types.ts";
import { ESLINT_PARSER } from "./eslint.ts";
import { NPM_AUDIT_PARSER } from "./npm-audit.ts";
import { selectParser, type ScriptsRead } from "./select.ts";
import { Budget, PARSED_ITEMS_MAX, prepareStream, TimeLimitReached } from "./text.ts";
import type { ToolParser } from "./tool.ts";
import { VITEST_PARSER } from "./vitest.ts";

export const PARSERS: Readonly<Record<ParserTool, ToolParser>> = {
  vitest: VITEST_PARSER,
  eslint: ESLINT_PARSER,
  "npm-audit": NPM_AUDIT_PARSER,
};

/** For tests: the clock, the parsers and the package.json reader can be replaced. Not reachable from the config or the CLI. */
export interface ReadDeps {
  now?: () => number;
  parsers?: Partial<Record<ParserTool, ToolParser>>;
  readScripts?: (dir: string) => ScriptsRead;
}

/** The facts of an execution a parser may use. */
export type OutputFacts = Pick<ExecutionResult, "stdout" | "stderr" | "exitCode" | "stdoutTruncated" | "stderrTruncated">;

function notRead(tool: ParserTool | null, status: "unparsed" | "not-applicable", reason: ParseReason, truncated = false): ParsedOutput {
  return { tool, status, reason, truncated, counts: {}, items: [], itemsOmitted: 0 };
}

/** The `parsed` field of a check that was not started. */
export function notRun(): ParsedOutput {
  return notRead(null, "not-applicable", "not-run");
}

/** The `parsed` field of a check that ran. Never throws. */
export function readCheckOutput(check: ResolvedCheck, exec: OutputFacts, deps: ReadDeps = {}): ParsedOutput {
  let selection;
  try {
    selection = selectParser(check.command, check.cwdAbsolute, deps.readScripts);
  } catch {
    return notRead(null, "unparsed", "parser-error");
  }
  if (selection.kind === "none") return notRead(null, selection.status, selection.reason);
  return parseOutputAs(selection.tool, exec, deps);
}

/** The output read by the parser of `tool`. Never throws. */
export function parseOutputAs(tool: ParserTool, exec: OutputFacts, deps: ReadDeps = {}): ParsedOutput {
  let truncated = exec.stdoutTruncated || exec.stderrTruncated;
  try {
    const budget = new Budget(deps.now ?? Date.now);
    const stdout = prepareStream(exec.stdout);
    const stderr = prepareStream(exec.stderr);
    truncated = truncated || stdout.truncated || stderr.truncated;
    budget.check();
    const parser = deps.parsers?.[tool] ?? PARSERS[tool];
    const answer = parser.parse({ stdout: stdout.lines, stderr: stderr.lines, exitCode: exec.exitCode }, budget);
    if (answer.status === "unparsed") {
      return notRead(tool, "unparsed", answer.reason === "no-summary" || answer.reason === "unexpected-summary" ? answer.reason : "parser-error", truncated);
    }
    const counts = jsonCounts(answer.counts);
    const items = jsonItems(answer.items);
    if (counts === null || items === null || !isCount(answer.itemsOmitted)) return notRead(tool, "unparsed", "parser-error", truncated);
    return { tool, status: "parsed", reason: null, truncated, counts, items, itemsOmitted: answer.itemsOmitted };
  } catch (err) {
    return notRead(tool, "unparsed", err instanceof TimeLimitReached ? "time-limit" : "parser-error", truncated);
  }
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

/** A copy of the counts when every value is a safe non-negative integer (the report stays JSON data), else null. */
function jsonCounts(counts: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (!isCount(value)) return null;
    out[key] = value;
  }
  return out;
}

function jsonItems(items: readonly ParsedItem[]): ParsedItem[] | null {
  if (!Array.isArray(items) || items.length > PARSED_ITEMS_MAX) return null;
  const out: ParsedItem[] = [];
  for (const item of items) {
    if (typeof item.kind !== "string" || typeof item.name !== "string") return null;
    out.push({ kind: item.kind, name: item.name });
  }
  return out;
}
