/**
 * v0.11.0 (ADR-0034 E–G, N): the aggregate of aiqh history. Projects by name (D3), verdicts and days in UTC, the version and config
 * segments, the checks with maxShareOfTimeout per run (M4-D-R2-002) and lastTimeoutSec, the parsed counts per day with unknown runs,
 * the security-scan numbers only (Q1), the failure-prone checks, the names masked once and cut, the fixed object keys (ADR-0035's
 * data-k), the count of numeric leaves (Q10) and the finite guard (M4-D-R2-003). The aggregate is the same for the same runs.
 */
import { describe, expect, it } from "vitest";
import { aggregate, round4, type AggregateDeps, type HistoryAggregate } from "../src/run-history/aggregate.ts";
import type { HistoryRun, ReadResult, RunCheck, SourceSummary, UnreadFile } from "../src/run-history/read.ts";
import { maskSecrets } from "../src/security/mask.ts";
import { fake } from "./helpers.ts";

type ReadOk = Extract<ReadResult, { ok: true }>;

function runCheck(over: Partial<RunCheck> = {}): RunCheck {
  return { name: "unit", kind: "unit", required: true, status: "PASS", durationMs: 1000, timedOut: false, timeoutSec: 600, parsed: null, ...over };
}

let seq = 0;
function run(over: Partial<HistoryRun> = {}): HistoryRun {
  seq += 1;
  const startedAt = over.startedAt ?? new Date(Date.UTC(2026, 0, 1) + seq * 1000).toISOString();
  return { source: 1, file: `f${seq}.json`, project: "alpha", toolVersion: "0.11.0", configSha256: "a".repeat(64), startedAt, startedMs: Date.parse(startedAt), durationMs: 1000, verdict: "PASSED", dirty: false, interrupted: false, checks: [runCheck()], ...over };
}

function source(index: number, n: number): SourceSummary {
  return { index, historyFiles: n, read: n, unread: 0, duplicates: 0, ignored: 0, leftoverTemporary: 0 };
}

function readOk(runs: HistoryRun[], unread: UnreadFile[] = []): ReadOk {
  const indices = [...new Set([1, ...runs.map((r) => r.source)])].sort((a, b) => a - b);
  return { ok: true, sources: indices.map((i) => source(i, runs.filter((r) => r.source === i).length)), unread, runs };
}

function agg(runs: HistoryRun[], deps: AggregateDeps = {}, unread: UnreadFile[] = []): HistoryAggregate {
  const r = aggregate(readOk(runs, unread), "0.11.0", deps);
  if (!r.ok) throw new Error(r.kind);
  return r.value;
}

const day = (d: number, s = 0): string => new Date(Date.UTC(2026, 0, 1 + d) + s * 1000).toISOString();

/** The numeric leaves of a document (a null in a number's place counts too). */
function numericLeaves(v: unknown, key = ""): number {
  if (typeof v === "number") return 1;
  if (v === null) return key === "failRate" || key === "value" ? 1 : 0;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + numericLeaves(x, key), 0);
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).reduce((n, [k, x]) => n + numericLeaves(x, k), 0);
  return 0;
}

const FIXED_KEYS = new Set([
  "kind", "schemaVersion", "tool", "version", "complete", "sources", "unread", "projects", "failureProne",
  "index", "historyFiles", "read", "duplicates", "ignored", "leftoverTemporary", "source", "file", "reason", "code",
  "name", "runs", "verdicts", "PASSED", "FAILED", "ERROR", "dirty", "true", "false", "unknown", "interrupted", "first", "last", "durationMs", "median", "max",
  "days", "day", "toolVersions", "configs", "sha256", "checks", "required", "PASS", "FAIL", "SKIPPED", "failRate", "timedOut", "lastTimeoutSec", "maxShareOfTimeout",
  "counts", "check", "key", "value", "unknownRuns", "truncated", "project",
]);
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out.add(k);
    keysOf(x, out);
  }
  return out;
}

