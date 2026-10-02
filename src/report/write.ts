import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeForDisplay } from "../output.ts";
import { escapeRawCharsAsJson } from "../security/raw-chars.ts";
import type { VerificationReport } from "../types.ts";
import { renderMarkdown } from "./markdown.ts";

export interface WrittenReportPaths {
  latestJson: string;
  latestMd: string;
  history: string;
}

/** Write latest.json, latest.md and history/<timestamp>.json under `outputDir`. */
export function writeReports(report: VerificationReport, outputDir: string): WrittenReportPaths {
  const historyDir = path.join(outputDir, "history");
  mkdirSync(historyDir, { recursive: true });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const md = renderMarkdown(report);

  const latestJson = path.join(outputDir, "latest.json");
  const latestMd = path.join(outputDir, "latest.md");
  const history = uniqueHistoryPath(historyDir, historyStamp(report.startedAt));

  writeAtomic(latestJson, json, "json");
  writeAtomic(latestMd, md, "md");
  writeAtomic(history, json, "json");

  return { latestJson, latestMd, history };
}

/** 2026-09-15T12:34:56.789Z -> 20260915T123456Z */
export function historyStamp(isoDate: string): string {
  return isoDate.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function uniqueHistoryPath(historyDir: string, stamp: string): string {
  let candidate = path.join(historyDir, `${stamp}.json`);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = path.join(historyDir, `${stamp}-${n}.json`);
    n += 1;
  }
  return candidate;
}

/** The one place the report files are written: a forbidden character never reaches a file raw (JSON: `\uXXXX`, Markdown: `\u{HEX}`; ADR-0020). */
function writeAtomic(target: string, content: string, format: "json" | "md"): void {
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, format === "json" ? escapeRawCharsAsJson(content) : escapeForDisplay(content, "keep"), "utf8");
  renameSync(tmp, target);
}
