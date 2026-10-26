/**
 * Wave 4 (v0.9.0, ADR-0031): the reusable workflow `.github/workflows/verify.yml` runs on other repositories'
 * CI, pinned by a commit SHA, with aiqh taken from the workflow's own commit (distribution D). The rules that
 * keep it read-only, pinned and fail-closed are checked here on the YAML text (no YAML library: ADR-0008).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const VERIFY = ".github/workflows/verify.yml";
const CI = ".github/workflows/ci.yml";
const SHA_PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/;

function lines(rel: string): string[] {
  const file = path.join(ROOT, rel);
  expect(existsSync(file), `${rel} exists`).toBe(true);
  return readFileSync(file, "utf8").split("\n");
}

const indentOf = (l: string): number => l.length - l.trimStart().length;
const isContent = (l: string): boolean => l.trim().length > 0 && !l.trim().startsWith("#");

/** The lines indented deeper than the key line at `at` (the key's block), comments and blank lines kept. */
function blockAfter(ls: string[], at: number): string[] {
  const base = indentOf(ls[at]!);
  const out: string[] = [];
  for (const l of ls.slice(at + 1)) {
    if (isContent(l) && indentOf(l) <= base) break;
    out.push(l);
  }
  return out;
}

/** Each step of every job: the lines from its "- " item to the next one at the same indent. */
function steps(ls: string[]): string[][] {
  const starts = ls.flatMap((l, i) => (/^ {6}- /.test(l) ? [i] : []));
  return starts.map((s) => {
    const out = [ls[s]!];
    for (const l of ls.slice(s + 1)) {
      if (isContent(l) && indentOf(l) <= 6) break;
      out.push(l);
    }
    return out;
  });
}

/** The text of every `run:` value (single line or block scalar). */
function runBlocks(ls: string[]): string[] {
  const out: string[] = [];
  ls.forEach((l, i) => {
    const m = /^(\s*(?:-\s+)?)run:\s*(.*)$/.exec(l);
    if (!m) return;
    const value = m[2]!;
    if (/^[|>]/.test(value)) {
      const keyIndent = m[1]!.length;
      const body: string[] = [];
      for (const b of ls.slice(i + 1)) {
        if (isContent(b) && indentOf(b) <= keyIndent) break;
        body.push(b);
      }
      out.push(body.join("\n"));
    } else {
      out.push(value);
    }
  });
  return out;
}

/** Steps whose env maps a variable to the given expression: [variable name, step lines]. */
function stepsWithEnv(ls: string[], expression: string): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const st of steps(ls)) {
    for (const l of st) {
      const m = /^\s+([A-Z][A-Z0-9_]*):\s*(.+?)\s*$/.exec(l);
      if (m && m[2] === `\${{ ${expression} }}`) out.push([m[1]!, st]);
    }
  }
  return out;
}

const usesValues = (ls: string[]): Array<{ value: string; line: string }> =>
  ls.flatMap((l) => {
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(l);
    return m ? [{ value: m[1]!, line: l }] : [];
  });

