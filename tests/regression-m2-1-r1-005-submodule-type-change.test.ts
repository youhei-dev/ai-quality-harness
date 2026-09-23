/**
 * M2-1-R1-005 (Medium): a submodule → regular file type change (`:160000 100644 … T`) was classified as
 * a submodule because the old mode was also consulted, so the new text file got no full source and no
 * diff. Now the displayed side decides: for a deletion the old mode, otherwise the new mode, must be
 * 160000 for "submodule". A type change is marked in the Changed Files table.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { makeTempDir } from "./helpers.ts";

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

function repo(): { dir: string; git: (...a: string[]) => string; head: () => string } {
  const t = makeTempDir("aiqh-r1-005-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  return { dir: t.dir, git, head: () => git("rev-parse", "HEAD").trim() };
}

async function packet(dir: string, from: string): Promise<string> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd: dir, range: `${from}..HEAD`, label: "sm", toolVersion: "t", log: () => {}, logError: (l) => err.push(l) });
  expect(code, err.join("\n")).toBe(0);
  return readFileSync(path.join(dir, "artifacts", "ai-review", "review-packet-sm.md"), "utf8");
}

const section = (md: string, from: string, to: string): string => md.slice(md.indexOf(from), md.indexOf(to));
const row = (md: string, p: string): string => section(md, "# Changed Files", "# Diff").split("\n").find((l) => l.includes(`| \`${p}\` |`)) ?? "";

describe("M2-1-R1-005: submodule classification follows the displayed side", () => {
  it("(a) regular file -> submodule: T, submodule (type change), no content", async () => {
    const r = repo();
    writeFileSync(path.join(r.dir, "sub"), "was a file\n");
    r.git("add", "--", "sub");
    r.git("commit", "-q", "-m", "file");
    const from = r.head();
    r.git("rm", "-q", "--cached", "sub");
    rmSync(path.join(r.dir, "sub"));
    r.git("update-index", "--add", "--cacheinfo", `160000,${from},sub`);
    r.git("commit", "-q", "-m", "file to gitlink");
    const md = await packet(r.dir, from);
    expect(row(md, "sub")).toMatch(/\| T \| `sub` \| {2}\| submodule \(type change\) \|/);
    expect(section(md, "# Full Source", "# Documents")).not.toContain("was a file");
  });

  it("(b) submodule -> regular file: kind text, full source and a diff with the type change and the body", async () => {
    const r = repo();
    r.git("update-index", "--add", "--cacheinfo", `160000,${r.head()},sub`);
    r.git("commit", "-q", "-m", "gitlink");
    const from = r.head();
    r.git("rm", "-q", "--cached", "sub");
    writeFileSync(path.join(r.dir, "sub"), "now text\n");
    r.git("add", "--", "sub");
    r.git("commit", "-q", "-m", "gitlink to file");
    const md = await packet(r.dir, from);
    expect(row(md, "sub")).toMatch(/\| T \| `sub` \| {2}\| text \(type change\) \|/);
    expect(section(md, "# Full Source", "# Documents")).toContain("## `sub` (1 lines)\n\n```text\nnow text\n```");
    const diff = section(md, "# Diff", "# Full Source");
    expect(diff).toContain("deleted file mode 160000");
    expect(diff).toContain("new file mode 100644");
    expect(diff).toContain("+now text");
  });

  it("(c) submodule deleted: submodule, no content", async () => {
    const r = repo();
    r.git("update-index", "--add", "--cacheinfo", `160000,${r.head()},sub`);
    r.git("commit", "-q", "-m", "gitlink");
    const from = r.head();
    r.git("rm", "-q", "--cached", "sub");
    r.git("commit", "-q", "-m", "remove gitlink");
    const md = await packet(r.dir, from);
    expect(row(md, "sub")).toMatch(/\| D \| `sub` \| {2}\| submodule \|/);
  });

  it("(d) submodule added: submodule, no content", async () => {
    const r = repo();
    const from = r.head();
    r.git("update-index", "--add", "--cacheinfo", `160000,${from},sub`);
    r.git("commit", "-q", "-m", "add gitlink");
    const md = await packet(r.dir, from);
    expect(row(md, "sub")).toMatch(/\| A \| `sub` \| {2}\| submodule \|/);
  });
});
