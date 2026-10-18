/**
 * aiqh history, the aggregate (ADR-0034 E–G, N): the runs read by read.ts, grouped by project name (D3), as the `--json` document.
 * - Only numbers, fixed words, dates and the allowlisted strings (ADR-0034 F): project and check names (masked, then cut to 200
 *   characters), tool.version (masked, then 64), the config hash. A name is masked once, when it is collected; the whole document
 *   is never given to the masker (M4-D-R2-001: safeJson masks string by string).
 * - Every object key is a fixed word, so a JSON path names no value (ADR-0035's data-k). Ratios are rounded to 4 decimal places.
 * - maxShareOfTimeout is the largest share of a run's own timeout (M4-D-R2-002); the last run's timeout is lastTimeoutSec.
 * - The numeric leaves are counted while the document is built and stop it past the limit (Q10: too-many-values); every number is
 *   checked to be finite at the end (M4-D-R2-003: non-finite, a guard that the input ranges of read.ts should never let fire).
 */
import { COUNT_KEYS } from "../parse/read.ts";
import { maskSecrets } from "../security/mask.ts";
import { PARSER_TOOLS, type CheckKind, type ParserTool, type Verdict } from "../types.ts";
import type { HistoryRun, ReadResult, RunCheck, SourceSummary, UnreadFile } from "./read.ts";

/** Characters of a project or check name as shown (after the mask). */
export const NAME_DISPLAY_MAX = 200;
/** Characters of tool.version as shown (after the mask). */
export const VERSION_DISPLAY_MAX = 64;
/** Numeric leaves of the document (Q10). */
export const VALUES_MAX = 200_000;
/** A check is failure-prone material with at least this many PASS + FAIL runs; the list keeps the first FAILURE_PRONE_TOP. */
export const FAILURE_PRONE_MIN = 3;
export const FAILURE_PRONE_TOP = 10;

export interface DayAggregate {
  day: string;
  runs: number;
  PASSED: number;
  FAILED: number;
  ERROR: number;
}

export interface VersionSegment {
  version: string;
  first: string;
  last: string;
  runs: number;
}

export interface ConfigSegment {
  sha256: string | null;
  first: string;
  last: string;
  runs: number;
}

export interface CheckAggregate {
  name: string;
  kind: CheckKind;
  required: boolean;
  runs: number;
  PASS: number;
  FAIL: number;
  SKIPPED: number;
  failRate: number | null;
  timedOut: number;
  durationMs: { median: number; max: number };
  lastTimeoutSec: number;
  maxShareOfTimeout: number;
}

export interface CountDay {
  day: string;
  value: number | null;
  unknownRuns: number;
  truncated: boolean;
}

export interface CountSeries {
  check: string;
  tool: ParserTool;
  key: string;
  days: CountDay[];
}

export interface ProjectAggregate {
  name: string;
  sources: number[];
  runs: number;
  verdicts: { PASSED: number; FAILED: number; ERROR: number };
  dirty: { true: number; false: number; unknown: number };
  interrupted: number;
  first: string;
  last: string;
  durationMs: { median: number; max: number };
  days: DayAggregate[];
  toolVersions: VersionSegment[];
  configs: ConfigSegment[];
  checks: CheckAggregate[];
  counts: CountSeries[];
}

export interface FailureProne {
  project: string;
  check: string;
  PASS: number;
  FAIL: number;
  failRate: number;
}

/** The `--json` document (ADR-0034 G). `schemaVersion` changes only when a field is removed, renamed or changes its type or meaning. */
export interface HistoryAggregate {
  kind: "aiqh-history";
  schemaVersion: 1;
  tool: { version: string };
  complete: boolean;
  sources: SourceSummary[];
  unread: UnreadFile[];
  projects: ProjectAggregate[];
  failureProne: FailureProne[];
}

export type AggregateResult = { ok: true; value: HistoryAggregate; values: number } | { ok: false; kind: "too-many-values" | "non-finite" };

/** For tests: the limit of numeric leaves, and a look at the document before the finite check. Not reachable from the CLI. */
export interface AggregateDeps {
  valuesMax?: number;
  beforeFiniteCheck?: (value: HistoryAggregate) => void;
}

class TooManyValues extends Error {}

/** Counts the numeric leaves (numbers and the nulls that stand for one) as the document grows. */
class Values {
  n = 0;
  private readonly max: number;
  constructor(max: number) {
    this.max = max;
  }
  add(k: number): void {
    this.n += k;
    if (this.n > this.max) throw new TooManyValues();
  }
}

/** x rounded to 4 decimal places (the same text in the JSON and in the HTML, ADR-0035). */
export function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/** The median of a non-empty list (the floor((n - 1) / 2)-th of the sorted values) and its largest value. */
function medianMax(values: readonly number[]): { median: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor((sorted.length - 1) / 2)] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
}

