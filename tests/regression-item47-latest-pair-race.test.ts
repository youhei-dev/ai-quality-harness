/**
 * Item 47 (R-010), v0.13.2: the known limit, pinned (accepted, not fixed; ADR-0003 and ADR-0034 notes). writeReports() replaces
 * latest.json and latest.md one after the other (each with a rename, so no half-written file is seen), but not as a pair: a verify
 * that writes into the same output directory in between leaves latest.json of one run and latest.md of another.
 *
 * The race is made deterministic as in regression-rest2-n1-history-name-race.test.ts: node:fs is wrapped so that, just before this
 * process renames its latest.md into place, the other run's writeReports() runs to the end in a separate node process. The two runs
 * are told apart in the test by their project names (run-a, run-b); a real reader has `startedAt` and, from v0.16.0, `runId`
 * (item 52, ADR-0038: the same value in latest.json, latest.md and the history file of one run).
 *
 * - 47-c-2: different `startedAt`: the reader contract sees the difference (different values = surely different runs), and the
 *   history file with the same value as latest.json is the other run's own record. The runIds differ as well.
 * - 47-c-3: the same `startedAt` to the millisecond: the pair is still from two runs; `startedAt` cannot tell (the same value does
 *   not prove the same run, and two history files carry it), but the runIds tell them apart, and exactly one history file has
 *   latest.json's runId (v0.16.0; before it this test pinned "cannot tell").
 *
 * The pair can still be mixed (item 47 stays accepted, not fixed): v0.16.0 makes it detectable, it does not prevent it.
 */
import { execFileSync } from "node:child_process";
import type * as Fs from "node:fs";
import type { PathLike } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({ beforeRename: null as null | ((from: string, to: string) => void) }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  const renameSync = (from: PathLike, to: PathLike): void => {
    const h = hook.beforeRename;
    if (h !== null) h(String(from), String(to));
    real.renameSync(from, to);
  };
  return { ...real, renameSync, default: { ...real, renameSync } };
});

import { buildReport } from "../src/report/build-report.ts";
import { writeReports } from "../src/report/write.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { ResolvedConfig, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

