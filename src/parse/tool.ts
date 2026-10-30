/** The shape of one output parser (ADR-0028). A parser reads prepared lines only (text.ts) and never touches files or the clock directly. */
import type { ParsedItem, ParserTool } from "../types.ts";
import type { Budget, Lines } from "./text.ts";

export interface ParserInput {
  stdout: Lines;
  stderr: Lines;
  /** The command's exit code: eslint prints nothing at all without problems, so "nothing" is 0 problems only with exit 0. */
  exitCode: number | null;
  /** The start of stdout is not in `stdout`: the runner kept only its end, or the parser's window cut it (v0.18.0, B3-D-R1-001). */
  stdoutTruncated: boolean;
}

export type ParserAnswer =
  | { status: "parsed"; counts: Record<string, number>; items: ParsedItem[]; itemsOmitted: number }
  | { status: "unparsed"; reason: "no-summary" | "unexpected-summary" | "output-truncated" };

export interface ToolParser {
  tool: ParserTool;
  parse(input: ParserInput, budget: Budget): ParserAnswer;
}

export const NO_SUMMARY: ParserAnswer = { status: "unparsed", reason: "no-summary" };
export const UNEXPECTED_SUMMARY: ParserAnswer = { status: "unparsed", reason: "unexpected-summary" };
/** A parser that reads only a whole stdout (node:test, v0.18.0) and was given a cut one. */
export const OUTPUT_TRUNCATED: ParserAnswer = { status: "unparsed", reason: "output-truncated" };

/** The text after `label` and the spaces that follow it, when the line (leading spaces ignored) starts with `label` and a space; else null. */
export function afterLabel(line: string, label: string): string | null {
  const t = line.trimStart();
  if (!t.startsWith(`${label} `)) return null;
  return t.slice(label.length).trim();
}
