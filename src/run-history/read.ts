/**
 * aiqh history, the reading side (ADR-0034 B–D): the history files (`history/<stamp>.json`) under one or more --from directories,
 * read as untrusted input. Reads only; nothing is written, and no path reaches the result (a source is its index, a file its name).
 * - A --from is resolved once with realpath, and everything after works from that path: a project root (its
 *   artifacts/verification/history is a directory whose realpath is inside the root) or the history directory itself. Only the names
 *   of the history rule are read, without descending; a leftover temporary file of writeAtomic is counted, any other name is ignored.
 * - A file is opened with O_NOFOLLOW and checked with fstat (a regular file), then read from the descriptor: at most the file limit
 *   + 1 bytes, whatever its size said (M4-D-R1-001). More is too-large; a size before, the bytes read and a size after that differ is
 *   unreadable (size-changed). The bytes read of every file count against the total limit (an input error: nothing is aggregated).
 * - The text is strict UTF-8, then JSON, then schemaVersion 1, then the zod shape of the fields the aggregate uses: names of a bounded
 *   UTF-8 length, at most CHECKS_MAX checks, safe integers, a positive timeoutSec (M4-D-R1-003, M4-D-R2-003). Anything outside is
 *   bad-shape: never cut, never masked here. The values zod does not keep (paths, commands, output, names of parsed items, the git
 *   commit and branch, …) are in memory only while JSON.parse runs and are not kept after it.
 * - Threat model (ADR-0034): the directories are the user's own. Their identity (kind, dev, ino) is compared before and after the
 *   reading, so a replaced directory is detected (directory-changed), not prevented: Node's fs cannot open a file relative to a
 *   directory descriptor (M4-D-R1-002).
 */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { COUNT_KEYS } from "../parse/read.ts";
import { decodeUtf8Strict } from "../security/raw-chars.ts";
import { CHECK_KINDS, PARSER_TOOLS, type CheckKind, type CheckStatus, type ParserTool, type Verdict } from "../types.ts";

/** The names verify gives its history files (src/report/write.ts): `<stamp>.json`, `<stamp>-2.json`, … */
export const HISTORY_NAME = /^\d{8}T\d{6}Z(?:-[1-9]\d*)?\.json$/;
/** A temporary file writeAtomic left behind for a history file (`.<name>.tmp-<16 hex digits>`, src/report/write.ts). */
const LEFTOVER_TEMPORARY = /^\.\d{8}T\d{6}Z(?:-[1-9]\d*)?\.json\.tmp-[0-9a-f]{16}$/;
/** O_NOFOLLOW where the platform has it (not on Windows, which aiqh history does not support). */
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
/** Bytes asked of one readSync. */
const CHUNK_BYTES = 64 * 1024;

export interface ReadLimits {
  /** Bytes of one history file: more is too-large. */
  fileBytes: number;
  /** History files of every --from together: more is an input error before anything is read. */
  totalFiles: number;
  /** Bytes read from every file together: more is an input error. */
  totalBytes: number;
}

/** ADR-0034 C and D (Q4, Q5): 8 MiB per file, 10,000 files and 256 MiB read in all. */
export const READ_LIMITS: Readonly<ReadLimits> = { fileBytes: 8 * 1024 * 1024, totalFiles: 10_000, totalBytes: 256 * 1024 * 1024 };
/** UTF-8 bytes of a project or check name (M4-D-R1-003). */
export const NAME_MAX_BYTES = 256;
/** UTF-8 bytes of tool.version. */
export const VERSION_MAX_BYTES = 64;
/** Checks of one run. */
export const CHECKS_MAX = 256;

/** Why a history file was not read, in the order they are decided (ADR-0034 C). */
export const UNREAD_REASONS = ["not-regular", "unreadable", "too-large", "empty", "not-utf8", "not-json", "unknown-version", "bad-shape"] as const;
export type UnreadReason = (typeof UNREAD_REASONS)[number];

/** An input error: nothing is aggregated (ADR-0034 B, D). */
export type InputErrorKind = "not-found" | "not-a-directory" | "unreadable-directory" | "outside-root" | "duplicate-source" | "no-history" | "too-many-files" | "too-many-bytes" | "directory-changed";

export interface UnreadFile {
  /** The index of the --from (1, 2, …). */
  source: number;
  /** The file's name (it matches HISTORY_NAME, so it is a stamp). */
  file: string;
  reason: UnreadReason;
  /** The errno name (`EACCES`) for unreadable, `size-changed` when the size moved while it was read, else null. */
  code: string | null;
}