describe("v0.9.0 (ADR-0031): the reusable workflow verify.yml", () => {
  it("is triggered by workflow_call only", () => {
    const ls = lines(VERIFY);
    const at = ls.findIndex((l) => /^on:\s*$/.test(l));
    expect(at, "a top-level 'on:' block").toBeGreaterThan(-1);
    const triggers = blockAfter(ls, at).flatMap((l) => (/^ {2}([A-Za-z_]+):/.exec(l) ? [l.trim().replace(/:.*$/, "")] : []));
    expect(triggers).toEqual(["workflow_call"]);
  });

  it("asks for contents: read and nothing else", () => {
    const ls = lines(VERIFY);
    const at = ls.flatMap((l, i) => (/^\s*permissions:/.test(l) ? [i] : []));
    expect(at, "one permissions key").toHaveLength(1);
    expect(ls[at[0]!], "top-level permissions block").toBe("permissions:");
    expect(blockAfter(ls, at[0]!).filter(isContent).map((l) => l.trim())).toEqual(["contents: read"]);
  });

  it("pins every action to a 40-character commit SHA with the version in a trailing comment", () => {
    const uses = usesValues(lines(VERIFY));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u.value.startsWith("./") || SHA_PINNED.test(u.value), `pinned by SHA: ${u.value}`).toBe(true);
      if (!u.value.startsWith("./")) expect(u.line, `version comment: ${u.value}`).toMatch(/#\s*v\d+\.\d+\.\d+\s*$/);
    }
  });

  it("uses the same checkout and setup-node commits as ci.yml", () => {
    const pick = (rel: string, name: string): string[] => [...new Set(usesValues(lines(rel)).map((u) => u.value).filter((v) => v.startsWith(`actions/${name}@`)))];
    for (const name of ["checkout", "setup-node"]) {
      const inCi = pick(CI, name);
      expect(inCi, `ci.yml uses one ${name} commit`).toHaveLength(1);
      expect(pick(VERIFY, name), name).toEqual(inCi);
    }
  });

  it("puts no ${{ }} expression inside a run: script (inputs reach scripts through env:)", () => {
    const runs = runBlocks(lines(VERIFY));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r, "no ${{ inputs. in run:").not.toContain("${{ inputs.");
      expect(r, "no ${{ in run:").not.toContain("${{");
    }
  });

  it('sets npm_config_ignore_scripts: "true" in the job env', () => {
    const ls = lines(VERIFY);
    const envAt = ls.flatMap((l, i) => (/^ {4}env:\s*$/.test(l) ? [i] : []));
    expect(envAt, "a job-level env block").toHaveLength(1);
    expect(blockAfter(ls, envAt[0]!).map((l) => l.trim())).toContain('npm_config_ignore_scripts: "true"');
  });

  it("checks out the caller under target/ and aiqh under aiqh-src/ at job.workflow_sha, without persisted credentials", () => {
    const checkouts = steps(lines(VERIFY)).filter((st) => st.some((l) => /uses:\s*actions\/checkout@/.test(l)));
    expect(checkouts).toHaveLength(2);
    for (const st of checkouts) expect(st.map((l) => l.trim())).toContain("persist-credentials: false");
    const [caller, aiqh] = checkouts.map((st) => st.map((l) => l.trim()));
    expect(caller).toContain("path: target");
    expect(caller!.some((l) => l.startsWith("repository:") || l.startsWith("ref:")), "the caller checkout keeps the defaults").toBe(false);
    expect(aiqh).toEqual(expect.arrayContaining(["path: aiqh-src", "repository: ${{ job.workflow_repository }}", "ref: ${{ job.workflow_sha }}"]));
  });

  it("stops unless the aiqh checkout is job.workflow_sha (fail closed), then installs runtime dependencies only", () => {
    const ls = lines(VERIFY);
    const matched = stepsWithEnv(ls, "job.workflow_sha").filter(([name, st]) => {
      const run = runBlocks(st).join("\n");
      return run.includes("git rev-parse HEAD") && run.includes(`$${name}`) && /exit 1/.test(run);
    });
    expect(matched, "a step compares git rev-parse HEAD with job.workflow_sha and exits 1 otherwise").toHaveLength(1);
    const run = runBlocks(matched[0]![1]).join("\n");
    expect(run).toContain("npm ci --omit=dev");
    expect(run.indexOf("git rev-parse HEAD"), "the comparison comes before npm ci").toBeLessThan(run.indexOf("npm ci"));
    expect(run).toContain("$RUNNER_TEMP/aiqh-bin");
    expect(run).toContain("$GITHUB_PATH");
  });

  it("refuses a working-directory with '..' before any step runs in it", () => {
    const ls = lines(VERIFY);
    const all = steps(ls);
    const guard = stepsWithEnv(ls, "inputs.working-directory").filter(([, st]) => runBlocks(st).join("\n").includes("/../"));
    expect(guard, "a step rejects '..' in working-directory").toHaveLength(1);
    const guardAt = all.indexOf(guard[0]![1]);
    const usersAt = all.flatMap((st, i) => (st.some((l) => /working-directory:\s*target\/\$\{\{ inputs\.working-directory \}\}/.test(l)) ? [i] : []));
    expect(usersAt.length).toBeGreaterThan(0);
    expect(Math.min(...usersAt), "the check comes first").toBeGreaterThan(guardAt);
  });

  it("fails with a clear message on Node.js older than 24", () => {
    const runs = runBlocks(lines(VERIFY)).filter((r) => r.includes("process.versions.node"));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatch(/-lt 24/);
    expect(runs[0]).toMatch(/needs Node\.js 24 or later/);
  });

  it("uploads no artifact and adds latest.md to the job summary only when job-summary is true", () => {
    const ls = lines(VERIFY);
    expect(ls.join("\n")).not.toContain("actions/upload-artifact");
    const summary = steps(ls).filter((st) => runBlocks(st).join("\n").includes("$GITHUB_STEP_SUMMARY"));
    expect(summary).toHaveLength(1);
    const cond = summary[0]!.find((l) => /^\s+if:/.test(l)) ?? "";
    expect(cond).toContain("inputs.job-summary");
    // v0.15.1 (item 51): the latest.md of this run, in the directory that the verify step names (was artifacts/verification/latest.md)
    expect(runBlocks(summary[0]!).join("\n")).toContain('"$REPORT_DIR/latest.md"');
  });
});

