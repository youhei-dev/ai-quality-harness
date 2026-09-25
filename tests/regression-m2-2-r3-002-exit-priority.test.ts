/**
 * M2-1-R3-002 (Medium, fixed in M2-2; ADR-0015): a finding in an option value returned before --request /
 * --review were read and before git ran, and a path finding returned before any blob was read, so an input
 * that could not be inspected (unreadable file, not a work tree, unknown ref, missing object, unreadable
 * latest.json) was reported as a complete result, exit 1. Now the inspection goes on to the end: exit 1 only
 * after every input was obtained and checked (except what depends on a value with a finding, which is never
 * passed to git), exit 2 when an input cannot be obtained — with the findings known so far, listed as
 * incomplete — and errors that do not stop the inspection (size limits, an invalid --label, a forbidden
 * character in --cwd, …) only without findings.
 * The cases are those of the M2-2 SP1 reproduction (A: option findings, B: path findings, C: content
 * findings, D: errors that used to stop the inspection first, E: size limits); the expected exit codes are
 * ADR-0015's table. Forbidden characters, invalid bytes and secret shapes are built at run time.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket, type ReviewPacketOptions } from "../src/commands/review-packet.ts";
import { DeferredError, EXIT_PRIORITY, InspectionError, decideOutcome } from "../src/review/outcome.ts";
import type { PacketFinding } from "../src/review/packet.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const BIG = "x".repeat(300) + "\n";

interface Repo {
  dir: string;
  base: string;
  git: (...args: string[]) => string;
  /** Put the path into the index with the content (no file is created); returns the blob id. */
  stage: (p: string, content: string) => string;
  write: (rel: string, content: string) => void;
  commit: (message: string) => void;
  /** Delete a loose object: git still lists the tree, but the blob cannot be read. */
  drop: (id: string) => void;
}

function repo(sub?: string): Repo {
  const t = makeTempDir("aiqh-r3-002-");
  cleanups.push(t.cleanup);
  const dir = sub === undefined ? t.dir : path.join(t.dir, sub);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  const stage = (p: string, content: string): string => {
    const id = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: content, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "-z", "--index-info"], { cwd: dir, input: Buffer.concat([Buffer.from(`100644 ${id}\t`), Buffer.from(p, "utf8"), Buffer.from([0])]) });
    return id;
  };
  const write = (rel: string, content: string): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
    git("add", "--", rel);
  };
  const commit = (message: string): void => {
    git("commit", "-q", "--allow-empty", "-m", message);
  };
  const drop = (id: string): void => unlinkSync(path.join(dir, ".git", "objects", id.slice(0, 2), id.slice(2)));
  return { dir, base, git, stage, write, commit, drop };
}

/** A repository whose changed file `ok.txt` has a missing blob (and optionally more changes). */
function missingBlob(more: (r: Repo) => void = () => {}): Repo {
  const r = repo();
  const id = r.stage("ok.txt", "normal content\n");
  more(r);
  r.commit("change");
  r.drop(id);
  return r;
}

function unreadableLatest(r: Repo): void {
  mkdirSync(path.join(r.dir, "artifacts", "verification", "latest.json"), { recursive: true });
}

interface Run {
  code: number;
  out: string;
}

async function run(r: Repo, extra: Partial<ReviewPacketOptions> = {}): Promise<Run> {
  const lines: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, label: "p", toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...extra });
  return { code, out: lines.join("\n") };
}

const secretOutput = (r: Repo): Partial<ReviewPacketOptions> => ({ output: path.join(r.dir, "out", `${SECRET()}.md`) });

interface Case {
  id: string;
  what: string;
  expected: 1 | 2;
  setup: () => { r: Repo; extra?: Partial<ReviewPacketOptions> };
}

