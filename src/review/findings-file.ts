/**
 * A findings file on disk (docs/reviews/<label>/findings-r<N>.json, ADR-0026 D6), read by review-import (the previous round, the existing
 * file of the round) and by review-check (every round; ADR-0027). Only a regular file (lstat: a symbolic link is not followed) whose JSON
 * is a findings file of schema version 1 is one; anything else is a reason, never "absent" (ADR-0022). A reason names the condition and
 * an error code, never the file's text.
 */
import { lstatSync, readFileSync, type Stats } from "node:fs";
import { findingsFileSchema, type FindingsFile } from "./import.ts";

export type FindingsRead = { ok: true; file: FindingsFile } | { ok: false; reason: string };

export function errorCode(err: unknown): string {
  return (err as NodeJS.ErrnoException).code ?? "error";
}

/** lstat, or null for ENOENT only; every other failure is thrown (ADR-0022: a path that cannot be examined is not absent). */
export function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Read `file` (shown as `what`) as a findings file of schema version 1. */
export function readFindingsFile(file: string, what: string): FindingsRead {
  let bytes: Buffer;
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return { ok: false, reason: `${what} is not a regular file` };
    bytes = readFileSync(file);
  } catch (err) {
    return { ok: false, reason: `${what} cannot be read (${errorCode(err)})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { ok: false, reason: `${what} is not valid JSON` };
  }
  const r = findingsFileSchema.safeParse(parsed);
  if (!r.success) return { ok: false, reason: `${what} is not a findings file of schema version 1 (${r.error.issues.length} schema issue(s))` };
  return { ok: true, file: r.data };
}