/** A name or a version as shown: masked, then cut to `max` characters (code points, so a pair is never split). */
function shown(raw: string, max: number, cache: Map<string, string>): string {
  const key = `${max}\u0000${raw}`;
  let s = cache.get(key);
  if (s === undefined) {
    const masked = maskSecrets(raw);
    const chars = Array.from(masked);
    s = chars.length <= max ? masked : chars.slice(0, max).join("");
    cache.set(key, s);
  }
  return s;
}

/** The value of `key` from a parsed run of `tool`, or undefined. */
function countOf(c: RunCheck, tool: ParserTool, key: string): number | undefined {
  return c.parsed !== null && c.parsed.status === "parsed" && c.parsed.tool === tool ? c.parsed.counts.get(key) : undefined;
}

/** Whether every number of the document is finite (a guard after the arithmetic). */
function allFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v !== null && typeof v === "object") return Object.values(v).every(allFinite);
  return true;
}

interface CheckState {
  raw: string;
  kind: CheckKind;
  required: boolean;
  lastTimeoutSec: number;
  runs: number;
  PASS: number;
  FAIL: number;
  SKIPPED: number;
  timedOut: number;
  durations: number[];
  maxShare: number;
  /** The runs of this check by day, in time order. */
  byDay: Map<string, RunCheck[]>;
}

function projectOf(name: string, runs: readonly HistoryRun[], values: Values, names: Map<string, string>): { project: ProjectAggregate; rawChecks: string[] } {
  const sources = [...new Set(runs.map((r) => r.source))].sort((a, b) => a - b);
  const verdicts: Record<Verdict, number> = { PASSED: 0, FAILED: 0, ERROR: 0 };
  const dirty = { true: 0, false: 0, unknown: 0 };
  let interrupted = 0;
  const days = new Map<string, DayAggregate>();
  const toolVersions: VersionSegment[] = [];
  const configs: ConfigSegment[] = [];
  const checks = new Map<string, CheckState>();
  let lastVersion: string | null = null;
  let lastConfig: string | null | undefined;
  for (const r of runs) {
    verdicts[r.verdict] += 1;
    if (r.dirty === null) dirty.unknown += 1;
    else if (r.dirty) dirty.true += 1;
    else dirty.false += 1;
    if (r.interrupted) interrupted += 1;
    const day = r.startedAt.slice(0, 10);
    let d = days.get(day);
    if (d === undefined) {
      d = { day, runs: 0, PASSED: 0, FAILED: 0, ERROR: 0 };
      days.set(day, d);
      values.add(4);
    }
    d.runs += 1;
    d[r.verdict] += 1;
    const tv = toolVersions[toolVersions.length - 1];
    if (tv !== undefined && lastVersion === r.toolVersion) {
      tv.last = r.startedAt;
      tv.runs += 1;
    } else {
      toolVersions.push({ version: shown(r.toolVersion, VERSION_DISPLAY_MAX, names), first: r.startedAt, last: r.startedAt, runs: 1 });
      lastVersion = r.toolVersion;
      values.add(1);
    }
    const cs = configs[configs.length - 1];
    if (cs !== undefined && lastConfig === r.configSha256) {
      cs.last = r.startedAt;
      cs.runs += 1;
    } else {
      configs.push({ sha256: r.configSha256, first: r.startedAt, last: r.startedAt, runs: 1 });
      lastConfig = r.configSha256;
      values.add(1);
    }
    for (const c of r.checks) {
      let s = checks.get(c.name);
      if (s === undefined) {
        s = { raw: c.name, kind: c.kind, required: c.required, lastTimeoutSec: c.timeoutSec, runs: 0, PASS: 0, FAIL: 0, SKIPPED: 0, timedOut: 0, durations: [], maxShare: 0, byDay: new Map() };
        checks.set(c.name, s);
        values.add(10);
      }
      s.kind = c.kind;
      s.required = c.required;
      s.lastTimeoutSec = c.timeoutSec;
      s.runs += 1;
      s[c.status] += 1;
      if (c.timedOut) s.timedOut += 1;
      s.durations.push(c.durationMs);
      // M4-D-R2-002: the share of this run's own timeout.
      s.maxShare = Math.max(s.maxShare, c.durationMs / (c.timeoutSec * 1000));
      const list = s.byDay.get(day);
      if (list === undefined) s.byDay.set(day, [c]);
      else list.push(c);
    }
  }
  values.add(sources.length + 10);

  const counts: CountSeries[] = [];
  for (const s of checks.values()) {
    const all = [...s.byDay.values()].flat();
    const dayList = [...s.byDay.keys()].sort();
    for (const tool of PARSER_TOOLS) {
      for (const key of COUNT_KEYS[tool]) {
        if (!all.some((c) => countOf(c, tool, key) !== undefined)) continue;
        const series: CountSeries = { check: shown(s.raw, NAME_DISPLAY_MAX, names), tool, key, days: [] };
        for (const day of dayList) {
          const list = s.byDay.get(day) ?? [];
          let value: number | null = null;
          let truncated = false;
          let unknownRuns = 0;
          for (const c of list) {
            const v = countOf(c, tool, key);
            if (v === undefined) {
              unknownRuns += 1;
              continue;
            }
            // The last run of the day that has the value (the list is in time order).
            value = v;
            truncated = c.parsed?.truncated ?? false;
          }
          series.days.push({ day, value, unknownRuns, truncated });
          values.add(2);
        }
        counts.push(series);
      }
    }
  }

  const project: ProjectAggregate = {
    name: shown(name, NAME_DISPLAY_MAX, names),
    sources,
    runs: runs.length,
    verdicts,
    dirty,
    interrupted,
    first: runs[0]?.startedAt ?? "",
    last: runs[runs.length - 1]?.startedAt ?? "",
    durationMs: medianMax(runs.map((r) => r.durationMs)),
    days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    toolVersions,
    configs,
    checks: [...checks.values()].map((s) => ({
      name: shown(s.raw, NAME_DISPLAY_MAX, names),
      kind: s.kind,
      required: s.required,
      runs: s.runs,
      PASS: s.PASS,
      FAIL: s.FAIL,
      SKIPPED: s.SKIPPED,
      failRate: s.PASS + s.FAIL === 0 ? null : round4(s.FAIL / (s.PASS + s.FAIL)),
      timedOut: s.timedOut,
      durationMs: medianMax(s.durations),
      lastTimeoutSec: s.lastTimeoutSec,
      maxShareOfTimeout: round4(s.maxShare),
    })),
    counts,
  };
  return { project, rawChecks: [...checks.keys()] };
}

