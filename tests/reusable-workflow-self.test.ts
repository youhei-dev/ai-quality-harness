/**
 * Wave 4 (v0.9.0, ADR-0031): ci.yml applies the reusable workflow to this repository itself, the way a caller
 * would use it (`uses: ./.github/workflows/verify.yml`). Checked on the YAML text (no YAML library: ADR-0008).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const CI = ".github/workflows/ci.yml";

function lines(rel: string): string[] {
  const file = path.join(ROOT, rel);
  expect(existsSync(file), `${rel} exists`).toBe(true);
  return readFileSync(file, "utf8").split("\n");
}

const indentOf = (l: string): number => l.length - l.trimStart().length;
const isContent = (l: string): boolean => l.trim().length > 0 && !l.trim().startsWith("#");

/** The job (key at indent 2 under jobs:) that contains line `at`: its key line and its block. */
function jobAround(ls: string[], at: number): string[] {
  let start = at;
  while (start > 0 && !/^ {2}[A-Za-z0-9_-]+:\s*$/.test(ls[start]!)) start -= 1;
  const out = [ls[start]!];
  for (const l of ls.slice(start + 1)) {
    if (isContent(l) && indentOf(l) <= 2) break;
    out.push(l);
  }
  return out;
}

describe("v0.9.0 (ADR-0031): ci.yml applies verify.yml to this repository", () => {
  it("has one job that calls ./.github/workflows/verify.yml, on every trigger of the workflow, with npm ci as the setup", () => {
    const ls = lines(CI);
    const at = ls.flatMap((l, i) => (/^ {4}uses:\s*\.\/\.github\/workflows\/verify\.yml\s*$/.test(l) ? [i] : []));
    expect(at, "a job-level uses: ./.github/workflows/verify.yml").toHaveLength(1);
    const job = jobAround(ls, at[0]!).map((l) => l.trim());
    expect(job).toContain("name: reusable (self)");
    expect(job).toContain("setup-command: npm ci");
    expect(job.some((l) => l.startsWith("if:")), "no if: (runs like verify (ubuntu))").toBe(false);
  });

  it("v0.15.1 (ROADMAP item 51): passes job-summary: true, so every run goes through the job summary step", () => {
    const ls = lines(CI);
    const at = ls.findIndex((l) => /^ {4}uses:\s*\.\/\.github\/workflows\/verify\.yml\s*$/.test(l));
    expect(jobAround(ls, at).map((l) => l.trim())).toContain("job-summary: true");
  });

  it("keeps verify (ubuntu) and uploads no artifact", () => {
    const text = lines(CI).join("\n");
    expect(text).toContain("name: verify (ubuntu)");
    expect(text).not.toContain("actions/upload-artifact");
  });
});
