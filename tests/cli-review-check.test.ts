/**
 * `aiqh review-check` through the real CLI (ADR-0027): the command is registered, its usage errors are exit 2 (ADR-0021), a label passes
 * (exit 0, the loop line) and a git that cannot be run is exit 2 when a resolved finding needs it (fail closed). The behaviour itself is
 * fixed by review-check.test.ts, which calls the command in process.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=aiqh-test", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A git repository with docs/reviews/demo/findings-r1.json: one open finding and one resolved by the repository's only commit. */
function repo(): string {
  const t = makeTempDir("aiqh-test-rcc-");
  cleanups.push(t.cleanup);
  git(t.dir, ["init", "-q"]);
  git(t.dir, ["commit", "-q", "--allow-empty", "-m", "fix"]);
  const sha = git(t.dir, ["rev-parse", "HEAD"]);
  const dir = path.join(t.dir, "docs", "reviews", "demo");
  mkdirSync(dir, { recursive: true });
  const f = (id: string, over: Record<string, unknown>): Record<string, unknown> => ({
    id,
    severity: "Low",
    kind: "テスト",
    target: "t",
    content: "c",
    evidence: "e",
    fix: "f",
    confidence: "推測",
    status: "open",
    verdict: null,
    action: null,
    fixedIn: null,
    regressionTest: null,
    guard: null,
    destination: null,
    note: null,
    ...over,
  });
  const doc = {
    schemaVersion: 1,
    label: "demo",
    round: 1,
    idPrefix: "P",
    source: { name: "r.md", bytes: 1, sha256: "0".repeat(64) },
    summary: { high: 0, medium: 0, low: 2 },
    previous: [],
    importedAt: "2026-10-13T01:02:03.000Z",
    tool: { name: "aiqh", version: "9.9.9" },
    findings: [f("P-R1-001", {}), f("P-R1-002", { status: "resolved", verdict: "VALID", fixedIn: sha, regressionTest: "t" })],
  };
  writeFileSync(path.join(dir, "findings-r1.json"), `${JSON.stringify(doc, null, 2)}\n`);
  return t.dir;
}

function cli(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("aiqh review-check (real CLI)", () => {
  it("is listed in the help and has its own help (exit 0)", () => {
    const root = repo();
    expect(cli(root, ["--help"]).stdout).toContain("review-check");
    const h = cli(root, ["review-check", "--help"]);
    expect(h.status).toBe(0);
    for (const o of ["--label", "--cwd"]) expect(h.stdout).toContain(o);
  });

  it.each([
    ["no --label", ["review-check"], "required option '--label <name>' not specified"],
    ["an unknown option", ["review-check", "--label", "demo", "--round", "1"], "unknown option '--round'"],
    ["an extra argument", ["review-check", "x", "--label", "demo"], "too many arguments"],
  ])("a usage error (%s) is exit 2 and says what is wrong", (_label, args, says) => {
    const r = cli(repo(), args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(says);
  });

  it("checks a label (exit 0): an open finding left is incomplete, not a failure", () => {
    const r = cli(repo(), ["review-check", "--label", "demo"]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("REVIEW LOOP: incomplete (open 1)\nREVIEW CHECK: passed\n");
  });

  it("--cwd names the repository", () => {
    const root = repo();
    const elsewhere = makeTempDir("aiqh-test-rcc-cwd-");
    cleanups.push(elsewhere.cleanup);
    const r = cli(elsewhere.dir, ["review-check", "--label", "demo", "--cwd", root]);
    expect([r.status, r.stderr]).toEqual([0, ""]);
  });

  it("a git that cannot be run (not on PATH) is exit 2 when a resolved finding needs it (fail closed)", () => {
    const root = repo();
    const empty = makeTempDir("aiqh-test-rcc-path-");
    cleanups.push(empty.cleanup);
    const r = cli(root, ["review-check", "--label", "demo"], { ...process.env, PATH: empty.dir });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("aiqh review-check: [git] ");
    expect(r.stderr).toContain("REVIEW CHECK: failed (error)\n");
    expect(r.stdout).not.toContain("REVIEW LOOP");
  });
});
