/**
 * M1-R1-001 (defence in depth, human decision): the scanner also covers untracked files that git
 * would not ignore (`git ls-files --others --exclude-standard`), so a self verify run before the
 * first commit of new files still sees them. Ignored files stay out of scope.
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

describe("M1-R1-001: untracked, non-ignored files are scanned", () => {
  it("finds a secret in an untracked file, skips an ignored file, counts both kinds", () => {
    const t = makeTempDir("aiqh-r1-001-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\nignored.txt\n");
    writeFileSync(path.join(t.dir, "tracked.txt"), "ok\n");
    execFileSync("git", ["add", "--", ".gitignore", "tracked.txt"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, "untracked.txt"), `x = ${AWS}\n`);
    writeFileSync(path.join(t.dir, "ignored.txt"), `y = ${AWS}\n`);
    const r = scanRepository(t.dir);
    const secrets = r.findings.filter((f) => f.kind === "secret").map((f) => [f.category, f.file, f.line]);
    expect(secrets).toEqual([["aws", "untracked.txt", 1]]);
    expect(r.filesTracked).toBe(2);
    expect(r.filesUntracked).toBe(1);
    expect(r.filesScanned).toBe(3);
    expect(JSON.stringify(r)).not.toContain(AWS);
  });

  it("an untracked .env file is not read (the .gitignore finding covers it) and is not reported as tracked", () => {
    const t = makeTempDir("aiqh-r1-001-env-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, "a.txt"), "ok\n");
    execFileSync("git", ["add", "--", "a.txt"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".env"), `KEY=${AWS}\n`);
    const r = scanRepository(t.dir);
    expect(r.findings.filter((f) => f.kind === "secret")).toEqual([]);
    expect(r.findings.filter((f) => f.kind === "tracked-env")).toEqual([]);
    expect(r.findings.filter((f) => f.kind === "gitignore").length).toBeGreaterThan(0);
    expect(r.filesUntracked).toBe(1);
  });
});