export interface SourceSummary {
  index: number;
  historyFiles: number;
  /** Read with a good shape (duplicates included). */
  read: number;
  unread: number;
  /** Read, but the same bytes as a file read before (counted once, Q7). */
  duplicates: number;
  ignored: number;
  leftoverTemporary: number;
}

export interface RunParsed {
  tool: ParserTool | null;
  status: "parsed" | "unparsed" | "not-applicable";
  truncated: boolean;
  /** Only the keys of COUNT_KEYS for the tool, in their order. */
  counts: ReadonlyMap<string, number>;
}

export interface RunCheck {
  name: string;
  kind: CheckKind;
  required: boolean;
  status: CheckStatus;
  durationMs: number;
  timedOut: boolean;
  timeoutSec: number;
  parsed: RunParsed | null;
}

/** One run, with only the fields the aggregate uses. The strings are as written in the file (masked when they are shown). */
export interface HistoryRun {
  source: number;
  file: string;
  project: string;
  toolVersion: string;
  configSha256: string | null;
  startedAt: string;
  startedMs: number;
  durationMs: number;
  verdict: Verdict;
  dirty: boolean | null;
  interrupted: boolean;
  checks: RunCheck[];
}

export type ReadResult =
  | { ok: true; sources: SourceSummary[]; unread: UnreadFile[]; runs: HistoryRun[] }
  | { ok: false; kind: InputErrorKind; source: number | null; detail: string };

/** For tests: the limits, the chunk size and four points of the reading can be replaced. Not reachable from the config or the CLI. */
export interface ReadDeps {
  limits?: Partial<ReadLimits>;
  chunkBytes?: number;
  /** After the lstat of a file said it is a regular file, before it is opened. */
  afterLstat?: (file: string) => void;
  /** After each chunk read from a file (with the bytes read so far), the descriptor still open. */
  afterChunk?: (file: string, bytesRead: number) => void;
  /** After the bytes of a file were read, before its size is looked at again. */
  afterFileRead?: (file: string) => void;
  /** After every file of every source was read, before the directories are looked at again. */
  afterAllRead?: () => void;
}

const COUNT = z.number().int().min(0).refine(Number.isSafeInteger);
const bytesAtMost = (max: number) => (s: string): boolean => Buffer.byteLength(s, "utf8") <= max;
const NAME = z.string().min(1).refine(bytesAtMost(NAME_MAX_BYTES));
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STARTED_AT = z
  .string()
  .regex(ISO_TIME)
  .refine((s) => {
    const t = Date.parse(s);
    return Number.isFinite(t) && new Date(t).toISOString() === s;
  });
const PARSED = z.object({
  tool: z.enum(PARSER_TOOLS).nullable(),
  status: z.enum(["parsed", "unparsed", "not-applicable"]),
  truncated: z.boolean(),
  counts: z.record(z.string(), COUNT),
});
const CHECK = z.object({
  name: NAME,
  kind: z.enum(CHECK_KINDS),
  required: z.boolean(),
  status: z.enum(["PASS", "FAIL", "SKIPPED"]),
  durationMs: COUNT,
  timedOut: z.boolean(),
  // The config's rule (src/config/schema.ts): a positive integer.
  timeoutSec: z.number().int().min(1).refine(Number.isSafeInteger),
  parsed: PARSED.optional(),
});
/** The fields read from a report; zod drops every other key (ADR-0034 C, the list of fields not read). */
const REPORT = z.object({
  schemaVersion: z.literal(1),
  tool: z.object({ version: z.string().refine(bytesAtMost(VERSION_MAX_BYTES)) }),
  project: z.object({ name: NAME }),
  configSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  startedAt: STARTED_AT,
  durationMs: COUNT,
  verdict: z.enum(["PASSED", "FAILED", "ERROR"]),
  exitCode: z.number().int().refine(Number.isSafeInteger),
  interruptedBy: z.string().max(64).nullable().optional(),
  git: z.object({ dirty: z.boolean().nullable() }).nullable(),
  summary: z.object({ total: COUNT, passed: COUNT, failed: COUNT, skipped: COUNT, requiredFailed: COUNT }),
  checks: z.array(CHECK).max(CHECKS_MAX),
});

type Outcome = { ok: true; run: HistoryRun; sha256: string } | { ok: false; reason: UnreadReason; code: string | null };

interface Source {
  index: number;
  /** The history directory (its realpath): files are listed and opened from here. */
  base: string;
  /** The paths whose identity is compared before and after the reading. */
  watched: string[];
  names: string[];
}

interface Identity {
  kind: string;
  dev: bigint;
  ino: bigint;
}

function errno(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code;
  return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : "error";
}

function inputError(kind: InputErrorKind, source: number | null, detail: string): ReadResult {
  return { ok: false, kind, source, detail };
}

