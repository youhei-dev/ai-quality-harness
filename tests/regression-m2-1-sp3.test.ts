/**
 * M2-1 stop point 3 decisions (v0.4.0, commit 5):
 *  #1 a finding in a diff shows the diff line and the file line — `diff a.ts:7 (a.ts:1)`, or
 *     `(a.ts@from:5)` for a removed line that exists only in <from>;
 *  #5 with --cwd, the default config is the one in the --cwd directory, never the process's
 *     current directory (an allow list from another repository would be fail open);
 *  #6 excluded files get a blob SHA-256 in the Integrity table (content still neither checked nor shown).
 * Secret-shaped values are assembled at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
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

const SECRET = (): string => fake("AKIA", "ZXCVBNMLKJHGFDSA");

function repo(files: Record<string, string>): { dir: string; base: string; commit: (msg: string, f: Record<string, string | null>) => void } {
  const t = makeTempDir("aiqh-sp3-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  const commit = (msg: string, f: Record<string, string | null>): void => {
    for (const [rel, content] of Object.entries(f)) {
      if (content === null) git("rm", "-q", "--", rel);
      else {
        mkdirSync(path.dirname(path.join(t.dir, rel)), { recursive: true });
        writeFileSync(path.join(t.dir, rel), content);
        git("add", "--", rel);
      }
    }
    git("commit", "-q", "--allow-empty", "-m", msg);
  };
  commit("base", files);
  return { dir: t.dir, base: git("rev-parse", "HEAD").trim(), commit };
}

async function run(cwd: string, range: string, extra: { exclude?: string[] } = {}): Promise<{ code: number; err: string }> {
  const err: string[] = [];
  const code = await runReviewPacket({ cwd, range, label: "sp3", toolVersion: "t", today: "2026-09-23", ...extra, log: () => {}, logError: (l) => err.push(l) });
  return { code, err: err.join("\n") };
}

describe("M2-1 SP3 #1: diff findings show the file line too", () => {
  it("an added line: `diff <path>:<diff line> (<path>:<file line>)`", async () => {
    const r = repo({ "a.ts": "export const a = 1;\n" });
    r.commit("key", { "a.ts": `export const a = 1;\nexport const k = "${SECRET()}";\n` });
    const res = await run(r.dir, `${r.base}..HEAD`);
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/\[secret\] full source a\.ts:2 aws \(input\)/);
    expect(res.err).toMatch(/\[secret\] diff a\.ts:\d+ \(a\.ts:2\) aws \(input\)/);
    expect(res.err).not.toContain("ZXCVBNMLKJHGFDSA");
  });

  it("a removed line that exists only in <from>: `(<path>@from:<line>)`", async () => {
    const r = repo({ "old.ts": `export const k = "${SECRET()}";\nexport const x = 1;\n` });
    r.commit("remove", { "old.ts": null });
    const res = await run(r.dir, `${r.base}..HEAD`);
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/\[secret\] diff old\.ts:\d+ \(old\.ts@from:1\) aws \(input\)/);
  });

  it("a raw character in a diff line gets the file line as well", async () => {
    const r = repo({ "n.md": "one\n" });
    r.commit("sep", { "n.md": `one\ntwo${String.fromCodePoint(0x2028)}\n` });
    const res = await run(r.dir, `${r.base}..HEAD`);
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/\[raw-char\] diff n\.md:\d+ \(n\.md:2\) U\+2028 \(input\)/);
  });
});

describe("M2-1 SP3 #6: excluded files get a blob SHA-256", () => {
  it("the Integrity row of an excluded file carries the SHA-256 of its blob; its content is not shown", async () => {
    const r = repo({ "keep.ts": "export const a = 1;\n" });
    const content = "vendored content\n";
    r.commit("vendor", { "vendor/v.txt": content });
    const res = await run(r.dir, `${r.base}..HEAD`, { exclude: ["vendor/**"] });
    expect(res.code, res.err).toBe(0);
    const md = readFileSync(path.join(r.dir, "artifacts", "ai-review", "review-packet-sp3.md"), "utf8");
    const expected = execFileSync("shasum", ["-a", "256"], { input: content, encoding: "utf8" }).split(" ")[0];
    expect(md).toContain(`| \`vendor/v.txt\` | ${content.length} | ${expected} |`);
    expect(md).not.toContain("vendored content");
  });
});

describe("M2-1 SP3 #5 (guard): with --cwd the default config comes from the --cwd directory", () => {
  it("an allow-all config in the process's current directory does not suppress a finding in the --cwd repository", () => {
    const here = makeTempDir("aiqh-sp3-here-");
    cleanups.push(here.cleanup);
    writeFileSync(
      path.join(here.dir, "aiqh.config.jsonc"),
      JSON.stringify({ version: 1, project: { name: "other" }, checks: [{ name: "x", kind: "custom", command: "true" }], security: { allow: [{ path: "**", reason: "allow everything (other repository)" }] } }),
    );
    const r = repo({ "a.ts": "export const a = 1;\n" });
    r.commit("key", { "a.ts": `export const k = "${SECRET()}";\n` });
    const cli = (args: string[]): { code: number | null; stderr: string } => {
      const p = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd: here.dir, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
      return { code: p.status, stderr: p.stderr };
    };
    const viaCwd = cli(["--cwd", r.dir, "--range", `${r.base}..HEAD`, "--label", "g"]);
    expect(viaCwd.code, viaCwd.stderr).toBe(1);
    expect(viaCwd.stderr).toMatch(/\[secret\] full source a\.ts:1 aws/);
    // control: the same allow list does suppress it when given explicitly, so the case above is meaningful
    const explicit = cli(["--cwd", r.dir, "--range", `${r.base}..HEAD`, "--label", "g", "--config", path.join(here.dir, "aiqh.config.jsonc")]);
    expect(explicit.code, explicit.stderr).toBe(0);
  });
});
