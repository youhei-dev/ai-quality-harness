/**
 * M2-1-R2-002 (High): the packet path and the ZIP path were compared as strings only, so two different
 * strings for the same file (a symbolic link in a parent directory, or a case-only difference on a
 * case-insensitive file system) were written as two targets: the ZIP replaced the packet and the existing
 * file was lost although the command succeeded. Now both targets are compared before the prepare phase as
 * realpath(parent) + basename, case-insensitively (on every file system), and the same target is exit 2
 * with nothing written. A parent that does not exist yet is resolved through its nearest existing ancestor.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket, type ReviewPacketOptions } from "../src/commands/review-packet.ts";
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

function repo(): { dir: string; base: string; real: string; alias: string } {
  const t = makeTempDir("aiqh-r2-002-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 2;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "change");
  const real = path.join(t.dir, "real");
  mkdirSync(real);
  const alias = path.join(t.dir, "alias");
  symlinkSync(real, alias);
  return { dir: t.dir, base, real, alias };
}

async function run(r: { dir: string; base: string }, extra: Partial<ReviewPacketOptions>): Promise<{ code: number; err: string }> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, toolVersion: "t", log: () => {}, logError: (l) => err.push(l), ...extra });
  return { code, err: err.join("\n") };
}

const OLD = Buffer.from([0x4f, 0x4c, 0x44, 0x00, 0xff, 0x0a]);

describe("M2-1-R2-002: packet and ZIP paths that resolve to the same file are rejected", () => {
  it("a symbolic link in the parent (real/same.md and alias/same.md): exit 2, the existing file byte for byte unchanged", async () => {
    const r = repo();
    writeFileSync(path.join(r.real, "same.md"), OLD);
    const res = await run(r, { output: path.join(r.real, "same.md"), zipOutput: path.join(r.alias, "same.md") });
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/--zip-output .*same file as the packet/);
    expect(readFileSync(path.join(r.real, "same.md")).equals(OLD)).toBe(true);
    expect(readdirSync(r.real)).toEqual(["same.md"]);
  });

  it("a case-only difference (p.md and P.md): exit 2 on every file system, the existing file unchanged", async () => {
    const r = repo();
    writeFileSync(path.join(r.real, "p.md"), OLD);
    const res = await run(r, { output: path.join(r.real, "p.md"), zipOutput: path.join(r.real, "P.md") });
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/same file as the packet/);
    expect(readFileSync(path.join(r.real, "p.md")).equals(OLD)).toBe(true);
    expect(readdirSync(r.real)).toEqual(["p.md"]);
  });

  it("a case-only difference in a parent directory through the link (alias/Sub vs real/sub): exit 2", async () => {
    const r = repo();
    mkdirSync(path.join(r.real, "sub"));
    writeFileSync(path.join(r.real, "sub", "x.md"), OLD);
    const res = await run(r, { output: path.join(r.real, "sub", "x.md"), zipOutput: path.join(r.alias, "SUB", "x.md") });
    expect(res.code, res.err).toBe(2);
    expect(readFileSync(path.join(r.real, "sub", "x.md")).equals(OLD)).toBe(true);
  });

  it("parents that do not exist yet are compared through their nearest existing ancestor; nothing is created", async () => {
    const r = repo();
    const res = await run(r, { output: path.join(r.real, "new", "x.md"), zipOutput: path.join(r.alias, "new", "x.md") });
    expect(res.code, res.err).toBe(2);
    expect(existsSync(path.join(r.real, "new"))).toBe(false);
  });

  it("control: a symbolic link parent that leads to a different file is allowed (exit 0)", async () => {
    const r = repo();
    const res = await run(r, { output: path.join(r.alias, "packet.md"), zipOutput: path.join(r.real, "packet.zip") });
    expect(res.code, res.err).toBe(0);
    expect(readdirSync(r.real).sort()).toEqual(["packet.md", "packet.zip"]);
    expect(readFileSync(path.join(r.real, "packet.md"), "utf8")).toMatch(/^# Review Packet/);
    expect(readFileSync(path.join(r.real, "packet.zip")).readUInt32LE(0)).toBe(0x04034b50);
  });
});