describe("ADR-0034 G: the shape", () => {
  it("the top-level keys, a fixed kind and schemaVersion, and object keys that are all fixed words (no value is a key)", () => {
    const a = agg([run({ project: "x-1" }), run({ project: "y-2", checks: [runCheck({ name: "lint-9", kind: "lint" })] })]);
    expect(Object.keys(a)).toEqual(["kind", "schemaVersion", "tool", "complete", "sources", "unread", "projects", "failureProne"]);
    expect([a.kind, a.schemaVersion, a.tool.version, a.complete]).toEqual(["aiqh-history", 1, "0.11.0", true]);
    for (const k of keysOf(a)) expect(FIXED_KEYS.has(k), k).toBe(true);
    expect(Object.keys(a.projects[0] ?? {})).toEqual(["name", "sources", "runs", "verdicts", "dirty", "interrupted", "first", "last", "durationMs", "days", "toolVersions", "configs", "checks", "counts"]);
  });

  it("the same runs in another order give the same document", () => {
    const runs = [run({ project: "b" }), run({ project: "a", source: 2 }), run({ project: "a" }), run({ project: "b", verdict: "FAILED" })];
    expect(JSON.stringify(agg([...runs].reverse()))).toBe(JSON.stringify(agg(runs)));
  });

  it("complete is false when a file was not read; the unread list and the sources are carried as they are", () => {
    const unread: UnreadFile[] = [{ source: 1, file: "20260101T000000Z.json", reason: "empty", code: null }];
    const a = agg([run()], {}, unread);
    expect(a.complete).toBe(false);
    expect(a.unread).toEqual(unread);
  });
});

