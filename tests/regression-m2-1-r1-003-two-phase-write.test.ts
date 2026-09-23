/**
 * M2-1-R1-003 (High): the packet was renamed into place before the ZIP was written, so a ZIP write
 * error (exit 2) could still replace an existing packet. Now both files are written in two phases:
 * prepare (both contents in memory, both temporary files written; failure ⇒ temporary files removed,
 * existing files untouched) and commit (existing files moved to backups, then the new packet and the
 * new ZIP renamed into place; failure ⇒ what was replaced is restored from the backups). If restoring
 * fails, the backup locations are printed and kept. Failures are injected through the internal
 * `writeHooks` argument (not an environment variable).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

function repo(): { dir: string; base: string; out: string } {
  const t = makeTempDir("aiqh-r1-003-");
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
  const out = path.join(t.dir, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "packet.md"), "OLD PACKET\n");
  writeFileSync(path.join(out, "packet.zip"), "OLD ZIP\n");
  return { dir: t.dir, base, out };
}

async function run(r: { dir: string; base: string }, extra: Partial<ReviewPacketOptions>): Promise<{ code: number; err: string }> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, toolVersion: "t", log: () => {}, logError: (l) => err.push(l), ...extra });
  return { code, err: err.join("\n") };
}

const listing = (dir: string): string[] => readdirSync(dir).sort();
const unchanged = (out: string): void => {
  expect(readFileSync(path.join(out, "packet.md"), "utf8")).toBe("OLD PACKET\n");
  expect(readFileSync(path.join(out, "packet.zip"), "utf8")).toBe("OLD ZIP\n");
  expect(listing(out)).toEqual(["packet.md", "packet.zip"]);
};

describe("M2-1-R1-003: packet and ZIP are replaced together or not at all", () => {
  it("(a) the ZIP's parent is a regular file (mkdir fails): exit 2, existing files unchanged, nothing left behind", async () => {
    const r = repo();
    writeFileSync(path.join(r.dir, "blocker"), "a file where a directory is needed\n");
    const res = await run(r, { output: path.join(r.out, "packet.md"), zipOutput: path.join(r.dir, "blocker", "p.zip") });
    expect(res.code, res.err).toBe(2);
    unchanged(r.out);
    expect(readFileSync(path.join(r.dir, "blocker"), "utf8")).toBe("a file where a directory is needed\n");
  });

  it("(b) the ZIP target is an existing directory: exit 2, existing files unchanged, the directory untouched", async () => {
    const r = repo();
    const dirTarget = path.join(r.dir, "zipdir.zip");
    mkdirSync(dirTarget);
    writeFileSync(path.join(dirTarget, "inside.txt"), "keep\n");
    const res = await run(r, { output: path.join(r.out, "packet.md"), zipOutput: dirTarget });
    expect(res.code, res.err).toBe(2);
    unchanged(r.out);
    expect(listing(dirTarget)).toEqual(["inside.txt"]);
    expect(listing(r.dir).filter((n) => n.includes(".tmp-") || n.includes(".bak-"))).toEqual([]);
  });

  it("(c) the second rename of the commit phase fails: the packet is restored from its backup, exit 2", async () => {
    const r = repo();
    const steps: string[] = [];
    const res = await run(r, {
      output: path.join(r.out, "packet.md"),
      zip: true,
      writeHooks: {
        beforeStep: (step) => {
          steps.push(step);
          if (step === "commit:install:zip") throw new Error("injected rename failure");
        },
      },
    });
    expect(res.code, res.err).toBe(2);
    expect(steps).toContain("commit:install:packet");
    expect(steps).toContain("rollback:restore:packet");
    unchanged(r.out);
  });

  it("(d) restoring fails too: exit 2, the backup location is printed (safe display) and the backup is kept", async () => {
    const r = repo();
    const res = await run(r, {
      output: path.join(r.out, "packet.md"),
      zip: true,
      writeHooks: {
        beforeStep: (step) => {
          if (step === "commit:install:zip" || step === "rollback:restore:packet") throw new Error(`injected failure at ${step}`);
        },
      },
    });
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/could not be restored/);
    const kept = listing(r.out).filter((n) => n.includes(".bak-"));
    expect(kept).toHaveLength(1);
    expect(res.err).toContain(kept[0]);
    expect(readFileSync(path.join(r.out, kept[0] ?? ""), "utf8")).toBe("OLD PACKET\n");
    // the ZIP was restored; no temporary files remain
    expect(readFileSync(path.join(r.out, "packet.zip"), "utf8")).toBe("OLD ZIP\n");
    expect(listing(r.out).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("success replaces both existing files and leaves no temporary or backup files", async () => {
    const r = repo();
    const res = await run(r, { output: path.join(r.out, "packet.md"), zip: true });
    expect(res.code, res.err).toBe(0);
    expect(listing(r.out)).toEqual(["packet.md", "packet.zip"]);
    expect(readFileSync(path.join(r.out, "packet.md"), "utf8")).toMatch(/^# Review Packet/);
    expect(readFileSync(path.join(r.out, "packet.zip")).readUInt32LE(0)).toBe(0x04034b50);
  });
});