/** The step whose `- name:` is `name`. */
function step(ls: string[], name: string): string[] {
  const found = steps(ls).filter((st) => st[0]!.trim() === `- name: ${name}`);
  expect(found, `one step named ${name}`).toHaveLength(1);
  return found[0]!;
}

describe("v0.15.1 (ROADMAP item 51): the job summary reads the report of this run, wherever the config and output.dir are", () => {
  it("W1: the verify step has id verify; only with job-summary it writes report-dir (a new mktemp -d directory) before it runs verify --output-dir there", () => {
    const st = step(lines(VERIFY), "aiqh verify");
    const trimmed = st.map((l) => l.trim());
    expect(trimmed).toContain("id: verify");
    expect(trimmed).toContain("JOB_SUMMARY: ${{ inputs.job-summary }}");
    const run = runBlocks(st).join("\n");
    const branch = run.slice(run.indexOf('if [ "$JOB_SUMMARY" = "true" ]; then'), run.indexOf("else"));
    expect(branch, "the job-summary branch").toContain('dir="$(mktemp -d "$RUNNER_TEMP/aiqh-verification.XXXXXX")"');
    expect(branch.indexOf('echo "report-dir=$dir" >> "$GITHUB_OUTPUT"'), "report-dir is written").toBeGreaterThan(-1);
    expect(branch.indexOf('echo "report-dir=$dir" >> "$GITHUB_OUTPUT"'), "before verify runs").toBeLessThan(branch.indexOf('aiqh verify --config "$AIQH_CONFIG" --output-dir "$dir"'));
  });
  it("W2: the summary step reads REPORT_DIR (the report-dir of the verify step) and adds a fixed line when latest.md is not there", () => {
    const st = step(lines(VERIFY), "Append latest.md to the job summary");
    expect(st.map((l) => l.trim())).toContain("REPORT_DIR: ${{ steps.verify.outputs.report-dir }}");
    const run = runBlocks(st).join("\n");
    expect(run).toContain('if [ -n "$REPORT_DIR" ] && [ -f "$REPORT_DIR/latest.md" ]; then');
    expect(run).toContain('cat "$REPORT_DIR/latest.md" >> "$GITHUB_STEP_SUMMARY"');
    expect(run).toContain('echo "aiqh: latest.md was not written (see the log of the aiqh verify step)" >> "$GITHUB_STEP_SUMMARY"');
    expect(run, "nothing is read from the working directory").not.toContain("artifacts/verification");
  });
  it("W3: without job-summary, verify is called as before (no --output-dir)", () => {
    const run = runBlocks(step(lines(VERIFY), "aiqh verify")).join("\n");
    // the else branch (before v0.15.1 the whole body had no branch)
    const otherwise = run.includes("else") ? run.slice(run.indexOf("else")) : run;
    expect(otherwise.split("\n").map((l) => l.trim())).toContain('aiqh verify --config "$AIQH_CONFIG"');
    expect(otherwise).not.toContain("--output-dir");
  });
});
