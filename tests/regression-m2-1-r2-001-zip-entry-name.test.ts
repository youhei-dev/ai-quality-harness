/**
 * M2-1-R2-001 (High): the basename of -o was checked only for its ASCII characters and then became the
 * ZIP entry name, which is written twice into the archive (local header and central directory). A
 * secret-shaped basename therefore reached the ZIP without passing the secret scanner. Now the output
 * file name is checked for raw characters and secret shapes before anything is built or written: a
 * finding is exit 1 with the source `output file name` and no value; no packet and no ZIP are written.
 * Secret shapes and forbidden characters are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fake, makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
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

const BODY = "QWERTYUIOPASDFGH";
const SECRET_NAME = (): string => fake("AKIA", BODY);

function repo(): { dir: string; base: string } {
  const t = makeTempDir("aiqh-r2-001-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  git("commit", "-q", "--allow-empty", "-m", "change");
  return { dir: t.dir, base };
}

function cli(cwd: string, args: string[]): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const noFragments = (printed: string): void => {
  expect(printed).not.toContain(BODY);
  expect(printed).not.toContain(SECRET_NAME().slice(0, 8));
};

describe("M2-1-R2-001: the output file name is checked before it becomes the ZIP entry name", () => {
  it("a secret-shaped -o basename with --zip: exit 1 (output file name), no packet, no ZIP, no fragment printed", () => {
    const r = repo();
    const out = path.join(r.dir, "out", `${SECRET_NAME()}.md`);
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "-o", out, "--zip"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] output file name(:1)? aws \(input\)/);
    expect(res.out).toContain("REVIEW PACKET: not written (findings)");
    expect(existsSync(path.join(r.dir, "out")) ? readdirSync(path.join(r.dir, "out")) : []).toEqual([]);
    noFragments(res.out);
  });

  it("the same with --json: result findings, source output file name, no value", () => {
    const r = repo();
    const out = path.join(r.dir, "out", `${SECRET_NAME()}.md`);
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "-o", out, "--zip", "--json"]);
    expect(res.code, res.out).toBe(1);
    const parsed = JSON.parse(res.out) as { result: string; output: string | null; zip: string | null; findings: Array<{ kind: string; source: string; detail: string | null }> };
    expect(parsed.result).toBe("findings");
    expect(parsed.output).toBeNull();
    expect(parsed.zip).toBeNull();
    expect(parsed.findings).toContainEqual(expect.objectContaining({ kind: "secret", source: "output file name", detail: "aws" }));
    noFragments(res.out);
  });

  it("the file name is checked without --zip too (the packet's own name)", () => {
    const r = repo();
    const out = path.join(r.dir, "out", `${SECRET_NAME()}.md`);
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "-o", out]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] output file name/);
    expect(existsSync(out)).toBe(false);
    noFragments(res.out);
  });

  it("a forbidden character in the basename is an output file name finding (exit 1), not shown", () => {
    const r = repo();
    const out = path.join(r.dir, "out", `p${String.fromCodePoint(0x2028)}.md`);
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "-o", out, "--zip"]);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[raw-char\] output file name(:1)? U\+2028/);
    expect(res.out).not.toContain(String.fromCodePoint(0x2028));
    expect(existsSync(path.join(r.dir, "out"))).toBe(false);
  });

  it("control: an ordinary -o basename is the ZIP entry name (exit 0)", () => {
    const r = repo();
    const out = path.join(r.dir, "out", "ordinary-name.md");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "--label", "p", "-o", out, "--zip"]);
    expect(res.code, res.out).toBe(0);
    const zip = readFileSync(path.join(r.dir, "out", "ordinary-name.zip"));
    expect(zip.subarray(30, 30 + zip.readUInt16LE(26)).toString("latin1")).toBe("ordinary-name.md");
  });
});