describe("ADR-0034 E: projects, verdicts, days and segments", () => {
  it("projects by name, in name order; a name from two sources is one project with both sources", () => {
    const a = agg([run({ project: "zeta" }), run({ project: "alpha", source: 2 }), run({ project: "alpha" })]);
    expect(a.projects.map((p) => [p.name, p.sources, p.runs])).toEqual([["alpha", [1, 2], 2], ["zeta", [1], 1]]);
  });

  it("verdicts, dirty (true / false / unknown), interrupted, first, last, the median and the largest duration", () => {
    const p = agg([
      run({ startedAt: day(0, 1), durationMs: 10, verdict: "PASSED", dirty: true }),
      run({ startedAt: day(0, 2), durationMs: 40, verdict: "FAILED", dirty: false }),
      run({ startedAt: day(1, 0), durationMs: 20, verdict: "ERROR", dirty: null, interrupted: true }),
      run({ startedAt: day(1, 1), durationMs: 30, verdict: "PASSED", dirty: false }),
    ]).projects[0];
    expect(p?.verdicts).toEqual({ PASSED: 2, FAILED: 1, ERROR: 1 });
    expect(p?.dirty).toEqual({ true: 1, false: 2, unknown: 1 });
    expect([p?.interrupted, p?.first, p?.last]).toEqual([1, day(0, 1), day(1, 1)]);
    expect(p?.durationMs).toEqual({ median: 20, max: 40 });
    expect(p?.days).toEqual([
      { day: "2026-01-01", runs: 2, PASSED: 1, FAILED: 1, ERROR: 0 },
      { day: "2026-01-02", runs: 2, PASSED: 1, FAILED: 0, ERROR: 1 },
    ]);
  });

  it("days are UTC dates of startedAt", () => {
    const p = agg([run({ startedAt: "2026-01-01T23:59:59.999Z" }), run({ startedAt: "2026-01-02T00:00:00.000Z" })]).projects[0];
    expect(p?.days.map((d) => d.day)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("version and config segments: consecutive runs with the same value; unknown config as null; a value that comes back starts a new one", () => {
    const p = agg([
      run({ startedAt: day(0, 1), toolVersion: "0.9.2", configSha256: null }),
      run({ startedAt: day(0, 2), toolVersion: "0.9.2", configSha256: null }),
      run({ startedAt: day(0, 3), toolVersion: "0.10.0", configSha256: "b".repeat(64) }),
      run({ startedAt: day(0, 4), toolVersion: "0.9.2", configSha256: "b".repeat(64) }),
    ]).projects[0];
    expect(p?.toolVersions.map((v) => [v.version, v.runs])).toEqual([["0.9.2", 2], ["0.10.0", 1], ["0.9.2", 1]]);
    expect(p?.configs.map((c) => [c.sha256, c.runs, c.first, c.last])).toEqual([[null, 2, day(0, 1), day(0, 2)], ["b".repeat(64), 2, day(0, 3), day(0, 4)]]);
  });
});

describe("ADR-0034 E: checks", () => {
  it("counts, the fail rate rounded to 4 places (null without PASS or FAIL), timeouts, durations, and kind / required / lastTimeoutSec of the last run", () => {
    const p = agg([
      run({ startedAt: day(0, 1), checks: [runCheck({ status: "PASS", durationMs: 100 }), runCheck({ name: "skip", status: "SKIPPED" })] }),
      run({ startedAt: day(0, 2), checks: [runCheck({ status: "FAIL", durationMs: 300, timedOut: true }), runCheck({ name: "skip", status: "SKIPPED" })] }),
      run({ startedAt: day(0, 3), checks: [runCheck({ status: "PASS", durationMs: 200, kind: "custom", required: false, timeoutSec: 30 })] }),
    ]).projects[0];
    expect(p?.checks).toEqual([
      { name: "unit", kind: "custom", required: false, runs: 3, PASS: 2, FAIL: 1, SKIPPED: 0, failRate: 0.3333, timedOut: 1, durationMs: { median: 200, max: 300 }, lastTimeoutSec: 30, maxShareOfTimeout: 0.0067 },
      { name: "skip", kind: "unit", required: true, runs: 2, PASS: 0, FAIL: 0, SKIPPED: 2, failRate: null, timedOut: 0, durationMs: { median: 1000, max: 1000 }, lastTimeoutSec: 600, maxShareOfTimeout: 0.0017 },
    ]);
  });

  it("M4-D-R2-002: maxShareOfTimeout is the largest share of each run's own timeout; lastTimeoutSec is a separate value", () => {
    const share = (a: [number, number], b: [number, number]): [number | undefined, number | undefined] => {
      const c = agg([run({ startedAt: day(0, 1), checks: [runCheck({ durationMs: a[0] * 1000, timeoutSec: a[1] })] }), run({ startedAt: day(0, 2), checks: [runCheck({ durationMs: b[0] * 1000, timeoutSec: b[1] })] })]).projects[0]?.checks[0];
      return [c?.maxShareOfTimeout, c?.lastTimeoutSec];
    };
    expect(share([90, 120], [20, 30])).toEqual([0.75, 30]); // the old rule (largest duration / last timeout) gave 3
    expect(share([20, 30], [90, 120])).toEqual([0.75, 120]);
    expect(share([60, 600], [120, 600])).toEqual([0.2, 600]); // one timeout: the largest duration / that timeout
    expect(share([610, 600], [1, 600])).toEqual([1.0167, 600]); // a run that timed out can pass 1
  });

  it("failure-prone: PASS + FAIL of 3 or more, by rate, then FAIL, then the names; at most 10", () => {
    const runs: HistoryRun[] = [];
    for (let c = 0; c < 12; c++) {
      for (let i = 0; i < 4; i++) runs.push(run({ checks: [runCheck({ name: `c${String(c).padStart(2, "0")}`, status: i < (c % 4) ? "FAIL" : "PASS" })] }));
    }
    runs.push(run({ checks: [runCheck({ name: "two", status: "FAIL" })] }), run({ checks: [runCheck({ name: "two", status: "FAIL" })] }));
    const f = agg(runs).failureProne;
    expect(f).toHaveLength(10);
    expect(f.map((x) => x.check).slice(0, 3)).toEqual(["c03", "c07", "c11"]);
    expect(f.every((x) => x.check !== "two")).toBe(true);
    expect(f[0]).toEqual({ project: "alpha", check: "c03", PASS: 1, FAIL: 3, failRate: 0.75 });
  });
});

describe("ADR-0034 E: parsed counts per day", () => {
  const parsed = (counts: Record<string, number>, over: Partial<NonNullable<RunCheck["parsed"]>> = {}): RunCheck["parsed"] => ({ tool: "vitest", status: "parsed", truncated: false, counts: new Map(Object.entries(counts)), ...over });

  it("the value of the last run of the day that has it; runs without it are unknown runs, never 0; a day without a value is null", () => {
    const p = agg([
      run({ startedAt: day(0, 1), checks: [runCheck({ parsed: parsed({ tests: 5 }) })] }),
      run({ startedAt: day(0, 2), checks: [runCheck({ parsed: parsed({ tests: 7 }, { truncated: true }) })] }),
      run({ startedAt: day(0, 3), checks: [runCheck({ parsed: null })] }),
      run({ startedAt: day(1, 1), checks: [runCheck({ parsed: parsed({}, { status: "unparsed" }) })] }),
      run({ startedAt: day(2, 1), checks: [runCheck({ parsed: parsed({ tests: 9 }, { tool: "eslint" }) })] }),
    ]).projects[0];
    const tests = p?.counts.find((s) => s.tool === "vitest" && s.key === "tests");
    expect(tests?.days).toEqual([
      { day: "2026-01-01", value: 7, unknownRuns: 1, truncated: true },
      { day: "2026-01-02", value: null, unknownRuns: 1, truncated: false },
      { day: "2026-01-03", value: null, unknownRuns: 1, truncated: false },
    ]);
    expect(p?.counts.map((s) => `${s.tool}.${s.key}`)).toEqual(["vitest.tests"]); // eslint's key "tests" is not one of eslint's keys
  });

  it("Q1: the security-scan numbers per day (suppressed, allowRulesUsed, expiredAllowRules, unusedAllowRules), in the order of the keys", () => {
    const counts = { findings: 0, secretShaped: 0, suppressed: 3, allowRulesUsed: 2, expiredAllowRules: 0, unusedAllowRules: 1 };
    const p = agg([run({ checks: [runCheck({ name: "security", kind: "security", parsed: parsed(counts, { tool: "aiqh-security-scan" }) })] })]).projects[0];
    expect(p?.counts.map((s) => [s.key, s.days[0]?.value])).toEqual([["findings", 0], ["secretShaped", 0], ["suppressed", 3], ["allowRulesUsed", 2], ["expiredAllowRules", 0], ["unusedAllowRules", 1]]);
  });
});

describe("ADR-0034 F: names are masked once and cut", () => {
  it("a secret-shaped project or check name is masked everywhere it is shown; a long name is cut to 200 characters, a version to 64", () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const runs = [0, 1, 2].map((i) => run({ project: `p-${secret}`, toolVersion: `${"v".repeat(70)}`, checks: [runCheck({ name: `c-${secret}`, status: i === 0 ? "PASS" : "FAIL", parsed: { tool: "vitest", status: "parsed", truncated: false, counts: new Map([["tests", 1]]) } })] }));
    runs.push(run({ project: `${"n".repeat(250)}` }));
    const a = agg(runs);
    const text = JSON.stringify(a);
    expect(text).not.toContain(secret);
    expect(a.projects.map((p) => p.name)).toEqual(["n".repeat(200), maskSecrets(`p-${secret}`)]);
    expect(maskSecrets(`p-${secret}`)).toContain("[REDACTED:");
    expect(a.failureProne[0]?.check).toBe(maskSecrets(`c-${secret}`));
    expect(a.projects.find((p) => p.name.startsWith("p-"))?.counts[0]?.check).toBe(maskSecrets(`c-${secret}`));
    expect(a.projects.find((p) => p.name.startsWith("p-"))?.toolVersions[0]?.version).toBe("v".repeat(64));
  });

  it("a cut never splits a character made of two UTF-16 units", () => {
    const name = `${"x".repeat(199)}😀😀`;
    expect(agg([run({ project: name })]).projects[0]?.name).toBe(`${"x".repeat(199)}😀`);
  });
});

describe("Q10 and M4-D-R2-003: the numeric leaves and the finite guard", () => {
  it("values is the number of numeric leaves; at the limit the document is made, one less is too-many-values", () => {
    const runs = [run({ startedAt: day(0, 1), checks: [runCheck({ parsed: { tool: "vitest", status: "parsed", truncated: false, counts: new Map([["tests", 1]]) } })] }), run({ startedAt: day(1, 1), verdict: "FAILED" })];
    const r = aggregate(readOk(runs), "t");
    if (!r.ok) throw new Error(r.kind);
    expect(r.values).toBe(numericLeaves(r.value));
    expect(aggregate(readOk(runs), "t", { valuesMax: r.values }).ok).toBe(true);
    expect(aggregate(readOk(runs), "t", { valuesMax: r.values - 1 })).toEqual({ ok: false, kind: "too-many-values" });
  });

  it("the largest durationMs with the smallest timeoutSec is still finite and the same in the JSON", () => {
    const c = agg([run({ durationMs: 2 ** 53 - 1, checks: [runCheck({ durationMs: 2 ** 53 - 1, timeoutSec: 1 })] })]).projects[0]?.checks[0];
    expect(Number.isFinite(c?.maxShareOfTimeout)).toBe(true);
    expect(c?.maxShareOfTimeout).toBe(round4((2 ** 53 - 1) / 1000));
  });

  it("a number that is not finite after the arithmetic is non-finite (only a replaced aggregate can show it)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = aggregate(readOk([run()]), "t", { beforeFiniteCheck: (v) => { const c = v.projects[0]?.checks[0]; if (c !== undefined) c.maxShareOfTimeout = bad; } });
      expect(r).toEqual({ ok: false, kind: "non-finite" });
    }
  });
});
