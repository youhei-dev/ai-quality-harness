/**
 * v0.15.1 (ROADMAP item 51; batch2 design, final, §2.8, W4–W10): the run: bodies of the two last steps of verify.yml ("aiqh verify"
 * and "Append latest.md to the job summary"), run by bash the way GitHub runs a step without `shell:` (bash -e), with a fake aiqh first
 * on PATH and a temporary RUNNER_TEMP, GITHUB_OUTPUT and GITHUB_STEP_SUMMARY. The summary step gets the report-dir that the verify step
 * wrote to GITHUB_OUTPUT as REPORT_DIR, like `steps.verify.outputs.report-dir`. The fake aiqh writes latest.md where verify would
 * (into --output-dir, or into <directory of the config>/<output.dir>), or not at all, and exits with the code of the scenario.
 * bash is a probed tool (tests/structure/process-guard.ts): where it is not on PATH (the unit-minpath check), these tests skip.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const HAS_BASH = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
const NOT_WRITTEN = "aiqh: latest.md was not written (see the log of the aiqh verify step)";

const FAKE_AIQH = `#!/bin/sh
# fake aiqh: --version; verify --config C [--output-dir D]
if [ "\${1:-}" = "--version" ]; then echo "0.0.0-fake"; exit 0; fi
[ "\${1:-}" = "verify" ] || exit 64
shift
config=""; outdir=""
while [ $# -gt 0 ]; do
  case "$1" in
    --config) config="$2"; shift 2 ;;
    --output-dir) outdir="$2"; shift 2 ;;
    *) exit 64 ;;
  esac
done
if [ -z "$outdir" ]; then outdir="$(dirname "$config")/\${FAKE_OUTPUT_DIR:-artifacts/verification}"; fi
if [ "\${FAKE_WRITE:-1}" = "1" ]; then mkdir -p "$outdir"; printf '# report %s\\n' "\${FAKE_MARK:-}" > "$outdir/latest.md"; fi
exit "\${FAKE_EXIT:-0}"
`;

/** The run: body of the step `- name: <name>` of verify.yml (a block scalar). */
function body(name: string): string {
  const ls = readFileSync(path.join(ROOT, ".github", "workflows", "verify.yml"), "utf8").split("\n");
  const at = ls.findIndex((l) => l.trim() === `- name: ${name}`);
  if (at === -1) throw new Error(`no step ${name}`);
  const run = ls.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l));
  if (run === -1) throw new Error(`no run: | in ${name}`);
  const indent = (l: string): number => l.length - l.trimStart().length;
  const out: string[] = [];
  for (const l of ls.slice(run + 1)) {
    if (l.trim().length > 0 && indent(l) <= indent(ls[run] ?? "")) break;
    out.push(l.trim().length > 0 ? l.slice(indent(ls[run + 1] ?? "")) : "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

interface Scenario {
  config: string;
  env?: Record<string, string>;
  /** An older latest.md: in the working directory's artifacts/verification, or in RUNNER_TEMP/aiqh-verification. */
  stale?: "work" | "runner-temp";
}

describe.skipIf(!HAS_BASH)("v0.15.1 (ROADMAP item 51): the two steps of verify.yml, run with job-summary: true", () => {
  /** Runs both steps; returns the exit code of the verify step, the job summary and the report-dir. */
  const run = (mark: string, s: Scenario): { verifyExit: number | null; summary: string; reportDir: string } => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const work = path.join(dir, "work");
    const bin = path.join(dir, "bin");
    const runnerTemp = path.join(dir, "runner-temp");
    for (const d of [path.join(work, "sub"), bin, runnerTemp]) mkdirSync(d, { recursive: true });
    writeFileSync(path.join(bin, "aiqh"), FAKE_AIQH);
    chmodSync(path.join(bin, "aiqh"), 0o755);
    if (s.stale === "work") {
      mkdirSync(path.join(work, "artifacts", "verification"), { recursive: true });
      writeFileSync(path.join(work, "artifacts", "verification", "latest.md"), "# report STALE\n");
    }
    if (s.stale === "runner-temp") {
      mkdirSync(path.join(runnerTemp, "aiqh-verification"), { recursive: true });
      writeFileSync(path.join(runnerTemp, "aiqh-verification", "latest.md"), "# report STALE\n");
    }
    const output = path.join(dir, "github-output");
    const summary = path.join(dir, "step-summary");
    writeFileSync(output, "");
    writeFileSync(summary, "");
    const verifyStep = path.join(dir, "verify.sh");
    const summaryStep = path.join(dir, "summary.sh");
    writeFileSync(verifyStep, body("aiqh verify"));
    writeFileSync(summaryStep, body("Append latest.md to the job summary"));
    const github = { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
    const verify = spawnSync("bash", ["-e", verifyStep], { cwd: work, env: { ...github, JOB_SUMMARY: "true", AIQH_CONFIG: s.config, FAKE_MARK: mark, ...s.env }, encoding: "utf8" });
    const reportDir = /^report-dir=(.*)$/m.exec(readFileSync(output, "utf8"))?.[1] ?? "";
    const append = spawnSync("bash", ["-e", summaryStep], { cwd: work, env: { ...github, REPORT_DIR: reportDir }, encoding: "utf8" });
    expect(append.status, append.stderr).toBe(0);
    if (reportDir !== "") {
      // a new directory of this run in RUNNER_TEMP (mktemp -d), never the fixed name of W9
      expect(path.dirname(reportDir)).toBe(runnerTemp);
      expect(path.basename(reportDir)).toMatch(/^aiqh-verification\.[A-Za-z0-9]{6}$/);
    }
    return { verifyExit: verify.status, summary: readFileSync(summary, "utf8"), reportDir };
  };

  it("W4: the config at the top, output.dir by default: this run's latest.md", () => {
    expect(run("W4", { config: "aiqh.config.jsonc" })).toMatchObject({ verifyExit: 0, summary: "# report W4\n" });
  });
  it("W5: the config in a sub directory: this run's latest.md", () => {
    expect(run("W5", { config: "sub/aiqh.config.jsonc" })).toMatchObject({ verifyExit: 0, summary: "# report W5\n" });
  });
  it("W6: another output.dir: this run's latest.md", () => {
    expect(run("W6", { config: "aiqh.config.jsonc", env: { FAKE_OUTPUT_DIR: "reports/aiqh" } })).toMatchObject({ verifyExit: 0, summary: "# report W6\n" });
  });
  it("W7: verify wrote nothing and exited 2: the fixed line", () => {
    expect(run("W7", { config: "aiqh.config.jsonc", env: { FAKE_WRITE: "0", FAKE_EXIT: "2" } })).toMatchObject({ verifyExit: 2, summary: `${NOT_WRITTEN}\n` });
  });
  it("W8: an older latest.md in the working directory, verify wrote nothing: the fixed line, not the older report", () => {
    expect(run("W8", { config: "aiqh.config.jsonc", stale: "work", env: { FAKE_WRITE: "0", FAKE_EXIT: "2" } })).toMatchObject({ verifyExit: 2, summary: `${NOT_WRITTEN}\n` });
  });
  it("W9: an older latest.md under a fixed name in RUNNER_TEMP, verify wrote nothing: the fixed line", () => {
    expect(run("W9", { config: "aiqh.config.jsonc", stale: "runner-temp", env: { FAKE_WRITE: "0", FAKE_EXIT: "2" } })).toMatchObject({ verifyExit: 2, summary: `${NOT_WRITTEN}\n` });
  });
  it("W10: verify FAILED (exit 1) after writing: this run's latest.md", () => {
    expect(run("W10", { config: "aiqh.config.jsonc", env: { FAKE_EXIT: "1" } })).toMatchObject({ verifyExit: 1, summary: "# report W10\n" });
  });
});
