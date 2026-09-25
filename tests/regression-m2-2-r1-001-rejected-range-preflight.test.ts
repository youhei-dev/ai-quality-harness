/**
 * M2-2-R1-001 (Medium, fixed in v0.5.1): when --range had a finding (Rejected), inspectPacket returned before every git
 * step — also before the ones that do not use the range — so "not inside a git work tree" and an unreadable latest.json
 * were never seen: the range finding came out as a complete result, exit 1, although the inspection could not be done
 * (ADR-0015: exit 2, the findings listed as incomplete). Now only the steps that use the range (its form, the refs and
 * everything that depends on <from> / <to>) are skipped; the work tree, the root, the human inputs, latest.json up to
 * the point where it would be matched against <to>, the aiqh version and `git --version` are still inspected, and with
 * --label the default output name as well. The blocked value is still never passed to git.
 * The permission case changes mode bits, which root ignores, so it is skipped when running as root; the mode is
 * restored in `finally`. Forbidden characters and secret shapes are built at run time.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket, type ReviewPacketOptions } from "../src/commands/review-packet.ts";
import { REJECTED } from "../src/review/checked.ts";
import { inspectPacket, type PacketFinding } from "../src/review/packet.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import { checked, fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Root bypasses mode 000, so the permission case cannot fail as intended. */
const runsAsRoot = process.getuid?.() === 0;
const ch = (cp: number): string => String.fromCodePoint(cp);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const RLO = ch(0x202e);

interface Repo {
  dir: string;
  base: string;
  to: string;
  git: (...args: string[]) => string;
}

/** A repository with one changed file after base (`b.ts`, or a staged path whose blob is then dropped when `dropBlob`). */
function repo(dropBlob = false): Repo {
  const t = makeTempDir("aiqh-r1-001-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  const id = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: t.dir, input: "export const b = 1;\n", encoding: "utf8" }).trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${id},b.ts`], { cwd: t.dir });
  git("commit", "-q", "-m", "change");
  if (dropBlob) unlinkSync(path.join(t.dir, ".git", "objects", id.slice(0, 2), id.slice(2)));
  return { dir: t.dir, base, to: git("rev-parse", "HEAD").trim(), git };
}

/** A directory that is not inside a git work tree. */
function notAWorkTree(): string {
  const t = makeTempDir("aiqh-r1-001-nogit-");
  cleanups.push(t.cleanup);
  return t.dir;
}

function latest(dir: string, content: string | "directory"): string {
  const d = path.join(dir, "artifacts", "verification");
  mkdirSync(d, { recursive: true });
  if (content === "directory") mkdirSync(path.join(d, "latest.json"));
  else writeFileSync(path.join(d, "latest.json"), content);
  return d;
}

async function run(cwd: string, extra: Partial<ReviewPacketOptions> = {}): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runReviewPacket({ cwd, range: `a..b${RLO}`, label: "p", toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...extra });
  return { code, out: lines.join("\n") };
}

const rows = (fs: PacketFinding[]): string[] => fs.map((f) => `${f.kind} ${f.source} ${String(f.detail)}`);
const nothingWritten = (dir: string): void => {
  expect(existsSync(path.join(dir, "artifacts", "ai-review")), "nothing written").toBe(false);
};

describe("M2-2-R1-001: a rejected --range no longer hides that the inspection cannot be done", () => {
  it("not a work tree + a --range with U+202E: exit 2, the range finding listed as incomplete", async () => {
    const dir = notAWorkTree();
    const res = await run(dir);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain(`not inside a git work tree: ${dir}`);
    expect(res.out).toMatch(/the inspection could not be completed, so this list of 1 finding\(s\) is incomplete/);
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E \(input\)/);
    expect(res.out).toContain("REVIEW PACKET: not written (error)");
    nothingWritten(dir);
  });

  it("the same with --json: result error, the error and the range finding", async () => {
    const dir = notAWorkTree();
    const res = await run(dir, { json: true });
    expect(res.code, res.out).toBe(2);
    const j = JSON.parse(res.out) as { result: string; error: string; findings: PacketFinding[] };
    expect(j.result).toBe("error");
    expect(j.error).toBe(`not inside a git work tree: ${dir}`);
    expect(rows(j.findings)).toEqual(["raw-char range U+202E"]);
  });

  it("a --cwd that does not exist + a --range with U+202E: exit 2 (git cannot run there)", async () => {
    const dir = path.join(notAWorkTree(), "missing");
    const res = await run(dir);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("git could not be run");
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E/);
  });

  it("a --range with U+202E + latest.json that cannot be read (EISDIR): exit 2", async () => {
    const r = repo();
    latest(r.dir, "directory");
    const res = await run(r.dir, { range: `${r.base}..HEAD${RLO}` });
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EISDIR");
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E/);
    expect(res.out).toMatch(/incomplete/);
  });

  it.skipIf(runsAsRoot)("a --range with U+202E + latest.json behind a parent at mode 000: exit 2 (skipped as root: root bypasses mode 000)", async () => {
    const r = repo();
    const d = latest(r.dir, JSON.stringify({ git: { commit: r.to, dirty: false }, verdict: "PASSED" }));
    chmodSync(d, 0o000);
    let res: { code: number; out: string };
    try {
      res = await run(r.dir, { range: `${r.base}..HEAD${RLO}` });
    } finally {
      chmodSync(d, 0o755);
    }
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EACCES");
    nothingWritten(r.dir);
  });
});