const CASES: Case[] = [
  // A: an option value with a finding + an input that cannot be obtained -> 2 (inspection)
  { id: "A1", what: "-o secret-shaped + unreadable --request", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { ...secretOutput(r), request: "missing-request.md" } }; } },
  { id: "A2", what: "-o secret-shaped + unreadable --review", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { ...secretOutput(r), review: ["missing-review.md"] } }; } },
  {
    id: "A3",
    what: "-o secret-shaped + --cwd not a work tree",
    expected: 2,
    setup: () => {
      const t = makeTempDir("aiqh-r3-002-nogit-");
      cleanups.push(t.cleanup);
      const r: Repo = { ...repo(), dir: t.dir, base: "a" };
      return { r, extra: { range: "a..b", output: path.join(t.dir, "out", `${SECRET()}.md`) } };
    },
  },
  { id: "A4", what: "-o secret-shaped + a ref that does not resolve", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { ...secretOutput(r), range: `${r.base}..no-such-ref` } }; } },
  { id: "A5", what: "-o secret-shaped + a missing blob", expected: 2, setup: () => { const r = missingBlob(); return { r, extra: secretOutput(r) }; } },
  { id: "A6", what: "--label with U+202E + a missing blob", expected: 2, setup: () => ({ r: missingBlob(), extra: { label: `p${ch(0x202e)}` } }) },
  { id: "A7", what: "--exclude secret-shaped + a missing blob", expected: 2, setup: () => ({ r: missingBlob(), extra: { exclude: [`${SECRET()}/**`] } }) },
  { id: "A8", what: "--doc with U+202E + a missing blob", expected: 2, setup: () => ({ r: missingBlob(), extra: { doc: [`d${ch(0x202e)}.md`] } }) },
  { id: "A9", what: "--request name with U+202E + the file is missing", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { request: `missing${ch(0x202e)}.md` } }; } },
  { id: "A10", what: "--range with U+202E (git blocked by that finding) + a missing blob", expected: 1, setup: () => { const r = missingBlob(); return { r, extra: { range: `${r.base}..HEAD${ch(0x202e)}` } }; } },
  { id: "A12", what: "-o secret-shaped + unreadable latest.json", expected: 2, setup: () => { const r = repo(); r.commit("x"); unreadableLatest(r); return { r, extra: secretOutput(r) }; } },
  // B: a path with a finding + an input that cannot be obtained -> 2 (inspection); + a deferred error -> 1
  { id: "B1", what: "path with U+202E + another file's missing blob", expected: 2, setup: () => ({ r: missingBlob((r) => r.stage(`p${ch(0x202e)}.txt`, "raw path\n")) }) },
  {
    id: "B2",
    what: "path with U+202E + a missing blob of the previous version",
    expected: 2,
    setup: () => {
      const r = repo();
      const old = r.git("rev-parse", `${r.base}:a.ts`).trim();
      r.write("a.ts", "export const a = 2;\n");
      r.stage(`p${ch(0x202e)}.txt`, "raw path\n");
      r.commit("modify");
      r.drop(old);
      return { r };
    },
  },
  { id: "B3", what: "path with U+202E + unreadable latest.json", expected: 2, setup: () => { const r = repo(); r.stage(`p${ch(0x202e)}.txt`, "raw\n"); r.commit("raw"); unreadableLatest(r); return { r }; } },
  { id: "B4", what: "path with U+202E + unreadable --request", expected: 2, setup: () => { const r = repo(); r.stage(`p${ch(0x202e)}.txt`, "raw\n"); r.commit("raw"); return { r, extra: { request: "missing.md" } }; } },
  { id: "B5", what: "path with U+202E + a --doc that is not a file (deferred)", expected: 1, setup: () => { const r = repo(); r.stage(`p${ch(0x202e)}.txt`, "raw\n"); r.commit("raw"); return { r, extra: { doc: ["no/such.md"] } }; } },
  {
    id: "B6",
    what: "path with U+202E + the file's own missing blob",
    expected: 2,
    setup: () => {
      const r = repo();
      const id = r.stage(`p${ch(0x202e)}.txt`, "raw own\n");
      r.commit("raw");
      r.drop(id);
      return { r };
    },
  },
  // C: a content finding + an input that cannot be obtained -> 2
  { id: "C1", what: "secret in a changed file + another file's missing blob", expected: 2, setup: () => ({ r: missingBlob((r) => r.write("a1.ts", `export const k = "${SECRET()}";\n`)) }) },
  { id: "C2", what: "secret in a changed file + unreadable latest.json", expected: 2, setup: () => { const r = repo(); r.write("a1.ts", `export const k = "${SECRET()}";\n`); r.commit("s"); unreadableLatest(r); return { r }; } },
  // D: errors that do not stop the inspection come after findings; a --range without ".." is inspection impossible
  {
    id: "D1",
    what: "secret in a changed file + --cwd with U+2028",
    expected: 1,
    setup: () => {
      const r = repo(`cwd${ch(0x2028)}dir`);
      r.write("key.ts", `export const k = "${SECRET()}";\n`);
      r.commit("s");
      return { r };
    },
  },
  { id: "D2", what: "secret in a changed file + an invalid --label", expected: 1, setup: () => { const r = repo(); r.write("key.ts", `export const k = "${SECRET()}";\n`); r.commit("s"); return { r, extra: { label: "P" } }; } },
  { id: "D4", what: "path with U+202E + an invalid --label", expected: 1, setup: () => { const r = repo(); r.stage(`p${ch(0x202e)}.txt`, "raw\n"); r.commit("raw"); return { r, extra: { label: "P" } }; } },
  {
    id: "D5",
    what: "secret in a changed file + -o in a directory with U+2028",
    expected: 1,
    setup: () => {
      const r = repo();
      r.write("key.ts", `export const k = "${SECRET()}";\n`);
      r.commit("s");
      return { r, extra: { output: path.join(r.dir, `bad${ch(0x2028)}dir`, "packet.md") } };
    },
  },
  { id: "D6", what: "secret in a changed file + --range without <from>..<to>", expected: 2, setup: () => { const r = repo(); r.write("key.ts", `export const k = "${SECRET()}";\n`); r.commit("s"); return { r, extra: { range: r.base } }; } },
  // E: findings + size limits -> 1
  {
    id: "E1",
    what: "path with U+202E + a file over --max-file-bytes",
    expected: 1,
    setup: () => {
      const r = repo();
      r.stage(`p${ch(0x202e)}.txt`, BIG);
      r.write("big.txt", BIG);
      r.commit("big");
      return { r, extra: { maxFileBytes: 100 } };
    },
  },
  { id: "E2", what: "secret in a changed file + another file over --max-file-bytes", expected: 1, setup: () => { const r = repo(); r.write("key.ts", `export const k = "${SECRET()}";\n`); r.write("big.txt", BIG); r.commit("s"); return { r, extra: { maxFileBytes: 100 } }; } },
  // controls: the error alone
  { id: "A1c", what: "unreadable --request alone", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { request: "missing-request.md" } }; } },
  {
    id: "A3c",
    what: "--cwd not a work tree alone",
    expected: 2,
    setup: () => {
      const t = makeTempDir("aiqh-r3-002-nogit-");
      cleanups.push(t.cleanup);
      return { r: { ...repo(), dir: t.dir, base: "a" }, extra: { range: "a..b" } };
    },
  },
  { id: "A4c", what: "a ref that does not resolve alone", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { range: `${r.base}..no-such-ref` } }; } },
  { id: "A5c", what: "a missing blob alone", expected: 2, setup: () => ({ r: missingBlob() }) },
  { id: "A12c", what: "unreadable latest.json alone", expected: 2, setup: () => { const r = repo(); r.commit("x"); unreadableLatest(r); return { r }; } },
  { id: "D2c", what: "an invalid --label alone", expected: 2, setup: () => { const r = repo(); r.commit("x"); return { r, extra: { label: "P" } }; } },
];

