/**
 * M2-1-R2-003 (High): the rollback of the two-phase write ignored a failure to remove a newly installed
 * file and still said "the previous files were restored", and a failure to remove a backup after both
 * files were installed turned a written packet into exit 2. The specification (ADR-0014) is now:
 *  - commit point: both the new packet and the new ZIP are in place;
 *  - before it: every rollback action (remove a new file, restore a backup, remove a temporary file) is
 *    run and its failure collected; "the previous files were restored" only when all succeeded, otherwise
 *    every file left behind is listed (safe display) and the exit code is 2;
 *  - after it: a backup that cannot be removed is a warning with its location (standard error and
 *    --json `backupsRetained`), the exit code is 0 and the last line is
 *    `REVIEW PACKET: written (backup files retained)`.
 * Failures are injected through the internal `writeHooks` (steps "commit:install:zip",
 * "rollback:remove:packet", "cleanup:backup:packet").
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

function repo(existing: boolean): { dir: string; base: string; out: string } {
  const t = makeTempDir("aiqh-r2-003-");
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
  if (existing) {
    writeFileSync(path.join(out, "packet.md"), "OLD PACKET\n");
    writeFileSync(path.join(out, "packet.zip"), "OLD ZIP\n");
  }
  return { dir: t.dir, base, out };
}

async function run(r: { dir: string; base: string; out: string }, failAt: string[], extra: Partial<ReviewPacketOptions> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewPacket({
    cwd: r.dir,
    range: `${r.base}..HEAD`,
    toolVersion: "t",
    output: path.join(r.out, "packet.md"),
    zip: true,
    log: (l) => out.push(l),
    logError: (l) => err.push(l),
    writeHooks: {
      beforeStep: (step) => {
        if (failAt.includes(step)) throw new Error(`injected failure at ${step}`);
      },
    },
    ...extra,
  });
  return { code, out, err };
}

const listing = (dir: string): string[] => readdirSync(dir).sort();

describe("M2-1-R2-003: rollback reporting, commit point and retained backups", () => {
  it("before the commit point: installing the ZIP and removing the new packet both fail → exit 2, the packet left behind is listed, no 'restored'", async () => {
    const r = repo(false);
    const res = await run(r, ["commit:install:zip", "rollback:remove:packet"]);
    const err = res.err.join("\n");
    expect(res.code, err).toBe(2);
    expect(err).not.toMatch(/the previous files were restored/);
    expect(err).toMatch(/could not be fully rolled back/);
    expect(err).toContain(`new file left at ${path.join(r.out, "packet.md")}`);
    // the state matches the report: the new packet is there, no ZIP, no temporary files
    expect(listing(r.out)).toEqual(["packet.md"]);
    expect(readFileSync(path.join(r.out, "packet.md"), "utf8")).toMatch(/^# Review Packet/);
    expect(err).toContain("REVIEW PACKET: not written (error)");
  });

  it("before the commit point with every rollback action succeeding: 'the previous files were restored', exit 2", async () => {
    const r = repo(true);
    const res = await run(r, ["commit:install:zip"]);
    const err = res.err.join("\n");
    expect(res.code, err).toBe(2);
    expect(err).toMatch(/the previous files were restored/);
    expect(err).not.toMatch(/left at|kept at/);
    expect(listing(r.out)).toEqual(["packet.md", "packet.zip"]);
    expect(readFileSync(path.join(r.out, "packet.md"), "utf8")).toBe("OLD PACKET\n");
  });

  it("after the commit point: the packet's backup cannot be removed → exit 0, warning with its location, last line 'written (backup files retained)'", async () => {
    const r = repo(true);
    const res = await run(r, ["cleanup:backup:packet"]);
    const err = res.err.join("\n");
    expect(res.code, err).toBe(0);
    const kept = listing(r.out).filter((n) => n.includes(".bak-"));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/^\.packet\.md\.bak-/);
    expect(readFileSync(path.join(r.out, kept[0] ?? ""), "utf8")).toBe("OLD PACKET\n");
    expect(err).toMatch(/warning/i);
    expect(err).toContain(path.join(r.out, kept[0] ?? ""));
    expect(res.out.at(-1)).toBe("REVIEW PACKET: written (backup files retained)");
    // the new files are in place; the ZIP's backup was removed
    expect(readFileSync(path.join(r.out, "packet.md"), "utf8")).toMatch(/^# Review Packet/);
    expect(readFileSync(path.join(r.out, "packet.zip")).readUInt32LE(0)).toBe(0x04034b50);
    expect(listing(r.out).filter((n) => n.startsWith(".packet.zip."))).toEqual([]);
  });

  it("after the commit point with --json: result written, backupsRetained lists the backup", async () => {
    const r = repo(true);
    const res = await run(r, ["cleanup:backup:packet"], { json: true });
    expect(res.code, res.err.join("\n")).toBe(0);
    const parsed = JSON.parse(res.out.join("\n")) as { result: string; backupsRetained: string[] };
    expect(parsed.result).toBe("written");
    const kept = listing(r.out).filter((n) => n.includes(".bak-"));
    expect(parsed.backupsRetained).toEqual([path.join(r.out, kept[0] ?? "")]);
  });

  it("control: a normal write reports no retained backups", async () => {
    const r = repo(true);
    const res = await run(r, [], { json: true });
    expect(res.code).toBe(0);
    expect((JSON.parse(res.out.join("\n")) as { backupsRetained: string[] }).backupsRetained).toEqual([]);
    expect(listing(r.out)).toEqual(["packet.md", "packet.zip"]);
  });
});
