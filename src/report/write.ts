import { randomBytes } from "node:crypto";
import { closeSync, constants, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

  writeAtomic(latestJson, json, "json");
  writeAtomic(latestMd, md, "md");
  const history = reserveHistoryPath(historyDir, historyStamp(report.startedAt));
  try {
    writeAtomic(history, json, "json");
  } catch (err) {
    // The name holds the empty file of the reservation, not a history: remove it (this run created it). The write error is the one reported.
    removeQuietly(history);
    throw err;
  }

  return { latestJson, latestMd, history };
}

/** 2026-09-15T12:34:56.789Z -> 20260915T123456Z */
export function historyStamp(isoDate: string): string {
  return isoDate.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * The first free name of the rule `<stamp>.json`, `<stamp>-2.json`, `<stamp>-3.json`, …, taken by creating it exclusively ("wx") before
 * anything is written (N1, rest2 SP1). Two runs that start in the same second cannot take the same name, so neither replaces the other's
 * history (the check with existsSync and the later rename left that window open). A name that exists in any form (a file, a directory, a
 * symbolic link even when it dangles) is skipped. Every other error is thrown: the report is not written and the CLI exits 2 (R-007).
 * The name holds an empty file until writeAtomic renames the history over it.
 */
function reserveHistoryPath(historyDir: string, stamp: string): string {
  for (let n = 1; ; n += 1) {
    const candidate = path.join(historyDir, n === 1 ? `${stamp}.json` : `${stamp}-${n}.json`);
    let fd: number;
    try {
      fd = openSync(candidate, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
    try {
      closeSync(fd);
    } catch (err) {
      removeQuietly(candidate);
      throw err;
    }
    return candidate;
  }
}

/** Remove a file this run created; a failure is left out (the caller reports its own error). */
function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // nothing more can be done here; the error being thrown is the one that matters
  }
}

/** How many random temporary names writeAtomic tries before it gives up (each one taken means another file is there already). */
const TEMPORARY_ATTEMPTS = 5;
/** O_NOFOLLOW where the platform has it (not on Windows): a symbolic link at the path is an error (ELOOP), not followed. */
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
/** The second open of the temporary file, to write it: write only, truncate, no symbolic link followed, and nothing created (no O_CREAT). */
const REOPEN = constants.O_WRONLY | constants.O_TRUNC | NOFOLLOW;
const REOPEN_FLAG = REOPEN as unknown as string; // @types/node types `flag` as a string only, but Node takes a numeric flag at run time; only a numeric flag can carry O_NOFOLLOW (a link is not followed)

/**
 * The one place the report files — and the findings files of review-import (ADR-0026) — are written: a forbidden character never reaches a
 * file raw (JSON: `\uXXXX`, Markdown: `\u{HEX}`; ADR-0020). A temporary file next to the target, then a rename; when either step fails the
 * temporary file is removed and the error is thrown.
 * v0.6.1 (M2-2-RI-R1-002, ADR-0026): the temporary file has a random name (`.<base>.tmp-<16 hex digits>`) and is created exclusively
 * (O_EXCL, and O_NOFOLLOW where there is one): an existing name — a file, a directory or a symbolic link, also a dangling one — is never
 * opened, another random name is tried (TEMPORARY_ATTEMPTS in all). The created file is closed and its path opened again with REOPEN to write
 * it: a symbolic link put at the name in between is ELOOP (not followed), a name removed in between is ENOENT (nothing is created). Before,
 * the name was `<target>.tmp-<pid>` and writeFileSync followed a symbolic link placed there (a file outside could be changed). The write
 * goes through the path, not the descriptor: an fs write to a descriptor is outside what src/ may do (the output guard, ADR-0019).
 */
export function writeAtomic(target: string, content: string, format: "json" | "md"): void {
  const tmp = createTemporary(target);
  try {
    writeFileSync(tmp, format === "json" ? escapeRawCharsAsJson(content) : escapeForDisplay(content, "keep"), { encoding: "utf8", flag: REOPEN_FLAG });
    renameSync(tmp, target);
  } catch (err) {
    removeQuietly(tmp);
    throw err;
  }
}

/** A new empty temporary file next to `target`, created by this call (its path); EEXIST after every attempt, or any other error, is thrown. */
function createTemporary(target: string): string {
  for (let attempt = 1; ; attempt += 1) {
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${randomBytes(8).toString("hex")}`);
    let fd: number;
    try {
      fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o666);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST" && attempt < TEMPORARY_ATTEMPTS) continue;
      throw err;
    }
    try {
      closeSync(fd);
    } catch (err) {
      removeQuietly(tmp);
      throw err;
    }
    return tmp;
  }
}