describe("M2-2-R1-001 controls: unchanged combinations", () => {
  it("a valid work tree + a --range with U+202E: exit 1, the finding (as before)", async () => {
    const r = repo();
    const res = await run(r.dir, { range: `${r.base}..HEAD${RLO}` });
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E/);
    expect(res.out).toContain("REVIEW PACKET: not written (findings)");
    nothingWritten(r.dir);
  });

  it("not a work tree + an ordinary --range: exit 2 (as before)", async () => {
    const dir = notAWorkTree();
    const res = await run(dir, { range: "a..b" });
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain(`not inside a git work tree: ${dir}`);
  });
});

describe("M2-2-R1-001: the blocked range value never reaches git", () => {
  it("A10's check: a --range with U+202E + a missing blob: exit 1 and no git error (the changes were not read)", async () => {
    const r = repo(true);
    const res = await run(r.dir, { range: `${r.base}..HEAD${RLO}` });
    expect(res.code, res.out).toBe(1);
    expect(res.out).not.toMatch(/git exit/);
  });

  it("a --range with U+202E whose ref does not exist: exit 1, the ref was never resolved", async () => {
    const r = repo();
    const res = await run(r.dir, { range: `${r.base}..no-such-ref${RLO}` });
    expect(res.code, res.out).toBe(1);
    expect(res.out).not.toContain("does not name a commit");
  });

  it("a rejected --range without <from>..<to> is not form-checked (its finding stands for it): exit 1", async () => {
    const r = repo();
    const res = await run(r.dir, { range: `${r.base}${RLO}` });
    expect(res.code, res.out).toBe(1);
    expect(res.out).not.toContain("--range must have the form");
  });
});

describe("M2-2-R1-001: what is still inspected when the range has a finding (ADR-0015 §3)", () => {
  it("latest.json that is not JSON is checked as text: a secret shape in it is a finding", async () => {
    const r = repo();
    latest(r.dir, `{ "verdict": "${SECRET()}", broken`);
    const res = await run(r.dir, { range: `${r.base}..HEAD${RLO}`, json: true });
    expect(res.code, res.out).toBe(1);
    expect(res.out).not.toContain(SECRET());
    const j = JSON.parse(res.out) as { result: string; findings: PacketFinding[] };
    expect(j.result).toBe("findings");
    expect(rows(j.findings)).toEqual(["raw-char range U+202E", "secret verification (artifacts/verification/latest.json) aws"]);
  });

  it("latest.json that is valid JSON: its values are not checked (which of them are rendered depends on <to>)", async () => {
    const r = repo();
    latest(r.dir, JSON.stringify({ git: { commit: r.to, dirty: false }, verdict: `PASS${RLO}ED` }));
    const blocked = await run(r.dir, { range: `${r.base}..HEAD${RLO}`, json: true });
    expect(blocked.code, blocked.out).toBe(1);
    expect(rows((JSON.parse(blocked.out) as { findings: PacketFinding[] }).findings)).toEqual(["raw-char range U+202E"]);
    // with a range, the same file is the result of <to> and its value is a finding
    const open = await run(r.dir, { range: `${r.base}..HEAD`, json: true });
    expect(open.code, open.out).toBe(1);
    expect(rows((JSON.parse(open.out) as { findings: PacketFinding[] }).findings)).toEqual(["raw-char verification (artifacts/verification/latest.json) U+202E"]);
  });

  it("the derived values that do not come from the range (the aiqh version) are checked", async () => {
    const r = repo();
    const res = await run(r.dir, { range: `${r.base}..HEAD${RLO}`, toolVersion: `1.0${RLO}`, json: true });
    expect(res.code, res.out).toBe(1);
    expect(rows((JSON.parse(res.out) as { findings: PacketFinding[] }).findings)).toEqual(["raw-char range U+202E", "raw-char packet metadata U+202E"]);
  });

  it("the repository root is known (for the default output name with --label); git and the <to> label are not", () => {
    const r = repo();
    const sub = path.join(r.dir, "sub");
    mkdirSync(sub);
    const inspection = inspectPacket({ cwd: sub, range: REJECTED, label: checked("p"), security: DEFAULT_SECURITY, toolVersion: "t" });
    expect(realpathSync(inspection.root)).toBe(realpathSync(r.dir));
    expect(inspection.git).toBeNull();
    expect(inspection.label).toBe("p");
    const noLabel = inspectPacket({ cwd: r.dir, range: REJECTED, security: DEFAULT_SECURITY, toolVersion: "t" });
    expect(noLabel.label).toBeNull();
  });
});
