/**
 * M1-R2-001: an environment file that exists, is untracked and is not ignored by git is a finding
 * ("untracked-env") on its own — without reading it. Example / sample / template / dist files stay
 * informational; files git ignores never appear in `ls-files --others --exclude-standard`.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const SECRET = fake("AKIA", "ABCDEFGHIJKLMNOP");

/** git repo whose .gitignore names the four representative env paths only (the reviewer's setup). */
function repo(gitignore = ".env\n.env.local\n.env.production\n.env.development\n"): string {
  const t = makeTempDir("aiqh-r2-001-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), gitignore);
  writeFileSync(path.join(t.dir, "a.txt"), "x\n");
  execFileSync("git", ["add", "--", ".gitignore", "a.txt"], { cwd: t.dir });
  return t.dir;
}
const envFindings = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "untracked-env").map((f) => f.file);

describe("M1-R2-001: untracked, non-ignored environment files", () => {
  it(".env.staging present and not ignored → finding, content never read or printed", async () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".env.staging"), `KEY=${SECRET}\n`);
    const r = scanRepository(dir);
    expect(r.findings.filter((f) => f.kind === "untracked-env").map((f) => f.file)).toEqual([".env.staging"]);
    expect(r.findings.filter((f) => f.kind === "secret")).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const lines: string[] = [];
    const code = await runSecurityScan({ cwd: dir, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain(".env.staging");
    expect(lines.join("\n")).not.toContain(SECRET);
  });
  it("nested config/.env.staging → finding", () => {
    const dir = repo();
    mkdirSync(path.join(dir, "config"));
    writeFileSync(path.join(dir, "config", ".env.staging"), "X=1\n");
    expect(envFindings(dir)).toEqual(["config/.env.staging"]);
  });
  it(".env.example → no finding (informational)", () => {
    const dir = repo();
    writeFileSync(path.join(dir, ".env.example"), "X=\n");
    const r = scanRepository(dir);
    expect(r.findings.filter((f) => f.kind === "untracked-env")).toEqual([]);
  });
  it(".env.staging ignored by .env* → not listed by git, no finding", () => {
    const dir = repo(".env*\n");
    writeFileSync(path.join(dir, ".env.staging"), "X=1\n");
    const r = scanRepository(dir);
    expect(r.findings.filter((f) => f.kind === "untracked-env")).toEqual([]);
    expect(r.filesUntracked).toBe(0);
  });
  it.skipIf(isRoot)("an unreadable env file (mode 000) is still reported and the scan does not fail: it is not read", () => {
    const dir = repo();
    const f = path.join(dir, ".env.staging");
    writeFileSync(f, "X=1\n");
    chmodSync(f, 0o000);
    cleanups.push(() => chmodSync(f, 0o644));
    expect(envFindings(dir)).toEqual([".env.staging"]);
  });
});
