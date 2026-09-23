/**
 * M2-1-R2-005 (Medium): inline code turned a backtick into backslash + backtick, but in CommonMark a
 * backslash does not escape inside a code span, so the real backtick (U+0060) still closed the span and the
 * rest of the value was read as Markdown. Now no U+0060 is left inside inline code: a backtick becomes the
 * ASCII notation `\u{60}`. No Markdown parser is added (no new dependency): outside fenced blocks every
 * backtick run must be a single backtick and the runs must pair up on each line, so the content between an
 * opening and its closing backtick never contains U+0060; and each value appears as one whole code span.
 * Values with backticks: a path, an --exclude glob, the request and review file names, a verify value and a
 * commit subject.
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

const TICK = String.fromCodePoint(0x60);
const NOTATION = "\\u{60}";

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

/** Problems with the code spans of one line: a backtick run longer than 1, or an unpaired backtick. */
function spanProblems(line: string): string[] {
  const runs = [...line.matchAll(/`+/g)].map((m) => m[0].length);
  const problems: string[] = [];
  if (runs.some((n) => n !== 1)) problems.push(`backtick run longer than 1: ${line}`);
  if (runs.length % 2 !== 0) problems.push(`unpaired backtick: ${line}`);
  return problems;
}

describe("M2-1-R2-005: no raw backtick inside inline code", () => {
  it("paths, globs, file names, verify values and commit subjects with backticks render as whole code spans without U+0060", async () => {
    const t = makeTempDir("aiqh-r2-005-");
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

    const values = {
      path: `pa${TICK}th${TICK}${TICK}x.txt`,
      glob: `none/gl${TICK}ob*`,
      request: `req${TICK}uest.md`,
      review: `rev${TICK}${TICK}${TICK}iew.md`,
      check: `chk${TICK}name`,
      subject: `subj ${TICK}code${TICK} and ${TICK}${TICK}two${TICK}${TICK} # h`,
    };
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: "tick path\n", encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: dir, input: Buffer.concat([Buffer.from(`100644 ${blob}\t${values.path}`), Buffer.from([0])]) });
    git("commit", "-q", "-m", values.subject);
    const head = git("rev-parse", "HEAD").trim();
    mkdirSync(path.join(dir, "artifacts", "verification"), { recursive: true });
    writeFileSync(
      path.join(dir, "artifacts", "verification", "latest.json"),
      JSON.stringify({ git: { commit: head, branch: "main", dirty: false }, verdict: "PASSED", exitCode: 0, tool: { name: "aiqh", version: "t" }, checks: [{ name: values.check, kind: "unit", required: true, status: "PASS", exitCode: 0, durationMs: 1 }] }),
    );
    writeFileSync(path.join(t.dir, values.request), "plain request\n");
    writeFileSync(path.join(t.dir, values.review), "plain review\n");

    const err: string[] = [];
    const code = await runReviewPacket({
      cwd: dir,
      range: `${base}..HEAD`,
      label: "bt",
      request: path.join(t.dir, values.request),
      review: [path.join(t.dir, values.review)],
      exclude: [values.glob],
      toolVersion: "t",
      log: () => {},
      logError: (l) => err.push(l),
    });
    expect(code, err.join("\n")).toBe(0);
    const md = readFileSync(path.join(dir, "artifacts", "ai-review", "review-packet-bt.md"), "utf8");
    const lines = outsideFences(md);
    expect(lines.flatMap(spanProblems)).toEqual([]);
    for (const [name, v] of Object.entries(values)) {
      const inner = v.split(TICK).join(NOTATION);
      expect(inner, name).not.toContain(TICK);
      // the whole value is one code span (the subject also goes through a table cell: no "|" in it)
      expect(lines.some((l) => l.includes(`${TICK}${inner}${TICK}`)), name).toBe(true);
    }
  });
});