function inside(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** The kind, dev and ino of a path (lstat: the last element is not followed, the ones before it are), or a missing mark. */
function identity(p: string): Identity {
  try {
    const st = lstatSync(p, { bigint: true });
    return { kind: st.isDirectory() ? "directory" : st.isSymbolicLink() ? "symlink" : "other", dev: st.dev, ino: st.ino };
  } catch (err) {
    return { kind: `missing:${errno(err)}`, dev: -1n, ino: -1n };
  }
}

/** Resolve one --from (ADR-0034 B): a project root or a history directory. */
function resolveSource(index: number, from: string, cwd: string): Source | ReadResult {
  const given = path.resolve(cwd, from);
  let real: string;
  try {
    real = realpathSync(given);
  } catch (err) {
    return errno(err) === "ENOENT" ? inputError("not-found", index, "does not exist") : inputError("unreadable-directory", index, `cannot be examined (${errno(err)})`);
  }
  try {
    if (!statSync(real).isDirectory()) return inputError("not-a-directory", index, "is not a directory");
  } catch (err) {
    return inputError("unreadable-directory", index, `cannot be examined (${errno(err)})`);
  }
  const candidate = path.join(real, "artifacts", "verification", "history");
  let rootForm: boolean;
  try {
    rootForm = lstatSync(candidate).isDirectory();
  } catch (err) {
    if (errno(err) !== "ENOENT") return inputError("unreadable-directory", index, `its artifacts/verification/history cannot be examined (${errno(err)})`);
    rootForm = false;
  }
  let base = real;
  let watched = [real];
  if (rootForm) {
    try {
      base = realpathSync(candidate);
    } catch (err) {
      return inputError("unreadable-directory", index, `its artifacts/verification/history cannot be examined (${errno(err)})`);
    }
    if (!inside(real, base)) return inputError("outside-root", index, "its artifacts/verification/history resolves outside the project root");
    watched = [...new Set([real, path.join(real, "artifacts"), path.join(real, "artifacts", "verification"), candidate, base])];
  }
  let names: string[];
  try {
    names = readdirSync(base).sort();
  } catch (err) {
    return inputError("unreadable-directory", index, `the history directory cannot be listed (${errno(err)})`);
  }
  return { index, base, watched, names };
}

/** Read one history file (ADR-0034 C). `bytes` is what was read from its descriptor (it counts against the total). */
function readOne(file: string, source: number, name: string, buffer: Buffer, limits: ReadLimits, deps: ReadDeps): { bytes: number; outcome: Outcome } {
  const unread = (bytes: number, reason: UnreadReason, code: string | null = null): { bytes: number; outcome: Outcome } => ({ bytes, outcome: { ok: false, reason, code } });
  try {
    if (!lstatSync(file).isFile()) return unread(0, "not-regular");
  } catch (err) {
    return unread(0, "unreadable", errno(err));
  }
  deps.afterLstat?.(file);
  let fd: number;
  try {
    fd = openSync(file, constants.O_RDONLY | NOFOLLOW);
  } catch (err) {
    // A symbolic link put there after the lstat: O_NOFOLLOW refuses it (ELOOP), and it is not a regular file.
    return errno(err) === "ELOOP" ? unread(0, "not-regular") : unread(0, "unreadable", errno(err));
  }
  let n = 0;
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) return unread(0, "not-regular");
    const cap = limits.fileBytes + 1;
    const chunk = deps.chunkBytes ?? CHUNK_BYTES;
    while (n < cap) {
      const got = readSync(fd, buffer, n, Math.min(chunk, cap - n), null);
      if (got === 0) break;
      n += got;
      deps.afterChunk?.(file, n);
    }
    deps.afterFileRead?.(file);
    if (n > limits.fileBytes) return unread(n, "too-large");
    const after = fstatSync(fd);
    if (before.size !== n || after.size !== n) return unread(n, "unreadable", "size-changed");
  } catch (err) {
    return unread(n, "unreadable", errno(err));
  } finally {
    closeSync(fd);
  }
  if (n === 0) return unread(0, "empty");
  const bytes = buffer.subarray(0, n);
  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) return unread(n, "not-utf8");
  let value: unknown;
  try {
    value = JSON.parse(decoded.text);
  } catch {
    return unread(n, "not-json");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.hasOwn(value, "schemaVersion") || (value as { schemaVersion: unknown }).schemaVersion !== 1) {
    return unread(n, "unknown-version");
  }
  // The number of checks before zod looks at each of them (R1-003: a bound before the work).
  const checks = (value as { checks?: unknown }).checks;
  if (Array.isArray(checks) && checks.length > CHECKS_MAX) return unread(n, "bad-shape");
  // Only what zod returns (the fields read) is kept; the parsed value goes when this function returns.
  const shape = REPORT.safeParse(value);
  if (!shape.success) return unread(n, "bad-shape");
  const r = shape.data;
  const run: HistoryRun = {
    source,
    file: name,
    project: r.project.name,
    toolVersion: r.tool.version,
    configSha256: r.configSha256 ?? null,
    startedAt: r.startedAt,
    startedMs: Date.parse(r.startedAt),
    durationMs: r.durationMs,
    verdict: r.verdict,
    dirty: r.git === null ? null : r.git.dirty,
    interrupted: r.interruptedBy !== undefined && r.interruptedBy !== null,
    checks: r.checks.map((c) => {
      let parsed: RunParsed | null = null;
      if (c.parsed !== undefined) {
        const counts = new Map<string, number>();
        const tool = c.parsed.tool;
        if (tool !== null) {
          for (const key of COUNT_KEYS[tool]) {
            const v = Object.hasOwn(c.parsed.counts, key) ? c.parsed.counts[key] : undefined;
            if (v !== undefined) counts.set(key, v);
          }
        }
        parsed = { tool, status: c.parsed.status, truncated: c.parsed.truncated, counts };
      }
      return { name: c.name, kind: c.kind, required: c.required, status: c.status, durationMs: c.durationMs, timedOut: c.timedOut, timeoutSec: c.timeoutSec, parsed };
    }),
  };
  return { bytes: n, outcome: { ok: true, run, sha256: createHash("sha256").update(bytes).digest("hex") } };
}

