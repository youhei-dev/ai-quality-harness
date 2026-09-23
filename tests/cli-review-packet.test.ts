/**
 * M2-1 (v0.4.0): `aiqh review-packet` through the real CLI (child process): exit codes for usage
 * errors, byte-identical packets under different TZ / LANG, `--request -`, `--json`, and fail closed
 * without printing values. Secret-shaped values are assembled at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fake, makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function repo(): { dir: string; base: string; head: string } {
  const t = makeTempDir("aiqh-rp-cli-");
  cleanups.push(t.cleanup);
  const git = (args: string[], date: number): string =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
      cwd: t.dir,
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_DATE: `${date} +0900`, GIT_COMMITTER_DATE: `${date} +0900` },
    });
  git(["init", "-q"], 0);
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git(["add", "--", "a.ts"], 0);
  git(["commit", "-q", "-m", "base"], 1_790_000_000);
  const base = git(["rev-parse", "HEAD"], 0).trim();
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 2;\n");
  git(["add", "--", "a.ts"], 0);
  git(["commit", "-q", "-m", "change"], 1_790_000_100);
  return { dir: t.dir, base, head: git(["rev-parse", "HEAD"], 0).trim() };
}

function cli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}, input?: string): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8", input, timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("aiqh review-packet (CLI)", () => {
  it("usage errors exit 2 (exit 1 is reserved for findings)", () => {
    const r = repo();
    expect(cli([], r.dir).code).toBe(2);
    expect(cli(["--range", `${r.base}..HEAD`, "--no-such-option"], r.dir).code).toBe(2);
    expect(cli(["--range", `${r.base}..HEAD`, "--max-file-bytes", "0"], r.dir).code).toBe(2);
    expect(cli(["--range", `${r.base}..HEAD`, "--max-packet-bytes", "12k"], r.dir).code).toBe(2);
    expect(cli(["--range", `${r.head}..${r.base}`], r.dir).code).toBe(2);
    expect(cli(["--help"], r.dir).code).toBe(0);
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
  });

  it("writes the same bytes under different TZ and LANG (default label = 12 hex digits of <to>)", () => {
    const r = repo();
    const out = path.join(r.dir, "artifacts", "ai-review", `review-packet-${r.head.slice(0, 12)}.md`);
    const first = cli(["--range", `${r.base}..HEAD`, "--zip"], r.dir, { TZ: "Asia/Tokyo", LANG: "ja_JP.UTF-8", LC_ALL: "ja_JP.UTF-8" });
    expect(first.code, first.stderr).toBe(0);
    const a = readFileSync(out);
    const az = readFileSync(out.replace(/\.md$/, ".zip"));
    const second = cli(["--range", `${r.base}..HEAD`, "--zip"], r.dir, { TZ: "America/Los_Angeles", LANG: "C", LC_ALL: "C" });
    expect(second.code, second.stderr).toBe(0);
    expect(readFileSync(out).equals(a)).toBe(true);
    expect(readFileSync(out.replace(/\.md$/, ".zip")).equals(az)).toBe(true);
    expect(a.toString("utf8")).toContain("Committer time of <to>: 2026-09-21T14:15:00Z (UTC)");
  });

  it("--request - reads standard input; --json prints a summary", () => {
    const r = repo();
    const res = cli(["--range", `${r.base}..HEAD`, "--label", "stdin", "--request", "-", "--json"], r.dir, {}, "Request from stdin.\n");
    expect(res.code, res.stderr).toBe(0);
    const summary = JSON.parse(res.stdout) as { result: string; output: string; commits: number; files: number; sha256: string };
    expect(summary.result).toBe("written");
    expect(summary.commits).toBe(1);
    expect(summary.files).toBe(1);
    expect(summary.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(summary.output, "utf8")).toContain("Request from stdin.");
  });

  it("a secret-shaped string in a changed file: exit 1, no files, value not printed", () => {
    const r = repo();
    const value = fake("ghp_", "abcdefghijklmnopqrstuvwxyz0123456789");
    writeFileSync(path.join(r.dir, "a.ts"), `export const token = "${value}";\n`);
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-am", "token"], { cwd: r.dir });
    const res = cli(["--range", `${r.base}..HEAD`, "--label", "sec", "--zip"], r.dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/\[secret\] full source a\.ts:1 github/);
    expect(res.stdout + res.stderr).not.toContain(value);
    expect(res.stdout + res.stderr).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
  });
});