describe("M2-1-R3-002: exit codes follow ADR-0015 (the SP1 reproduction cases)", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.what} -> exit ${c.expected}`, async () => {
      const { r, extra } = c.setup();
      const res = await run(r, extra);
      expect(res.code, res.out).toBe(c.expected);
      expect(existsSync(path.join(r.dir, "artifacts", "ai-review")), "nothing written").toBe(false);
      expect(res.out).not.toContain(SECRET());
    });
  }
});

describe("M2-1-R3-002: what an incomplete inspection reports", () => {
  it("B1: the git error and the path findings, marked as an incomplete list", async () => {
    const r = missingBlob((x) => x.stage(`p${ch(0x202e)}.txt`, "raw path\n"));
    const res = await run(r);
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/counting changes failed \(git exit 128\)/);
    expect(res.out).toMatch(/the inspection could not be completed, so this list of 2 finding\(s\) is incomplete/);
    expect(res.out).toMatch(/\[raw-char\] path \(git diff --raw entry \d+\) U\+202E/);
    expect(res.out).toMatch(/REVIEW PACKET: not written \(error\)/);
  });

  it("B1 --json: result error, the error message and the findings", async () => {
    const r = missingBlob((x) => x.stage(`p${ch(0x202e)}.txt`, "raw path\n"));
    const lines: string[] = [];
    const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, label: "p", json: true, toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(2);
    const j = JSON.parse(lines.join("\n")) as { result: string; error: string; findings: PacketFinding[] };
    expect(j.result).toBe("error");
    expect(j.error).toMatch(/counting changes failed/);
    expect(j.findings.map((f) => `${f.kind} ${f.source} ${f.detail}`)).toEqual(["raw-char path U+202E", "raw-char path U+202E"]);
  });

  it("A10: a finding in --range blocks git; the result is the finding (no git error)", async () => {
    const r = missingBlob();
    const res = await run(r, { range: `${r.base}..HEAD${ch(0x202e)}` });
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E/);
    expect(res.out).not.toMatch(/git exit/);
  });

  it("A5: the -o name finding and the missing blob are both reported", async () => {
    const r = missingBlob();
    const res = await run(r, secretOutput(r));
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/failed \(git exit 128\)/);
    expect(res.out).toMatch(/\[secret\] output file name:1 aws/);
  });
});

describe("M2-1-R3-002: the decision (src/review/outcome.ts)", () => {
  const finding: PacketFinding = { kind: "raw-char", source: "path", line: null, detail: "U+202E", location: null, stage: "input" };
  const inspection = new InspectionError("cannot read x: ENOENT");
  const deferred = new DeferredError("--label may contain only …");

  it("EXIT_PRIORITY is the table of ADR-0015", () => {
    expect(EXIT_PRIORITY.map((r) => `${r.category}=${r.exit}`)).toEqual(["usage=2", "config=2", "inspection=2", "finding=1", "deferred=2", "write=2"]);
  });

  it("inspection before finding before deferred", () => {
    expect(decideOutcome({ inspection, findings: [finding], deferred: [deferred] })).toMatchObject({ category: "inspection", exit: 2, findings: [finding] });
    expect(decideOutcome({ inspection: null, findings: [finding], deferred: [deferred] })).toMatchObject({ category: "finding", exit: 1 });
    expect(decideOutcome({ inspection: null, findings: [], deferred: [deferred, new DeferredError("b")] })).toEqual({ category: "deferred", exit: 2, message: "--label may contain only …; b" });
    expect(decideOutcome({ inspection: null, findings: [], deferred: [] })).toEqual({ category: "none" });
  });
});
