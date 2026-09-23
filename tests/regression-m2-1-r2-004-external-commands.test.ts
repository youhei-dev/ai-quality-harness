/**
 * M2-1-R2-004 (High): the Python zipfile test was skipped only when python3 was missing, but computed the
 * expected SHA-256 with `shasum`, which was never probed: with python3 and without shasum the test body
 * crashed with a TypeError. Expected hashes are now computed with node:crypto, and tests start no external
 * command other than git and node unless its availability is part of the skip condition.
 *  - static: every command name given as a literal to spawnSync / execFileSync / … in tests/ is git, or a
 *    probed tool (unzip, python3) in a file that uses it.skipIf
 *  - dynamic: with only node, git, python3 and unzip on PATH, the tests that used shasum / rm run to a verdict
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, readdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Absolute path of `cmd` on the current PATH, or null (no shell, no `which`). */
function which(cmd: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir.length === 0) continue;
    const p = path.join(dir, cmd);
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // not here
    }
  }
  return null;
}

const CALLS = ["spawnSync", "execFileSync", "execSync", "spawn", "execFile"].join("|");
const ALWAYS = new Set(["git"]);
const PROBED = new Set(["unzip", "python3"]);

describe("M2-1-R2-004: tests start no undeclared external command", () => {
  it("static: literal command names in tests/ are git, or a probed tool in a file that skips without it", () => {
    const pattern = new RegExp(`\\b(?:${CALLS})\\(\\s*"([^"]+)"`, "g");
    const problems: string[] = [];
    for (const f of readdirSync(path.join(ROOT, "tests")).filter((n) => n.endsWith(".ts")).sort()) {
      const src = readFileSync(path.join(ROOT, "tests", f), "utf8");
      for (const m of src.matchAll(pattern)) {
        const cmd = m[1] ?? "";
        if (ALWAYS.has(cmd)) continue;
        if (PROBED.has(cmd) && src.includes("it.skipIf(")) continue;
        problems.push(`${f}: ${cmd}`);
      }
    }
    expect(problems).toEqual([]);
  });

  const python = which("python3");
  it.skipIf(python === null)("dynamic: with python3 but without shasum and rm on PATH, the affected tests run to a verdict", () => {
    const bin = makeTempDir("aiqh-r2-004-bin-");
    cleanups.push(bin.cleanup);
    const tools: Array<[string, string | null]> = [
      ["node", process.execPath],
      ["git", which("git")],
      ["python3", python],
      ["unzip", which("unzip")],
    ];
    for (const [name, target] of tools) if (target !== null) symlinkSync(target, path.join(bin.dir, name));
    expect(readdirSync(bin.dir)).not.toContain("shasum");
    const res = spawnSync(
      process.execPath,
      [path.join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "tests/zip-interop.test.ts", "tests/regression-m2-1-sp3.test.ts", "tests/review-packet.test.ts"],
      { cwd: ROOT, env: { ...process.env, PATH: bin.dir, NO_COLOR: "1", FORCE_COLOR: "0" }, encoding: "utf8", timeout: 300_000, killSignal: "SIGKILL" },
    );
    const out = res.stdout + res.stderr;
    expect(out).not.toMatch(/TypeError|ENOENT/);
    expect(res.status, out.slice(-3000)).toBe(0);
    expect(out).toMatch(/Test Files {2}3 passed/);
  }, 320_000);
});
