/**
 * Backlog 8 (B group), P4 (docs/reviews/m2-2/response-r1.md): after a failed write, removeTmps() looked for each temporary file with
 * existsSync(), which is false for a file that cannot be reached, so such a file was neither removed nor named in "temporary file left at"
 * (the error of exit 2 said nothing about a file that was still on disk). rmSync() with `force` ignores only ENOENT: a file that cannot be
 * removed is named. A temporary file that was already renamed into place is no longer a temporary file and is not named.
 * The failure is injected with the internal `writeHooks` of runReviewPacket (as in the other write tests): the hook makes the output
 * directory impossible to traverse and throws. Permission cases are skipped for root. The ordinary failure is a control.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { fake, makeTempDir } from "./helpers.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A repository with two commits and an empty output directory (named `outName`). */
function repo(outName = "out", prefix = "aiqh-b8b-p4-"): { dir: string; out: string } {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  for (const n of [1, 2]) {
    writeFileSync(path.join(t.dir, "a.ts"), `export const a = ${n};\n`);
    git("add", "--", "a.ts");
    git("commit", "-q", "-m", `c${n}`);
  }
  const out = path.join(t.dir, outName);
  mkdirSync(out);
  return { dir: t.dir, out };
}

/** Fail at `step`; with `lock`, the output directory cannot be traversed from then on (restored first on cleanup). */
async function failAt(r: { dir: string; out: string }, step: string, lock: boolean): Promise<{ code: number; err: string; onDisk: string[]; named: string[] }> {
  const err: string[] = [];
  const code = await runReviewPacket({
    cwd: r.dir,
    range: "HEAD~1..HEAD",
    toolVersion: "t",
    output: path.join(r.out, "packet.md"),
    zip: true,
    log: () => {},
    logError: (l) => err.push(l),
    writeHooks: {
      beforeStep: (s) => {
        if (s !== step) return;
        if (lock) {
          chmodSync(r.out, 0o000);
          cleanups.push(() => chmodSync(r.out, 0o755)); // runs before the temp dir is removed (LIFO)
        }
        throw new Error(`injected failure at ${s}`);
      },
    },
  });
  chmodSync(r.out, 0o755);
  const message = err.join("\n");
  const named = [...message.matchAll(/temporary file left at ([^;\n]+)/g)].map((m) => (m[1] ?? "").trim());
  return { code, err: message, onDisk: readdirSync(r.out).filter((n) => n.includes(".tmp-")), named };
}

describe("backlog 8 P4: a temporary file that cannot be reached is named, not taken as absent", () => {
  it.skipIf(isRoot)("prepare phase: the directory becomes unreachable: the file left on disk is named in the error (exit 2)", async () => {
    const r = repo();
    const res = await failAt(r, "prepare:zip", true);
    expect(res.code, res.err).toBe(2);
    expect(res.onDisk).toHaveLength(1); // the packet's temporary file is still there
    expect(res.named).toHaveLength(1);
    expect(path.basename(res.named[0] ?? "")).toBe(res.onDisk[0]);
  });

  it.skipIf(isRoot)("rollback: only the temporary file that is really left is named (the one already renamed into place is not)", async () => {
    const r = repo();
    const res = await failAt(r, "commit:install:zip", true);
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/could not be fully rolled back/);
    expect(res.onDisk).toHaveLength(1); // the ZIP's temporary file
    expect(res.named.map((p) => path.basename(p))).toEqual(res.onDisk);
    expect(res.named.every((p) => existsSync(p))).toBe(true);
  });

  it.skipIf(isRoot)("the message and the names go through the output boundary: a secret-shaped directory name is masked, no raw control character", async () => {
    const r = repo(`out-${fake("AKIA", "ABCDEFGHIJKLMNOP")}`);
    const res = await failAt(r, "prepare:zip", true);
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/temporary file left at/);
    expect(res.err).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    // eslint-disable-next-line no-control-regex
    expect(res.err).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
  });
});

describe("backlog 8 P4 controls (pass before and after)", () => {
  it("an ordinary failure (the directory stays reachable): the temporary file is removed, nothing is named", async () => {
    const r = repo();
    const res = await failAt(r, "prepare:zip", false);
    expect(res.code, res.err).toBe(2);
    expect(res.onDisk).toEqual([]);
    expect(res.named).toEqual([]);
    expect(res.err).toMatch(/write failed before any file was replaced/);
  });

  it("a rollback that works: the previous files are restored and no temporary file is left", async () => {
    const r = repo();
    writeFileSync(path.join(r.out, "packet.md"), "OLD PACKET\n");
    writeFileSync(path.join(r.out, "packet.zip"), "OLD ZIP\n");
    const res = await failAt(r, "commit:install:zip", false);
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/the previous files were restored/);
    expect(res.onDisk).toEqual([]);
    expect(res.named).toEqual([]);
  });
});
