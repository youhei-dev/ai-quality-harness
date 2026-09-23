/**
 * M2-1-R1-004 (Medium): metadata outside the fenced blocks (request / review file names, --exclude
 * globs, verify check names, commit subjects, paths) was inserted with only `|` escaped, so LF, backticks
 * or backslashes could create fake headings or break tables. Now inline code, headings and table cells
 * have their own renderers: LF, TAB, backslash and backtick become `\n` `\t` `\\` `` \` `` (so no backtick
 * is left inside the single-backtick code span), and table cells also escape `|`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const FIXED = [
  "# Review Packet",
  "# Request",
  "# Previous Reviews",
  "# Commits",
  "# Changed Files",
  "# Diff",
  "# Full Source of Changed Files",
  "# Documents",
  "# Verification",
  "# Integrity",
];

/** Lines outside fenced blocks (fence = a line of 3+ backticks; closed by the same run). */
function outsideFences(md: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = /^(`{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1] ?? null;
      else if (line.trim() === fence) fence = null;
      continue;
    }
    if (fence === null) out.push(line);
  }
  return out;
}

/** GFM: a pipe is a column separator unless preceded by an odd number of backslashes. */
function columns(row: string): number {
  let n = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== "|") continue;
    let bs = 0;
    for (let j = i - 1; j >= 0 && row[j] === "\\"; j--) bs++;
    if (bs % 2 === 0) n++;
  }
  return n;
}

/** Every table (header row followed by |---| row): each row must have the header's column count. */
function tableProblems(lines: string[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const header = lines[i] ?? "";
    if (!header.startsWith("|") || !/^\|(---\|)+$/.test(lines[i + 1] ?? "")) continue;
    const want = columns(header);
    for (let k = i + 2; k < lines.length && (lines[k] ?? "").startsWith("|"); k++) {
      if (columns(lines[k] ?? "") !== want) problems.push(`${header} :: ${lines[k]}`);
    }
  }
  return problems;
}

const NASTY = (tag: string): string => `x\n# Fake ${tag}\n\`\`\`\\|y`;

describe("M2-1-R1-004: metadata cannot change the packet's Markdown structure", () => {
  it("LF + '# Fake', backtick runs and backslash + pipe in names, globs, check names, subjects and paths", async () => {
    const t = makeTempDir("aiqh-r1-004-");
    cleanups.push(t.cleanup);
    const dir = path.join(t.dir, "repo");
    mkdirSync(dir);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
    git("add", "--", "a.ts");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD").trim();
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: "odd path content\n", encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: dir, input: Buffer.concat([Buffer.from(`100644 ${blob}\t${NASTY("Path")}.txt`), Buffer.from([0])]) });
    git("commit", "-q", "-m", `subject | with \`\`\` and \\| pipe`);
    const head = git("rev-parse", "HEAD").trim();
    mkdirSync(path.join(dir, "artifacts", "verification"), { recursive: true });
    writeFileSync(
      path.join(dir, "artifacts", "verification", "latest.json"),
      JSON.stringify({ git: { commit: head, branch: "main", dirty: false }, verdict: "PASSED", exitCode: 0, tool: { name: "aiqh", version: "t" }, checks: [{ name: NASTY("Verify"), kind: "unit\\|`", required: true, status: "PASS", exitCode: 0, durationMs: 1 }] }),
    );
    const req = path.join(t.dir, `${NASTY("Request")}.md`);
    writeFileSync(req, "plain request\n");
    const rev = path.join(t.dir, `${NASTY("Review")}.md`);
    writeFileSync(rev, "plain review\n");

    const err: string[] = [];
    const code = await runReviewPacket({ cwd: dir, range: `${base}..HEAD`, label: "md", request: req, review: [rev], exclude: [NASTY("Exclude")], toolVersion: "t", log: () => {}, logError: (l) => err.push(l) });
    expect(code, err.join("\n")).toBe(0);
    const md = readFileSync(path.join(dir, "artifacts", "ai-review", "review-packet-md.md"), "utf8");
    const lines = outsideFences(md);
    const top = lines.filter((l) => l.startsWith("# ")).map((l) => (l.startsWith("# Review Packet") ? "# Review Packet" : l));
    expect(top).toEqual(FIXED);
    expect(lines.filter((l) => /^#+ Fake/.test(l))).toEqual([]);
    expect(tableProblems(lines)).toEqual([]);
    // the names are still visible, in the escaped form
    expect(md).toContain("x\\n# Fake Request\\n\\`\\`\\`\\\\|y");
  });
});
