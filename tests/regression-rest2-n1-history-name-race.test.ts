/**
 * N1 (rest2 SP1): writeReports() chose the history name with existsSync() and put the file there later with renameSync(). Two runs
 * that started in the same second could both choose `<stamp>.json`; the later rename silently replaced the other run's history.
 * v0.5.41 takes the name exclusively (open with "wx") before writing, and tries the next name of the existing rule
 * (`<stamp>-2.json`, `<stamp>-3.json`, …) when it is taken.
 *
 * The race is made deterministic: node:fs is wrapped in this file so that, just before this process renames its history into
 * place, the other run's writeReports() runs to the end in a separate node process (its own pid, so its own temp file names, as with
 * two real runs). Before the fix both runs end on the same name and one history is lost (the record of the failure before the fix);
 * after it each run has its own file with its own content. The rest are controls that pass before and after the fix: the naming
 * rule, names taken by other runs are left alone, and a failed write leaves no history file under the final name.
 */
import { execFileSync } from "node:child_process";
import type * as Fs from "node:fs";
import type { PathLike } from "node:fs";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
import { writeReports, type WrittenReportPaths } from "../src/report/write.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { ResolvedConfig, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const STAMP = "20260915T123456Z";

const cleanups: Array<() => void> = [];
afterEach(() => {
  hook.beforeRename = null;
  while (cleanups.length > 0) cleanups.pop()?.();
});

function report(root: string, name: string, startedAt: string): VerificationReport {
  const config: ResolvedConfig = {
    projectRoot: root,
    configPath: path.join(root, "aiqh.config.jsonc"),
    project: { name },
    outputDir: path.join(root, "out"),
    security: DEFAULT_SECURITY,
    checks: [],
  };
  return buildReport({ config, results: [checkResult({ name: "unit", kind: "unit" })], git: null, startedAt: new Date(startedAt), finishedAt: new Date(startedAt), toolVersion: "0.0.0", runId: "00000000-0000-4000-8000-000000000000" });
}

/** The other run: writeReports() of src/report/write.ts in a separate node process (real node:fs, its own pid). */
function writeInOtherProcess(outputDir: string, r: VerificationReport): WrittenReportPaths {
  const script = `import { writeReports } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "src/report/write.ts")).href)};\nprocess.stdout.write(JSON.stringify(writeReports(JSON.parse(process.argv[2]), process.argv[1])));`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script, outputDir, JSON.stringify(r)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });
  return JSON.parse(out) as WrittenReportPaths;
}

const historyFiles = (outputDir: string): string[] => readdirSync(path.join(outputDir, "history")).sort();
const projectOf = (file: string): string => (JSON.parse(readFileSync(file, "utf8")) as VerificationReport).project.name;

describe("N1: two runs that start in the same second keep both histories", () => {
  it("the other run writes its history while this one is about to rename its own into place: two files, each with its own run", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const outputDir = path.join(tmp.dir, "out");
    const mine = report(tmp.dir, "run-a", "2026-09-15T12:34:56.100Z");
    const theirs = report(tmp.dir, "run-b", "2026-09-15T12:34:56.900Z");
    const seen: { other: WrittenReportPaths | null } = { other: null };
    hook.beforeRename = (_from, to) => {
      if (path.dirname(to) !== path.join(outputDir, "history")) return;
      hook.beforeRename = null;
      seen.other = writeInOtherProcess(outputDir, theirs);
    };
    const own = writeReports(mine, outputDir);
    const other = seen.other;
    if (other === null) throw new Error("precondition: the other run did not run inside the window");
    expect(historyFiles(outputDir)).toEqual([`${STAMP}-2.json`, `${STAMP}.json`]);
    expect(own.history).not.toBe(other.history);
    expect(projectOf(own.history)).toBe("run-a");
    expect(projectOf(other.history)).toBe("run-b");
    expect(readdirSync(path.join(outputDir, "history")).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });
});

describe("N1 controls (pass before and after the fix)", () => {
  it("names taken by other runs are skipped by the existing rule and left as they were", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const outputDir = path.join(tmp.dir, "out");
    mkdirSync(path.join(outputDir, "history"), { recursive: true });
    writeFileSync(path.join(outputDir, "history", `${STAMP}.json`), "first\n");
    writeFileSync(path.join(outputDir, "history", `${STAMP}-2.json`), "second\n");
    mkdirSync(path.join(outputDir, "history", `${STAMP}-3.json`));
    const own = writeReports(report(tmp.dir, "run-c", "2026-09-15T12:34:56.000Z"), outputDir);
    expect(own.history).toBe(path.join(outputDir, "history", `${STAMP}-4.json`));
    expect(projectOf(own.history)).toBe("run-c");
    expect(readFileSync(path.join(outputDir, "history", `${STAMP}.json`), "utf8")).toBe("first\n");
    expect(readFileSync(path.join(outputDir, "history", `${STAMP}-2.json`), "utf8")).toBe("second\n");
  });

  it("a history that cannot be put in place: the error is thrown and no file is left under the final name", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    const outputDir = path.join(tmp.dir, "out");
    hook.beforeRename = (_from, to) => {
      if (path.dirname(to) !== path.join(outputDir, "history")) return;
      throw Object.assign(new Error("simulated rename failure"), { code: "EIO" });
    };
    expect(() => writeReports(report(tmp.dir, "run-d", "2026-09-15T12:34:56.000Z"), outputDir)).toThrow("simulated rename failure");
    expect(historyFiles(outputDir).filter((f) => !f.includes(".tmp-"))).toEqual([]);
  });
});
