/**
 * M1-R2-004 (R1-004 follow-up): a line longer than MAX_LINE_BYTES is scanned as a sliding window
 * (segments of the same line number with an overlap) so memory stays bounded whatever the file
 * size. Detection at the start, the end and across a window boundary is kept.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LINE_OVERLAP, LineAssembler, MAX_LINE_BYTES, scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const AWS = fake("AKIA", "ABCDEFGHIJKLMNOP");
const TWENTY_MIB = 20 * 1024 * 1024;

function repo(files: Record<string, string>): string {
  const t = makeTempDir("aiqh-r2-004-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  for (const [rel, c] of Object.entries(files)) writeFileSync(path.join(t.dir, rel), c);
  execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files)], { cwd: t.dir });
  return t.dir;
}
/** Filler is "-" (a non-word character) so the \b boundaries of the AWS pattern hold around the key. */
function oneLine(total: number, secretAt: number): string {
  const before = "-".repeat(secretAt);
  const after = "-".repeat(Math.max(0, total - secretAt - AWS.length));
  return `${before}${AWS}${after}`;
}
const secretLines = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "secret").map((f) => [f.category, f.line]);

describe("M1-R2-004: sliding window over a single huge line", () => {
  it("secret at the end of a 20 MiB line without newline → found at line 1, once", () => {
    const dir = repo({ "big.txt": oneLine(TWENTY_MIB, TWENTY_MIB - AWS.length) });
    expect(secretLines(dir)).toEqual([["aws", 1]]);
  });
  it("secret at the start → found at line 1", () => {
    const dir = repo({ "big.txt": oneLine(TWENTY_MIB, 0) });
    expect(secretLines(dir)).toEqual([["aws", 1]]);
  });
  it("secret straddling the first window boundary (just before / after MAX_LINE_BYTES) → found once", () => {
    for (const at of [MAX_LINE_BYTES - 5, MAX_LINE_BYTES - 1, MAX_LINE_BYTES]) {
      const dir = repo({ "big.txt": oneLine(TWENTY_MIB, at) });
      expect(secretLines(dir), `secret at ${at}`).toEqual([["aws", 1]]);
    }
  });
  it("line numbers still advance by newlines after a long line", () => {
    const dir = repo({ "mixed.txt": `${"-".repeat(MAX_LINE_BYTES * 3)}\nsecond\nk=${AWS}\n` });
    expect(secretLines(dir)).toEqual([["aws", 3]]);
  });
  it("LineAssembler never retains more than MAX_LINE_BYTES + LINE_OVERLAP characters", () => {
    const seen: Array<[number, boolean]> = [];
    const a = new LineAssembler((_line, lineNo, continued) => seen.push([lineNo, continued]));
    let maxPending = 0;
    const chunk = "q".repeat(64 * 1024);
    for (let i = 0; i < 64; i += 1) {
      a.push(chunk);
      maxPending = Math.max(maxPending, a.pendingLength);
    }
    a.push("\nlast\n");
    a.end();
    expect(maxPending).toBeLessThanOrEqual(MAX_LINE_BYTES + LINE_OVERLAP);
    expect(seen.filter(([n]) => n === 1).length).toBeGreaterThan(1);
    expect(seen.filter(([n, c]) => n === 1 && c).length).toBe(seen.filter(([n]) => n === 1).length - 1);
    expect(seen.at(-1)).toEqual([2, false]);
    expect(LINE_OVERLAP).toBeGreaterThanOrEqual(4 * 1024);
  });
});
