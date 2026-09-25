/**
 * M2-2-R1-007 (reviewed as Medium, treated as High by the human decision; fixed in v0.5.1): latest.json was looked
 * up with existsSync(), which is false for any error, so a latest.json behind a parent directory that could not be
 * traversed (or a parent that is a file) was "absent": review-packet wrote the packet with exit 0 and a Verification
 * section saying the file "does not exist". Now latest.json is read directly and only ENOENT is "absent"; any other
 * failure is an inspection error (exit 2, nothing written, findings listed as incomplete).
 * The permission cases change mode bits, which root ignores, so they are skipped when running as root; the mode is
 * restored in `finally` before the temporary directory is removed. Secret shapes are built at run time.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import type { PacketFinding } from "../src/review/packet.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Root bypasses mode 000, so the permission cases cannot fail as intended. */
const runsAsRoot = process.getuid?.() === 0;
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");

interface Repo {
  dir: string;
  base: string;
  artifacts: string;
  verification: string;
  latest: string;
}

/** A repository with one commit after base and a latest.json that records a clean PASSED run of <to>. */
function repo(changed?: string): Repo {
  const t = makeTempDir("aiqh-r1-007-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  if (changed !== undefined) {
    writeFileSync(path.join(t.dir, "b.ts"), changed);
    git("add", "--", "b.ts");
  }
  git("commit", "-q", "--allow-empty", "-m", "x");
  const to = git("rev-parse", "HEAD").trim();
  const artifacts = path.join(t.dir, "artifacts");
  const verification = path.join(artifacts, "verification");
  const latest = path.join(verification, "latest.json");
  mkdirSync(verification, { recursive: true });
  writeFileSync(latest, JSON.stringify({ git: { commit: to, dirty: false }, verdict: "PASSED", exitCode: 0, checks: [] }));
  return { dir: t.dir, base, artifacts, verification, latest };
}

async function run(r: Repo, json = false): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, label: "p", json, toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, out: lines.join("\n") };
}

/** Run with `dir` at mode 000; the mode is restored before anything else looks at the tree. */
async function withLocked(r: Repo, dir: string, json = false): Promise<{ code: number; out: string }> {
  chmodSync(dir, 0o000);
  try {
    return await run(r, json);
  } finally {
    chmodSync(dir, 0o755);
  }
}

const written = (r: Repo): boolean => existsSync(path.join(r.artifacts, "ai-review"));
const packet = (r: Repo): string => readFileSync(path.join(r.artifacts, "ai-review", "review-packet-p.md"), "utf8");

describe("M2-2-R1-007: latest.json that exists but cannot be reached is an inspection error, not absent", () => {
  it.skipIf(runsAsRoot)("the parent artifacts/verification at mode 000: exit 2, cannot read (EACCES), nothing written (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const res = await withLocked(r, r.verification);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EACCES");
    expect(res.out).not.toContain("does not exist");
    expect(written(r)).toBe(false);
  });

  it.skipIf(runsAsRoot)("the parent at mode 000, --json: result error with the message (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const res = await withLocked(r, r.verification, true);
    expect(res.code, res.out).toBe(2);
    const j = JSON.parse(res.out) as { result: string; error: string; output: string | null };
    expect(j.result).toBe("error");
    expect(j.error).toBe("cannot read artifacts/verification/latest.json: EACCES");
    expect(j.output).toBeNull();
    expect(written(r)).toBe(false);
  });

  it.skipIf(runsAsRoot)("the grandparent artifacts at mode 000: exit 2, nothing written (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const res = await withLocked(r, r.artifacts);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EACCES");
    expect(written(r)).toBe(false);
  });

  it("artifacts/verification is a file (ENOTDIR): exit 2, nothing written", async () => {
    const r = repo();
    rmSync(r.verification, { recursive: true, force: true });
    writeFileSync(r.verification, "not a directory\n");
    const res = await run(r);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: ENOTDIR");
    expect(written(r)).toBe(false);
  });

  it("latest.json is a symbolic link loop (ELOOP): exit 2, nothing written", async () => {
    const r = repo();
    const loop = path.join(r.verification, "loop");
    rmSync(r.latest);
    symlinkSync(loop, r.latest);
    symlinkSync(r.latest, loop);
    const res = await run(r);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: ELOOP");
    expect(written(r)).toBe(false);
  });

  it.skipIf(runsAsRoot)("the parent at mode 000 + a finding in a changed file: exit 2, the finding listed as incomplete (skipped as root: root bypasses mode 000)", async () => {
    const r = repo(`export const k = "${SECRET()}";\n`);
    const res = await withLocked(r, r.verification, true);
    expect(res.code, res.out).toBe(2);
    expect(res.out).not.toContain(SECRET());
    const j = JSON.parse(res.out) as { result: string; error: string; findings: PacketFinding[] };
    expect(j.result).toBe("error");
    expect(j.error).toBe("cannot read artifacts/verification/latest.json: EACCES");
    expect(j.findings.map((f) => `${f.kind} ${f.source}:${String(f.line)} ${String(f.detail)}`)).toEqual(["secret full source b.ts:1 aws", "secret diff b.ts:7 aws"]);
    expect(written(r)).toBe(false);
  });
});

describe("M2-2-R1-007 controls: ENOENT is still 'no verify result'", () => {
  it("latest.json does not exist: exit 0, the packet says so", async () => {
    const r = repo();
    rmSync(r.latest);
    const res = await run(r);
    expect(res.code, res.out).toBe(0);
    expect(packet(r)).toContain("No verify result: `artifacts/verification/latest.json` does not exist.");
  });

  it("artifacts/ does not exist at all: exit 0, the packet says so", async () => {
    const r = repo();
    rmSync(r.artifacts, { recursive: true, force: true });
    const res = await run(r);
    expect(res.code, res.out).toBe(0);
    expect(packet(r)).toContain("No verify result: `artifacts/verification/latest.json` does not exist.");
  });

  it("a readable latest.json for <to> is rendered as before", async () => {
    const r = repo();
    const res = await run(r);
    expect(res.code, res.out).toBe(0);
    expect(packet(r)).toContain("Verdict: `PASSED`");
  });
});