const cleanups: Array<() => void> = [];
afterEach(() => {
  hook.beforeRename = null;
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A report whose clock is fixed: `startedAt` and `runId` are given (the test's run marker is the project name). */
function report(root: string, name: string, startedAt: string, runId: string): VerificationReport {
  const config: ResolvedConfig = {
    projectRoot: root,
    configPath: path.join(root, "aiqh.config.jsonc"),
    project: { name },
    outputDir: path.join(root, "out"),
    security: DEFAULT_SECURITY,
    checks: [],
  };
  return buildReport({ config, results: [checkResult({ name: "unit", kind: "unit" })], git: null, startedAt: new Date(startedAt), finishedAt: new Date(startedAt), toolVersion: "0.0.0", runId });
}

/** The other run: writeReports() of src/report/write.ts in a separate node process (real node:fs, its own pid). */
function writeInOtherProcess(outputDir: string, r: VerificationReport): void {
  const script = `import { writeReports } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "src/report/write.ts")).href)};\nwriteReports(JSON.parse(process.argv[2]), process.argv[1]);`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script, outputDir, JSON.stringify(r)], { stdio: ["ignore", "ignore", "pipe"], timeout: 20_000 });
}

/** Writes run A; just before A's latest.md is renamed into place, run B is written to the end by another process. */
function raceAB(outputDir: string, a: VerificationReport, b: VerificationReport): void {
  let ran = false;
  hook.beforeRename = (_from, to) => {
    if (to !== path.join(outputDir, "latest.md")) return;
    hook.beforeRename = null;
    writeInOtherProcess(outputDir, b);
    ran = true;
  };
  writeReports(a, outputDir);
  if (!ran) throw new Error("precondition: the other run did not run inside the window");
}

const read = (outputDir: string): { json: VerificationReport; md: string } => ({
  json: JSON.parse(readFileSync(path.join(outputDir, "latest.json"), "utf8")) as VerificationReport,
  md: readFileSync(path.join(outputDir, "latest.md"), "utf8"),
});
const startedOfMarkdown = (md: string): string | null => /^\| Started \| (.+) \|$/m.exec(md)?.[1] ?? null;
const runIdOfMarkdown = (md: string): string | null => /^\| Run ID \| (.+) \|$/m.exec(md)?.[1] ?? null;
const RUN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectOfMarkdown = (md: string): string | null => /^# Verification Report — (.+)$/m.exec(md)?.[1] ?? null;

/** The reader contract (README) before v0.16.0: different startedAt values = surely different runs; the same value proves nothing. */
const contract = (jsonStartedAt: string, mdStartedAt: string | null): "different runs" | "cannot tell" => (jsonStartedAt === mdStartedAt ? "cannot tell" : "different runs");
/** The reader contract (README) from v0.16.0 when both files have a runId: the same value = the same run, different = different runs. */
const runIdContract = (jsonRunId: string | undefined, mdRunId: string | null): "same run" | "different runs" | "no runId" =>
  jsonRunId === undefined || mdRunId === null ? "no runId" : jsonRunId === mdRunId ? "same run" : "different runs";

/** The history files whose runId is `runId` (v0.16.0), with the run each belongs to. */
function historyWithRunId(outputDir: string, runId: string | undefined): Array<{ file: string; project: string }> {
  return readdirSync(path.join(outputDir, "history"))
    .sort()
    .map((file) => ({ file, r: JSON.parse(readFileSync(path.join(outputDir, "history", file), "utf8")) as VerificationReport }))
    .filter((x) => x.r.runId === runId)
    .map((x) => ({ file: x.file, project: x.r.project.name }));
}

/** The history files whose startedAt is `startedAt` (step 4 (b) of the contract), with the run each belongs to. */
function historyWith(outputDir: string, startedAt: string): Array<{ file: string; project: string }> {
  return readdirSync(path.join(outputDir, "history"))
    .sort()
    .map((file) => ({ file, r: JSON.parse(readFileSync(path.join(outputDir, "history", file), "utf8")) as VerificationReport }))
    .filter((x) => x.r.startedAt === startedAt)
    .map((x) => ({ file: x.file, project: x.r.project.name }));
}

describe("item 47: latest.json and latest.md of different runs (a known limit, accepted)", () => {
  it("47-c-2: different startedAt: the pair is mixed, the contract sees it, and the history with latest.json's value is that run's record", () => {
    const t = makeTempDir("aiqh-item47-race-");
    cleanups.push(t.cleanup);
    const out = path.join(t.dir, "out");
    const a = report(t.dir, "run-a", "2026-09-15T12:34:56.100Z", RUN_A);
    const b = report(t.dir, "run-b", "2026-09-15T12:34:57.200Z", RUN_B);
    raceAB(out, a, b);
    const { json, md } = read(out);
    expect(json.project.name, "latest.json is run B's").toBe("run-b");
    expect(projectOfMarkdown(md), "latest.md is run A's").toBe("run-a");
    expect(contract(json.startedAt, startedOfMarkdown(md))).toBe("different runs");
    expect(runIdContract(json.runId, runIdOfMarkdown(md))).toBe("different runs");
    expect(historyWith(out, json.startedAt)).toEqual([{ file: "20260915T123457Z.json", project: "run-b" }]);
    expect(historyWith(out, a.startedAt)).toEqual([{ file: "20260915T123456Z.json", project: "run-a" }]);
  });

  it("47-c-3: the same startedAt to the millisecond: the pair is still mixed; startedAt cannot tell, the runId can (v0.16.0)", () => {
    const t = makeTempDir("aiqh-item47-same-ms-");
    cleanups.push(t.cleanup);
    const out = path.join(t.dir, "out");
    const a = report(t.dir, "run-a", "2026-09-15T12:34:56.100Z", RUN_A);
    const b = report(t.dir, "run-b", "2026-09-15T12:34:56.100Z", RUN_B);
    raceAB(out, a, b);
    const { json, md } = read(out);
    expect(json.project.name, "latest.json is run B's").toBe("run-b");
    expect(projectOfMarkdown(md), "latest.md is run A's").toBe("run-a");
    expect(contract(json.startedAt, startedOfMarkdown(md)), "the same startedAt does not prove the same run").toBe("cannot tell");
    const both = historyWith(out, json.startedAt);
    expect(both.map((x) => x.file)).toEqual(["20260915T123456Z-2.json", "20260915T123456Z.json"]);
    expect(both.map((x) => x.project).sort(), "startedAt alone cannot pick latest.json's run").toEqual(["run-a", "run-b"]);
    // v0.16.0 (item 52): the runIds tell the two runs apart, and pick latest.json's history file
    expect(runIdContract(json.runId, runIdOfMarkdown(md)), "different runIds: surely different runs").toBe("different runs");
    // (run B, written inside A's window, reserved its history name first; A got the "-2" name)
    expect(historyWithRunId(out, json.runId)).toEqual([{ file: "20260915T123456Z.json", project: "run-b" }]);
    expect(historyWithRunId(out, runIdOfMarkdown(md) ?? undefined)).toEqual([{ file: "20260915T123456Z-2.json", project: "run-a" }]);
  });

  it("control: the same two runs written one after the other leave a pair of one run", () => {
    const t = makeTempDir("aiqh-item47-seq-");
    cleanups.push(t.cleanup);
    const out = path.join(t.dir, "out");
    writeReports(report(t.dir, "run-a", "2026-09-15T12:34:56.100Z", RUN_A), out);
    writeReports(report(t.dir, "run-b", "2026-09-15T12:34:57.200Z", RUN_B), out);
    const { json, md } = read(out);
    expect(json.project.name).toBe("run-b");
    expect(projectOfMarkdown(md)).toBe("run-b");
    expect(startedOfMarkdown(md)).toBe(json.startedAt);
  });
});
