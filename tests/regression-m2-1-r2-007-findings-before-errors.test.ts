/**
 * M2-1-R2-007 (Medium): an invalid-UTF-8 or raw-character path finding was overtaken by the size error of
 * the same file (exit 2 instead of 1). Now all paths (the changed-file list and every commit's file list)
 * are checked as a first, separate pass and any finding returns exit 1 before contents and sizes are
 * looked at. The same rule — a detection (exit 1) comes before an error (exit 2) — is applied wherever
 * both can happen; only errors that make the check itself impossible (command-line parsing, the config
 * for the check, unreadable input files, git failures) stay exit 2.
 * M2-2 (ADR-0015, M2-1-R3-002): an input that cannot be obtained is exit 2 even when a finding is already
 * known (the findings are listed as incomplete), so a finding in a --request file name no longer hides that
 * the file cannot be read; the inspection goes on to the end, and path findings no longer return early
 * (tests/regression-m2-2-r3-002-exit-priority.test.ts).
 * Invalid bytes, forbidden characters and secret shapes are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fake, makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  const errors: unknown[] = [];
  while (cleanups.length > 0) {
    try {
      cleanups.pop()?.();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) throw errors[0];
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const BIG = "x".repeat(300) + "\n";

interface Repo {
  dir: string;
  base: string;
  git: (...args: string[]) => string;
  /** Put the bytes path into the index with the content (no file is created), without committing. */
  stagePath: (p: Buffer, content: string) => void;
  write: (rel: string, content: string) => void;
  commit: (message: string) => void;
}

function repo(parent?: string): Repo {
  const t = makeTempDir("aiqh-r2-007-");
  cleanups.push(t.cleanup);
  const dir = parent === undefined ? t.dir : path.join(t.dir, parent);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  const stagePath = (p: Buffer, content: string): void => {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: content, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: dir, input: Buffer.concat([Buffer.from(`100644 ${blob}\t`), p, Buffer.from([0])]) });
  };
  const write = (rel: string, content: string): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
    git("add", "--", rel);
  };
  const commit = (message: string): void => {
    git("commit", "-q", "--allow-empty", "-m", message);
  };
  return { dir, base, git, stagePath, write, commit };
}

function cli(cwd: string, args: string[]): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const nothingWritten = (r: Repo): void => {
  expect(existsSync(path.join(r.dir, "artifacts", "ai-review"))).toBe(false);
};

describe("M2-1-R2-007: path findings come before size errors", () => {
  it("invalid UTF-8 path + a blob over --max-file-bytes: exit 1 (invalid-utf8, path)", () => {
    const r = repo();
    r.stagePath(Buffer.concat([Buffer.from("big_"), Buffer.from([0xff]), Buffer.from(".txt")]), BIG);
    r.commit("big invalid");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[invalid-utf8\] path \(git diff --raw entry \d+\)/);
    expect(res.out).not.toMatch(/larger than --max-file-bytes/);
    nothingWritten(r);
  });

  it("raw-character path + a blob over --max-file-bytes: exit 1 (raw-char, path)", () => {
    const r = repo();
    r.stagePath(Buffer.from(`big${ch(0x2028)}.txt`, "utf8"), BIG);
    r.commit("big raw");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] path \(git diff --raw entry \d+\) U\+2028/);
    nothingWritten(r);
  });

  it("a raw-character path that exists only in one commit's file list + an oversized file: exit 1", () => {
    const r = repo();
    r.stagePath(Buffer.from(`tmp${ch(0x202e)}.txt`, "utf8"), "short\n");
    r.commit("add raw path");
    r.git("rm", "-q", "--cached", "--", `tmp${ch(0x202e)}.txt`);
    r.write("big.txt", BIG);
    r.commit("remove it, add a big file");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] path \(commit [0-9a-f]{12} file list entry \d+\) U\+202E/);
    nothingWritten(r);
  });
});

describe("M2-1-R2-007: a detection comes before an error wherever both can happen", () => {
  it("a secret in one changed file + another changed file over --max-file-bytes: exit 1", () => {
    const r = repo();
    r.write("key.ts", `export const k = "${SECRET()}";\n`);
    r.write("big.txt", BIG);
    r.commit("both");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] full source key\.ts:1 aws/);
    nothingWritten(r);
  });

  it("a --doc that is not a file + a secret in a changed file: exit 1", () => {
    const r = repo();
    r.write("key.ts", `export const k = "${SECRET()}";\n`);
    r.commit("key");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--doc", "no/such.md"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] full source key\.ts/);
    nothingWritten(r);
  });

  it("a --doc over --max-file-bytes + a secret in a changed file: exit 1", () => {
    const r = repo();
    r.write("docs/big.md", BIG);
    r.commit("doc");
    const base2 = r.git("rev-parse", "HEAD").trim();
    r.write("key.ts", `export const k = "${SECRET()}";\n`);
    r.commit("key");
    const res = cli(r.dir, ["--range", `${base2}..HEAD`, "--label", "p", "--doc", "docs/big.md", "--max-file-bytes", "100"]);
    expect(res.code, res.out).toBe(1);
    nothingWritten(r);
  });

  it("latest.json for <to> that is not valid JSON + a secret in a changed file: exit 1", () => {
    const r = repo();
    r.write("key.ts", `export const k = "${SECRET()}";\n`);
    r.commit("key");
    mkdirSync(path.join(r.dir, "artifacts", "verification"), { recursive: true });
    writeFileSync(path.join(r.dir, "artifacts", "verification", "latest.json"), "{ not json");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p"]);
    expect(res.code, res.out).toBe(1);
    expect(existsSync(path.join(r.dir, "artifacts", "ai-review"))).toBe(false);
  });

  it("a raw character in the --request file name + the file cannot be read: exit 2, the name finding listed as incomplete (M2-2, ADR-0015)", () => {
    const r = repo();
    r.commit("x");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--request", `missing${ch(0x202e)}.md`]);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toMatch(/cannot read .*: ENOENT/);
    expect(res.out).toMatch(/incomplete/);
    expect(res.out).toMatch(/\[raw-char\] request file name:1 U\+202E/);
    nothingWritten(r);
  });

  it("a secret-shaped -o file name + a changed file over --max-file-bytes: exit 1 (output file name)", () => {
    const r = repo();
    r.write("big.txt", BIG);
    r.commit("big");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100", "-o", path.join(r.dir, "out", `${SECRET()}.md`)]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] output file name/);
    expect(existsSync(path.join(r.dir, "out"))).toBe(false);
  });

  it("a raw character in --range + a --cwd path with a raw character: exit 1 (range)", () => {
    const r = repo(`cwd${ch(0x2028)}dir`);
    r.commit("x");
    const res = cli(path.dirname(r.dir), ["--cwd", r.dir, "--range", `${r.base}..HEAD${ch(0x202e)}`]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] range:1 U\+202E/);
  });

  it("controls: a size error alone and an unknown ref alone stay exit 2", () => {
    const r = repo();
    r.write("big.txt", BIG);
    r.commit("big");
    expect(cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--max-file-bytes", "100"]).code).toBe(2);
    expect(cli(r.dir, ["--range", `${r.base}..no-such-ref`, "--label", "p"]).code).toBe(2);
  });
});
