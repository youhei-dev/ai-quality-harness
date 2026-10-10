/**
 * Backlog 17: a symbolic link (mode 120000) in the range was a text file in the packet: kind `text` (or `deleted`, or `lock` for a link
 * named like a lockfile), and its blob, the link target, was shown as the "full source" of a one-line file. Now, by the displayed side
 * (the rule of M2-1-R1-005: the old mode for a deletion, otherwise the new mode), a link is kind `symlink`: it has no full source, and
 * its diff (with the target, the thing a reviewer wants to see) is kept and checked as before. The links are made with git's plumbing,
 * not with the file system. A link that becomes a regular file and the secret check of a target are controls: they pass before and after.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function repo(): { dir: string; git: (...a: string[]) => string; head: () => string; link: (p: string, target: string) => void } {
  const t = makeTempDir("aiqh-b17-");
  cleanups.push(t.cleanup);
  const run = (args: string[], input?: string): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8", ...(input === undefined ? {} : { input }) });
  const git = (...args: string[]): string => run(args);
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  /** Stage `p` as a symbolic link to `target` (a blob holding the target, mode 120000), without touching the file system. */
  const link = (p: string, target: string): void => {
    const blob = run(["hash-object", "-w", "--stdin"], target).trim();
    run(["update-index", "--add", "--cacheinfo", `120000,${blob},${p}`]);
  };
  return { dir: t.dir, git, head: () => git("rev-parse", "HEAD").trim(), link };
}

async function packet(dir: string, from: string): Promise<{ code: number; md: string; err: string }> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd: dir, range: `${from}..HEAD`, label: "ln", toolVersion: "t", log: () => {}, logError: (l) => err.push(l) });
  const file = path.join(dir, "artifacts", "ai-review", "review-packet-ln.md");
  return { code, md: existsSync(file) ? readFileSync(file, "utf8") : "", err: err.join("\n") };
}

/** The text from `from` up to the first `to` after it. */
const section = (md: string, from: string, to: string): string => {
  const start = md.indexOf(from);
  return md.slice(start, md.indexOf(to, start + from.length));
};
const row = (md: string, p: string): string => section(md, "# Changed Files", "# Diff").split("\n").find((l) => l.includes(`| \`${p}\` |`)) ?? "";
const fullSource = (md: string): string => section(md, "# Full Source", "# Documents");

describe("backlog 17: a symbolic link is listed as kind symlink, with its diff and without a full source", () => {
  it("an added link: kind symlink; the diff shows mode 120000 and the target; no full source", async () => {
    const r = repo();
    const from = r.head();
    r.link("docs-link", "docs/target.md");
    r.git("commit", "-q", "-m", "link");
    const p = await packet(r.dir, from);
    expect(p.code, p.err).toBe(0);
    expect(row(p.md, "docs-link")).toMatch(/^\| 1 \| A \| `docs-link` \| {2}\| symlink \| 14 \| 1 \| 0 \|$/);
    const diff = section(p.md, "# Diff", "# Full Source");
    expect(diff).toContain("new file mode 120000");
    expect(diff).toContain("+docs/target.md");
    expect(fullSource(p.md)).not.toContain("docs-link");
  });

  it("a regular file that becomes a link: symlink (type change), no full source", async () => {
    const r = repo();
    writeFileSync(path.join(r.dir, "x"), "was a file\n");
    r.git("add", "--", "x");
    r.git("commit", "-q", "-m", "file");
    const from = r.head();
    r.git("rm", "-q", "--cached", "x");
    r.link("x", "elsewhere");
    r.git("commit", "-q", "-m", "file to link");
    const p = await packet(r.dir, from);
    expect(p.code, p.err).toBe(0);
    expect(row(p.md, "x")).toMatch(/\| T \| `x` \| {2}\| symlink \(type change\) \|/);
    expect(fullSource(p.md)).not.toMatch(/## `x`/);
  });

  it("a deleted link: kind symlink (the displayed side is the old one; before: deleted)", async () => {
    const r = repo();
    r.link("gone-link", "somewhere");
    r.git("commit", "-q", "-m", "link");
    const from = r.head();
    r.git("rm", "-q", "--cached", "gone-link");
    r.git("commit", "-q", "-m", "remove link");
    const p = await packet(r.dir, from);
    expect(p.code, p.err).toBe(0);
    expect(row(p.md, "gone-link")).toMatch(/\| D \| `gone-link` \| {2}\| symlink \|/);
    expect(section(p.md, "# Diff", "# Full Source")).toContain("deleted file mode 120000");
  });

  it("a link named like a lockfile: symlink, not lock (its blob is a target, not a generated file); the diff is shown", async () => {
    const r = repo();
    const from = r.head();
    r.link("yarn.lock", "../shared/yarn.lock");
    r.git("commit", "-q", "-m", "lock link");
    const p = await packet(r.dir, from);
    expect(p.code, p.err).toBe(0);
    expect(row(p.md, "yarn.lock")).toMatch(/\| symlink \|/);
    expect(section(p.md, "# Diff", "# Full Source")).toContain("+../shared/yarn.lock");
  });

  it("the Changed Files and Full Source headings name the kind", async () => {
    const r = repo();
    const from = r.head();
    r.link("l", "t");
    r.git("commit", "-q", "-m", "link");
    const p = await packet(r.dir, from);
    expect(section(p.md, "# Changed Files", "| # | Status")).toMatch(/symlink \(diff only: the link target\)/);
    expect(section(p.md, "# Full Source", "\n## ")).toMatch(/excluded, submodule and symlink entries have none/);
  });
});

describe("backlog 17 controls (pass before and after)", () => {
  it("a link that becomes a regular file: text (type change), with the new file's full source", async () => {
    const r = repo();
    r.link("y", "elsewhere");
    r.git("commit", "-q", "-m", "link");
    const from = r.head();
    r.git("rm", "-q", "--cached", "y");
    writeFileSync(path.join(r.dir, "y"), "now text\n");
    r.git("add", "--", "y");
    r.git("commit", "-q", "-m", "link to file");
    const p = await packet(r.dir, from);
    expect(p.code, p.err).toBe(0);
    expect(row(p.md, "y")).toMatch(/\| T \| `y` \| {2}\| text \(type change\) \|/);
    expect(fullSource(p.md)).toContain("## `y` (1 lines)");
  });

  it("a secret-shaped link target is still a finding: exit 1, nothing written", async () => {
    const r = repo();
    const from = r.head();
    r.link("k", `keys/${fake("AKIA", "ABCDEFGHIJKLMNOP")}`);
    r.git("commit", "-q", "-m", "link");
    const p = await packet(r.dir, from);
    expect(p.code).toBe(1);
    expect(p.md).toBe("");
    expect(p.err).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
  });
});
