/**
 * M1-R2-002: only ENOENT (in the index, gone from the work tree) is skipped; every other lstat
 * failure is a ScanError (exit 2), like read errors.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { classifyStatError, ScanError, scanRepository } from "../src/security/scan.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
function errno(code: string): NodeJS.ErrnoException {
  const e = new Error(`${code}: synthetic`) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

describe("M1-R2-002: lstat failures", () => {
  it("classifyStatError: ENOENT → skip, anything else → error", () => {
    expect(classifyStatError(errno("ENOENT"))).toBe("skip");
    for (const code of ["EACCES", "EPERM", "ELOOP", "EIO", "ENOTDIR"]) expect(classifyStatError(errno(code)), code).toBe("error");
    expect(classifyStatError(new Error("no code"))).toBe("error");
  });
  it.skipIf(isRoot)("a tracked file inside an unreadable directory → ScanError and CLI exit 2", async () => {
    const t = makeTempDir("aiqh-r2-002-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    mkdirSync(path.join(t.dir, "locked"));
    writeFileSync(path.join(t.dir, "locked", "f.txt"), "x\n");
    execFileSync("git", ["add", "--", ".gitignore", "locked/f.txt"], { cwd: t.dir });
    chmodSync(path.join(t.dir, "locked"), 0o000);
    cleanups.push(() => chmodSync(path.join(t.dir, "locked"), 0o755));
    expect(() => scanRepository(t.dir)).toThrow(ScanError);
    const code = await runSecurityScan({ cwd: t.dir, log: () => {}, logError: () => {} });
    expect(code).toBe(2);
  });
});
