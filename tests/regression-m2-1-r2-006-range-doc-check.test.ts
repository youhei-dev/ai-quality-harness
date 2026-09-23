/**
 * M2-1-R2-006 (Medium): --range and --doc were rendered into the packet (escaped, M2-1-R1-004) but not
 * checked before rendering, so a forbidden character in a valid ref name or in a --doc path that is not in
 * the changed-file list was turned into `\u{...}` and passed both stages. Now every option value that is
 * rendered is checked (raw characters and secret shapes) before git is run and before anything is
 * rendered: a finding is exit 1 with the source `range` / `doc path N`, no value is printed, nothing is
 * written. (With U+2028 the ref used to fail the `<from>..<to>` form check, exit 2, because the pattern's
 * "." does not match a line separator; the check now comes first.) Characters are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isForbiddenCodePoint } from "../src/security/raw-chars.ts";
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
const hex = (cp: number): string => cp.toString(16).toUpperCase().padStart(4, "0");

interface Repo {
  dir: string;
  git: (...args: string[]) => string;
  addPath: (p: string, content: string) => void;
}

function repo(): Repo {
  const t = makeTempDir("aiqh-r2-006-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  const addPath = (p: string, content: string): void => {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: t.dir, input: content, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: t.dir, input: Buffer.concat([Buffer.from(`100644 ${blob}\t`), Buffer.from(p, "utf8"), Buffer.from([0])]) });
  };
  return { dir: t.dir, git, addPath };
}

function cli(cwd: string, args: string[]): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const noRaw = (s: string): void => {
  expect([...s].map((c) => c.codePointAt(0) ?? 0).filter(isForbiddenCodePoint)).toEqual([]);
};

/** base (a.ts) → change (a.ts); a document path that is not changed in base..HEAD can be added before base. */
function twoCommits(r: Repo, docPath?: string): string {
  writeFileSync(path.join(r.dir, "a.ts"), "export const a = 1;\n");
  r.git("add", "--", "a.ts");
  if (docPath !== undefined) r.addPath(docPath, "# doc\n");
  r.git("commit", "-q", "-m", "base");
  const base = r.git("rev-parse", "HEAD").trim();
  writeFileSync(path.join(r.dir, "a.ts"), "export const a = 2;\n");
  r.git("add", "--", "a.ts");
  r.git("commit", "-q", "-m", "change");
  return base;
}

describe("M2-1-R2-006: --range and --doc are checked before rendering", () => {
  for (const cp of [0x2028, 0x202e]) {
    it(`a valid ref whose name contains U+${hex(cp)} in --range: exit 1 (range), nothing written, value not shown`, () => {
      const r = repo();
      const base = twoCommits(r);
      const tag = `rel${ch(cp)}tag`;
      r.git("tag", tag);
      // git itself resolves the ref
      expect(r.git("rev-parse", "--verify", `${tag}^{commit}`).trim()).toMatch(/^[0-9a-f]{40}$/);
      const res = cli(r.dir, ["--range", `${base}..${tag}`, "--label", "p", "--zip"]);
      expect(res.code, res.out).toBe(1);
      expect(res.out).toMatch(new RegExp(`\\[raw-char\\] range:1 U\\+${hex(cp)} \\(input\\)`));
      expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
      noRaw(res.out);
      expect(res.out).not.toContain("rel\\u{");
    });
  }

  for (const cp of [0x202e, 0x2028]) {
    it(`a --doc path with U+${hex(cp)} that is not in the changed-file list: exit 1 (doc path 1), nothing written`, () => {
      const r = repo();
      const doc = `docs/d${ch(cp)}.md`;
      const base = twoCommits(r, doc);
      const res = cli(r.dir, ["--range", `${base}..HEAD`, "--label", "p", "--doc", doc]);
      expect(res.code, res.out).toBe(1);
      expect(res.out).toMatch(new RegExp(`\\[raw-char\\] doc path 1:1 U\\+${hex(cp)} \\(input\\)`));
      expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
      noRaw(res.out);
    });
  }

  it("secret shapes in a ref name and in a --doc path are input findings with their source (not only the whole-packet check)", () => {
    const r = repo();
    const body = "QWERTYUIOPASDFGH";
    const doc = `docs/${fake("AKIA", body)}.md`;
    const base = twoCommits(r, doc);
    const tag = `t-${fake("AKIA", body)}`;
    r.git("tag", tag);
    const viaRange = cli(r.dir, ["--range", `${base}..${tag}`, "--label", "p"]);
    expect(viaRange.code, viaRange.out).toBe(1);
    expect(viaRange.out).toMatch(/\[secret\] range:1 aws \(input\)/);
    expect(viaRange.out).not.toContain(body);
    const viaDoc = cli(r.dir, ["--range", `${base}..HEAD`, "--label", "p", "--doc", doc]);
    expect(viaDoc.code, viaDoc.out).toBe(1);
    expect(viaDoc.out).toMatch(/\[secret\] doc path 1:1 aws \(input\)/);
    expect(viaDoc.out).not.toContain(body);
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
  });

  it("control: an ordinary ref and --doc path are rendered (exit 0)", () => {
    const r = repo();
    const base = twoCommits(r, "docs/plain.md");
    r.git("tag", "v-plain");
    const res = cli(r.dir, ["--range", `${base}..v-plain`, "--label", "p", "--doc", "docs/plain.md"]);
    expect(res.code, res.out).toBe(0);
  });
});