/** The aggregate of a reading (ADR-0034 E–G). The runs are taken in time order (then the source and the file name, so ties are stable). */
export function aggregate(read: Extract<ReadResult, { ok: true }>, toolVersion: string, deps: AggregateDeps = {}): AggregateResult {
  const values = new Values(deps.valuesMax ?? VALUES_MAX);
  const names = new Map<string, string>();
  try {
    values.add(1 + read.sources.length * 7 + read.unread.length);
    const runs = [...read.runs].sort((a, b) => a.startedMs - b.startedMs || a.source - b.source || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    const byProject = new Map<string, HistoryRun[]>();
    for (const r of runs) {
      const list = byProject.get(r.project);
      if (list === undefined) byProject.set(r.project, [r]);
      else list.push(r);
    }
    const projectNames = [...byProject.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const built = projectNames.map((name) => ({ name, ...projectOf(name, byProject.get(name) ?? [], values, names) }));
    const projects = built.map((b) => b.project);

    const candidates: Array<FailureProne & { rawProject: string; rawCheck: string }> = [];
    for (const b of built) {
      for (const [i, c] of b.project.checks.entries()) {
        if (c.PASS + c.FAIL < FAILURE_PRONE_MIN || c.failRate === null) continue;
        candidates.push({ project: b.project.name, check: c.name, PASS: c.PASS, FAIL: c.FAIL, failRate: c.failRate, rawProject: b.name, rawCheck: b.rawChecks[i] ?? "" });
      }
    }
    candidates.sort((a, b) => b.failRate - a.failRate || b.FAIL - a.FAIL || (a.rawProject < b.rawProject ? -1 : a.rawProject > b.rawProject ? 1 : 0) || (a.rawCheck < b.rawCheck ? -1 : a.rawCheck > b.rawCheck ? 1 : 0));
    const failureProne = candidates.slice(0, FAILURE_PRONE_TOP).map(({ project, check, PASS, FAIL, failRate }) => ({ project, check, PASS, FAIL, failRate }));
    values.add(failureProne.length * 3);

    const value: HistoryAggregate = {
      kind: "aiqh-history",
      schemaVersion: 1,
      tool: { version: toolVersion },
      complete: read.unread.length === 0,
      sources: read.sources.map((s) => ({ index: s.index, historyFiles: s.historyFiles, read: s.read, unread: s.unread, duplicates: s.duplicates, ignored: s.ignored, leftoverTemporary: s.leftoverTemporary })),
      unread: read.unread.map((u) => ({ source: u.source, file: u.file, reason: u.reason, code: u.code })),
      projects,
      failureProne,
    };
    deps.beforeFiniteCheck?.(value);
    if (!allFinite(value)) return { ok: false, kind: "non-finite" };
    return { ok: true, value, values: values.n };
  } catch (err) {
    if (err instanceof TooManyValues) return { ok: false, kind: "too-many-values" };
    throw err;
  }
}
