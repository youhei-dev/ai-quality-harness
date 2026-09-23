/**
 * M2-1-R1-001 (High): paths from git's -z output were decoded with Buffer#toString("utf8"), so an
 * invalid UTF-8 path became U+FFFD, raised no finding, and its diff came back empty through the
 * broken :(literal) pathspec. Now every path is decoded strictly (invalid ⇒ `invalid-utf8`, exit 1),
 * a valid path with a forbidden character other than LF / TAB is a `raw-char` finding (exit 1), the
 * check also covers --exclude'd files, and an empty diff for a changed text file is an error (exit 2).
 *
 * Paths are put into the index directly (`git update-index -z --index-info` with the bytes on stdin),
 * so no file with such a name is created: this runs on every file system (macOS refuses invalid UTF-8
 * names with EILSEQ). Bytes and forbidden characters are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

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

interface Repo {
  dir: string;
  base: string;
  git: (...args: string[]) => string;
  /** Add an index entry whose path is the given bytes, then commit. */
  commitPath: (pathBytes: Buffer, content: string, message?: string) => void;
}

function repo(): Repo {
  const t = makeTempDir("aiqh-r1-001-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  const commitPath = (pathBytes: Buffer, content: string, message = "path"): void => {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: t.dir, input: content, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: t.dir, input: Buffer.concat([Buffer.from(`100644 ${blob}\t`), pathBytes, Buffer.from([0])]) });
    git("commit", "-q", "-m", message);
  };
  return { dir: t.dir, base, git, commitPath };
}

function cli(cwd: string, args: string[]): { code: number | null; stdout: Buffer; stderr: Buffer } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, encoding: "buffer", timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const bytes = (...parts: Array<string | number[]>): Buffer => Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : Buffer.from(p))));

describe("M2-1-R1-001: git paths are decoded strictly and checked for raw characters", () => {
  it("a path with byte 0xFF: exit 1 (invalid-utf8, source path), nothing written, no raw byte or U+FFFD printed", () => {
    const r = repo();
    r.commitPath(bytes("bad_", [0xff], ".txt"), "content\n");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--zip"]);
    expect(res.code, res.stderr.toString()).toBe(1);
    expect(res.stderr.toString("utf8")).toMatch(/\[invalid-utf8\] path \(git diff --raw entry \d+\)/);
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
    const out = Buffer.concat([res.stdout, res.stderr]);
    expect(out.includes(0xff)).toBe(false);
    expect(out.toString("utf8")).not.toContain(ch(0xfffd));
  });

  it("an --exclude'd file is still checked for its path", () => {
    const r = repo();
    r.commitPath(bytes("vendor/bad_", [0xfe, 0x80], ".txt"), "content\n");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "--exclude", "vendor/**"]);
    expect(res.code, res.stderr.toString()).toBe(1);
    expect(res.stderr.toString("utf8")).toMatch(/\[invalid-utf8\] path/);
  });

  for (const [name, cp] of [
    ["U+2028", 0x2028],
    ["CR", 0x0d],
    ["U+202E", 0x202e],
  ] as const) {
    it(`a valid UTF-8 path with ${name}: exit 1 (raw-char), nothing written`, () => {
      const r = repo();
      r.commitPath(bytes(`sep${ch(cp)}name.txt`), "content\n");
      const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p"]);
      expect(res.code, res.stderr.toString()).toBe(1);
      expect(res.stderr.toString("utf8")).toMatch(new RegExp(`\\[raw-char\\] path \\(git diff --raw entry \\d+\\) U\\+${cp.toString(16).toUpperCase().padStart(4, "0")}`));
      expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
      expect(res.stderr.toString("utf8")).not.toContain(ch(cp));
    });
  }

  it("LF and TAB in a path stay allowed (exit 0) and the path's diff and full source are present", () => {
    const r = repo();
    r.commitPath(bytes("line\nbreak\tand tab.txt"), "tab and newline path\n");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p"]);
    expect(res.code, res.stderr.toString()).toBe(0);
    const md = readFileSync(path.join(r.dir, "artifacts", "ai-review", "review-packet-p.md"), "utf8");
    expect(md.slice(md.indexOf("# Diff"), md.indexOf("# Full Source"))).toContain("+tab and newline path");
    expect(md.slice(md.indexOf("# Full Source"))).toContain("tab and newline path");
  });

  it("an NFD path with core.precomposeunicode=true (the macOS default of git init) still gets its diff and full source", () => {
    const r = repo();
    r.git("config", "core.precomposeunicode", "true");
    r.commitPath(bytes(`cafe${ch(0x301)}.txt`), "nfd content\n");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "nfd"]);
    expect(res.code, res.stderr.toString()).toBe(0);
    const md = readFileSync(path.join(r.dir, "artifacts", "ai-review", "review-packet-nfd.md"), "utf8");
    const diff = md.slice(md.indexOf("# Diff"), md.indexOf("# Full Source"));
    expect(diff).toContain("+nfd content");
    expect(md.slice(md.indexOf("# Full Source"))).toContain("nfd content");
  });

  it("changes whose diff is legitimately short are not empty: mode only, pure rename, empty file added and deleted", () => {
    const r = repo();
    writeFileSync(path.join(r.dir, "empty.txt"), "");
    writeFileSync(path.join(r.dir, "moved.ts"), "export const moved = 1;\nexport const b = 2;\nexport const c = 3;\n");
    r.git("add", "--", "empty.txt", "moved.ts");
    r.git("commit", "-q", "-m", "setup");
    const setup = r.git("rev-parse", "HEAD").trim();
    r.git("update-index", "--chmod=+x", "a.ts");
    r.git("mv", "moved.ts", "renamed.ts");
    r.git("rm", "-q", "--", "empty.txt");
    writeFileSync(path.join(r.dir, "new-empty.txt"), "");
    r.git("add", "--", "new-empty.txt");
    r.git("commit", "-q", "-m", "short diffs");
    const res = cli(r.dir, ["--range", `${setup}..HEAD`, "--label", "short"]);
    expect(res.code, res.stderr.toString()).toBe(0);
  });
});