/**
 * Read the history of every --from (in order; sources are numbered from 1). An input error stops everything (nothing is aggregated);
 * a file that cannot be read is listed as unread and the reading goes on (D4).
 */
export function readHistory(froms: readonly string[], cwd: string, deps: ReadDeps = {}): ReadResult {
  const limits: ReadLimits = { ...READ_LIMITS, ...deps.limits };
  const sources: Source[] = [];
  for (const [i, from] of froms.entries()) {
    const s = resolveSource(i + 1, from, cwd);
    if ("ok" in s) return s;
    const same = sources.find((x) => x.base === s.base);
    if (same !== undefined) return inputError("duplicate-source", s.index, `is the same history directory as #${same.index}`);
    sources.push(s);
  }
  const histories = sources.map((s) => s.names.filter((n) => HISTORY_NAME.test(n)));
  for (const [i, s] of sources.entries()) {
    if ((histories[i] ?? []).length === 0) return inputError("no-history", s.index, "has no history file (<stamp>.json)");
  }
  const totalFiles = histories.reduce((a, h) => a + h.length, 0);
  if (totalFiles > limits.totalFiles) return inputError("too-many-files", null, `${totalFiles} history files, more than ${limits.totalFiles}`);

  const before = new Map<string, Identity>();
  for (const s of sources) for (const p of s.watched) before.set(p, identity(p));

  const buffer = Buffer.alloc(limits.fileBytes + 1);
  const summaries: SourceSummary[] = [];
  const unread: UnreadFile[] = [];
  const runs: HistoryRun[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const [i, s] of sources.entries()) {
    const names = histories[i] ?? [];
    const summary: SourceSummary = {
      index: s.index,
      historyFiles: names.length,
      read: 0,
      unread: 0,
      duplicates: 0,
      ignored: s.names.filter((n) => !HISTORY_NAME.test(n) && !LEFTOVER_TEMPORARY.test(n)).length,
      leftoverTemporary: s.names.filter((n) => LEFTOVER_TEMPORARY.test(n)).length,
    };
    for (const name of names) {
      const { bytes, outcome } = readOne(path.join(s.base, name), s.index, name, buffer, limits, deps);
      totalBytes += bytes;
      if (totalBytes > limits.totalBytes) return inputError("too-many-bytes", null, `more than ${limits.totalBytes} bytes read`);
      if (!outcome.ok) {
        summary.unread += 1;
        unread.push({ source: s.index, file: name, reason: outcome.reason, code: outcome.code });
        continue;
      }
      summary.read += 1;
      if (seen.has(outcome.sha256)) {
        summary.duplicates += 1;
        continue;
      }
      seen.add(outcome.sha256);
      runs.push(outcome.run);
    }
    summaries.push(summary);
  }
  deps.afterAllRead?.();
  for (const s of sources) {
    for (const p of s.watched) {
      const a = before.get(p);
      const b = identity(p);
      if (a === undefined || a.kind !== b.kind || a.dev !== b.dev || a.ino !== b.ino) return inputError("directory-changed", s.index, "a directory changed while the history was read");
    }
  }
  return { ok: true, sources: summaries, unread, runs };
}
