/**
 * M2-1-R3-001 (High): the packet / ZIP same-target check compared strings (realpath + NFC + toLowerCase), which do
 * not follow the file system's own rules. On APFS, parent directory names such as U+00DF / "ss" are the same
 * directory but different strings, so both files were written to one file: the existing file was lost with exit 0,
 * without any concurrent change. The check now asks the file system: after the prepare phase (parents created,
 * temporary files written) and right before the commit phase, both parents are stat'ed and compared by dev + ino,
 * and the ASCII basenames case-insensitively. Same target ⇒ exit 2, temporary files removed, existing file untouched.
 * A parent that changed between the prepare phase and the check (a symbolic link swapped) is exit 2 as well.
 *
 * For every pair of directory names the test first asks the file system whether they are the same directory
 * (mkdir, then stat under the other name): same ⇒ exit 2 and the existing file byte for byte unchanged; different
 * ⇒ exit 0 and both files written (no false rejection) — unless the early string check (kept for rejecting before
 * any directory is created) already treats them as equal, which is the accepted safe-side rejection on a file system
 * that distinguishes them. Names are built from code points at run time.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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

const cp = (...points: number[]): string => String.fromCodePoint(...points);

/** Directory name pairs: [label, a, b]. */
const PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ["U+00DF / ss", cp(0xdf), "ss"],
  ["U+03C2 / U+03C3", cp(0x3c2), cp(0x3c3)],
  ["U+00B5 / U+03BC", cp(0xb5), cp(0x3bc)],
  ["U+212A / k", cp(0x212a), "k"],
  ["U+0130 / i + U+0307", cp(0x130), `i${cp(0x307)}`],
  ["U+FB00 / ff", cp(0xfb00), "ff"],
  ["fullwidth U+FF21 / A", `x${cp(0xff21)}`, "xA"],
  ["fullwidth U+FF41 / fullwidth U+FF21", `x${cp(0xff41)}`, `x${cp(0xff21)}`],
];

function repo(): { dir: string; base: string } {
  const t = makeTempDir("aiqh-r3-001-");
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
  return { dir: t.dir, base };
}

async function run(r: { dir: string; base: string }, extra: Partial<ReviewPacketOptions>): Promise<{ code: number; err: string }> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, toolVersion: "t", log: () => {}, logError: (l) => err.push(l), ...extra });
  return { code, err: err.join("\n") };
}

const OLD = Buffer.from([0x4f, 0x4c, 0x44, 0x00, 0xfe, 0x0a]);

/** Does the file system treat `a` and `b` as the same directory name (inside `parent`)? */
function sameDirectoryOnFs(parent: string, a: string, b: string): boolean {
  const probe = path.join(parent, "probe");
  mkdirSync(probe);
  try {
    mkdirSync(path.join(probe, a));
    const other = path.join(probe, b);
    return existsSync(other) && statSync(other).ino === statSync(path.join(probe, a)).ino;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

describe("M2-1-R3-001: the same-target check asks the file system (dev + ino)", () => {
  for (const [label, a, b] of PAIRS) {
    it(`parent directory names ${label}: same directory on this file system ⇒ exit 2 and the existing file unchanged; otherwise both written`, async () => {
      const r = repo();
      const same = sameDirectoryOnFs(r.dir, a, b);
      const stringEqual = a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();
      const da = path.join(r.dir, `out-${a}`);
      mkdirSync(da);
      writeFileSync(path.join(da, "same.md"), OLD);
      const res = await run(r, { output: path.join(da, "same.md"), zipOutput: path.join(r.dir, `out-${b}`, "same.md") });
      if (same || stringEqual) {
        expect(res.code, res.err).toBe(2);
        expect(res.err).toMatch(/same file as the packet/);
        expect(readFileSync(path.join(da, "same.md")).equals(OLD)).toBe(true);
        expect(readdirSync(da)).toEqual(["same.md"]);
        if (!same) expect(existsSync(path.join(r.dir, `out-${b}`))).toBe(false);
      } else {
        expect(res.code, res.err).toBe(0);
        expect(readFileSync(path.join(da, "same.md"), "utf8")).toMatch(/^# Review Packet/);
        expect(readFileSync(path.join(r.dir, `out-${b}`, "same.md")).readUInt32LE(0)).toBe(0x04034b50);
      }
    });
  }

  for (const step of ["prepare:packet", "check:same-target"] as const) {
    it(`a parent symbolic link swapped after the string check (at ${step}): exit 2, the existing file unchanged, nothing left behind`, async () => {
      const r = repo();
      const A = path.join(r.dir, "A");
      const B = path.join(r.dir, "B");
      const alias = path.join(r.dir, "alias");
      mkdirSync(A);
      mkdirSync(B);
      symlinkSync(A, alias);
      writeFileSync(path.join(B, "same.md"), OLD);
      const res = await run(r, {
        output: path.join(alias, "same.md"),
        zipOutput: path.join(B, "same.md"),
        writeHooks: {
          beforeStep: (s) => {
            if (s !== step) return;
            unlinkSync(alias);
            symlinkSync(B, alias);
          },
        },
      });
      expect(res.code, res.err).toBe(2);
      expect(readFileSync(path.join(B, "same.md")).equals(OLD)).toBe(true);
      expect(readdirSync(B)).toEqual(["same.md"]);
      expect(readdirSync(A)).toEqual([]);
    });
  }

  it("a parent that changes during the write without a collision (link to another empty directory): exit 2, nothing written", async () => {
    const r = repo();
    const A = path.join(r.dir, "A");
    const C = path.join(r.dir, "C");
    const alias = path.join(r.dir, "alias");
    mkdirSync(A);
    mkdirSync(C);
    symlinkSync(A, alias);
    const res = await run(r, {
      output: path.join(alias, "packet.md"),
      zip: true,
      writeHooks: {
        beforeStep: (s) => {
          if (s !== "check:same-target") return;
          unlinkSync(alias);
          symlinkSync(C, alias);
        },
      },
    });
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/changed during the write/);
    expect(readdirSync(A)).toEqual([]);
    expect(readdirSync(C)).toEqual([]);
  });
});
