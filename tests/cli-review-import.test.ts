/**
 * `aiqh review-import` through the real CLI (ADR-0026): the command is registered, its usage errors are exit 2 (ADR-0021), a review is
 * imported (exit 0) and a review without the aiqh-findings block writes nothing (exit 2). The behaviour itself is fixed by
 * review-import.test.ts, which calls the command in process.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const FIXTURE = path.resolve(import.meta.dirname, "fixtures", "review-import", "b21-r1.md");

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function repo(): string {
  const t = makeTempDir("aiqh-test-ric-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
  return t.dir;
}

function cli(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("aiqh review-import (real CLI)", () => {
  it("is listed in the help and has its own help (exit 0)", () => {
    const root = repo();
    expect(cli(root, ["--help"]).stdout).toContain("review-import");
    const h = cli(root, ["review-import", "--help"]);
    expect(h.status).toBe(0);
    for (const o of ["--label", "--round", "--id-prefix", "--allow-missing-previous", "--cwd"]) expect(h.stdout).toContain(o);
  });

  it.each([
    ["no review file", ["review-import", "--label", "x", "--round", "1", "--id-prefix", "P"], "missing required argument 'review'"],
    ["no --label", ["review-import", "r.md", "--round", "1", "--id-prefix", "P"], "required option '--label <name>' not specified"],
    ["--round 0", ["review-import", "r.md", "--label", "x", "--round", "0", "--id-prefix", "P"], 'expected a positive integer, got "0"'],
  ])("a usage error (%s) is exit 2, says what is wrong, and writes nothing", (_label, args, says) => {
    const root = repo();
    const r = cli(root, args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(says);
    expect(readdirSync(path.join(root, "docs", "reviews"))).toEqual([]);
  });

  it("imports a review (exit 0) into docs/reviews/<label>/findings-r<N>.json", () => {
    const root = repo();
    const r = cli(root, ["review-import", FIXTURE, "--label", "backlog-21", "--round", "1", "--id-prefix", "B21"]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("REVIEW IMPORT: written");
    expect(existsSync(path.join(root, "docs", "reviews", "backlog-21", "findings-r1.json"))).toBe(true);
  });

  it("a review without the aiqh-findings block is exit 2 and writes nothing", () => {
    const root = repo();
    const review = path.join(root, "r.md");
    writeFileSync(review, "# レビュー\n\n## 指摘\n\n指摘なし。\n\n## 全体の結論\n\n件数: High 0 / Medium 0 / Low 0\n");
    const r = cli(root, ["review-import", review, "--label", "demo", "--round", "1", "--id-prefix", "P"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[block]");
    expect(r.stderr).toContain("REVIEW IMPORT: not written (error)");
    expect(readdirSync(path.join(root, "docs", "reviews"))).toEqual([]);
  });
});
