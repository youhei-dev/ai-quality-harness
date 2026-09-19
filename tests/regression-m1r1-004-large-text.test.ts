/**
 * M1-R1-004: text files above 1 MiB are scanned like any other file (streamed line by line); the
 * old size skip was fail-open.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const AWS = fake("AKIA", "ABCDEFGHIJKLMNOP");

function repo(files: Record<string, string | Buffer>): string {
  const t = makeTempDir("aiqh-r1-004-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  for (const [rel, c] of Object.entries(files)) writeFileSync(path.join(t.dir, rel), c);
  execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files)], { cwd: t.dir });
  return t.dir;
}

describe("M1-R1-004: large text files are not skipped", () => {
  it("a secret at the end of a >1 MiB text file is found with the right line", () => {
    const filler = "x".repeat(99) + "\n";
    const lineCount = Math.ceil((1024 * 1024 + 1) / filler.length);
    const big = filler.repeat(lineCount) + `key ${AWS}\n`;
    const r = scanRepository(repo({ "big.txt": big }));
    const secrets = r.findings.filter((f) => f.kind === "secret").map((f) => [f.category, f.file, f.line]);
    expect(secrets).toEqual([["aws", "big.txt", lineCount + 1]]);
    expect(r.filesScanned).toBe(2);
    expect(JSON.stringify(r)).not.toContain(AWS);
  });
  it("a large clean text file is scanned (counted) and a large binary file is still skipped", () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 0x41);
    const bin = Buffer.concat([Buffer.from("BIN\0\0"), Buffer.alloc(1024 * 1024 + 1, 0x42)]);
    const r = scanRepository(repo({ "big.txt": big, "big.bin": bin }));
    expect(r.filesScanned).toBe(2);
    expect(r.skippedBinary).toBe(1);
    expect(r.findings.filter((f) => f.kind === "secret")).toEqual([]);
  });
  it("a multi-byte character straddling the read-chunk boundary does not break line numbering", () => {
    // 64 KiB chunks: place "あ" (3 bytes) so it straddles the first boundary, then a secret two lines later.
    const chunk = 64 * 1024;
    const pre = "y".repeat(chunk - 1);
    const text = `${pre}あ\nsecond\nk=${AWS}\n`;
    const r = scanRepository(repo({ "u.txt": text }));
    expect(r.findings.filter((f) => f.kind === "secret").map((f) => f.line)).toEqual([3]);
  });
});
