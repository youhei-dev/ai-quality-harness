/**
 * M2-1-R1-002 (High): only the basename of -o / --zip-output was checked, and the resolved path was
 * printed as is, so a forbidden character in a parent directory reached standard output. Now the full
 * resolved paths of -o, --zip-output and --cwd are rejected (exit 2) when they contain a forbidden
 * character, the message names the option and code points only, and every user-derived string printed
 * by review-packet (text and --json) goes through one safe-display function (forbidden characters, LF
 * and TAB as `\u{...}`, then the masker). Forbidden characters are built at run time.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isForbiddenCodePoint } from "../src/security/raw-chars.ts";
import { makeTempDir } from "./helpers.ts";

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

const ch = (cp: number): string => String.fromCodePoint(cp);

/** Forbidden raw characters in the bytes (decoded as UTF-8), as U+XXXX labels. */
function rawIn(buf: Buffer): string[] {
  return [...buf.toString("utf8")].map((c) => c.codePointAt(0) ?? 0).filter(isForbiddenCodePoint).map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
}

function repo(parent?: string): { dir: string; base: string } {
  const t = makeTempDir("aiqh-r1-002-");
  cleanups.push(t.cleanup);
  const dir = parent === undefined ? t.dir : path.join(t.dir, parent);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(path.join(dir, "a.ts"), "export const a = 2;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "change");
  return { dir, base };
}

function cli(cwd: string, args: string[]): { code: number | null; stdout: Buffer; stderr: Buffer } {
  const r = spawnSync(process.execPath, [CLI, "review-packet", ...args], { cwd, encoding: "buffer", timeout: 60_000, killSignal: "SIGKILL" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const CASES = [
  ["U+2028", 0x2028],
  ["U+202E", 0x202e],
  ["CR", 0x0d],
] as const;

describe("M2-1-R1-002: forbidden characters in output paths", () => {
  for (const [name, cp] of CASES) {
    it(`-o and --zip-output with ${name} in a parent directory: exit 2, no raw character in stdout / stderr / JSON, existing files unchanged`, () => {
      const r = repo();
      const bad = path.join(r.dir, `out${ch(cp)}dir`);
      mkdirSync(bad, { recursive: true });
      writeFileSync(path.join(bad, "packet.md"), "OLD PACKET\n");
      writeFileSync(path.join(bad, "p.zip"), "OLD ZIP\n");
      const good = path.join(r.dir, "good");
      mkdirSync(good, { recursive: true });
      writeFileSync(path.join(good, "packet.md"), "OLD GOOD PACKET\n");
      const label = `U\\+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

      const viaOutput = cli(r.dir, ["--range", `${r.base}..HEAD`, "-o", path.join(bad, "packet.md"), "--zip"]);
      expect(viaOutput.code, viaOutput.stderr.toString()).toBe(2);
      expect(viaOutput.stderr.toString("utf8")).toMatch(new RegExp(`--output\\b.*${label}`));
      expect(rawIn(Buffer.concat([viaOutput.stdout, viaOutput.stderr]))).toEqual([]);

      const viaZip = cli(r.dir, ["--range", `${r.base}..HEAD`, "-o", path.join(good, "packet.md"), "--zip-output", path.join(bad, "p.zip")]);
      expect(viaZip.code, viaZip.stderr.toString()).toBe(2);
      expect(viaZip.stderr.toString("utf8")).toMatch(new RegExp(`--zip-output\\b.*${label}`));
      expect(rawIn(Buffer.concat([viaZip.stdout, viaZip.stderr]))).toEqual([]);

      const json = cli(r.dir, ["--range", `${r.base}..HEAD`, "-o", path.join(bad, "packet.md"), "--json"]);
      expect(json.code).toBe(2);
      expect(rawIn(json.stdout)).toEqual([]);
      expect((JSON.parse(json.stdout.toString("utf8")) as { result: string }).result).toBe("error");

      expect(readFileSync(path.join(bad, "packet.md"), "utf8")).toBe("OLD PACKET\n");
      expect(readFileSync(path.join(bad, "p.zip"), "utf8")).toBe("OLD ZIP\n");
      expect(readFileSync(path.join(good, "packet.md"), "utf8")).toBe("OLD GOOD PACKET\n");
    });
  }

  it("--cwd whose path contains U+2028: exit 2, no raw character printed", () => {
    const r = repo(`repo${ch(0x2028)}dir`);
    const res = cli(path.dirname(r.dir), ["--cwd", r.dir, "--range", `${r.base}..HEAD`]);
    expect(res.code, res.stderr.toString()).toBe(2);
    expect(res.stderr.toString("utf8")).toMatch(/--cwd\b.*U\+2028/);
    expect(rawIn(Buffer.concat([res.stdout, res.stderr]))).toEqual([]);
  });

  it("user strings inside error messages (--doc, an unreadable --request) are printed safely", () => {
    const r = repo();
    const doc = cli(r.dir, ["--range", `${r.base}..HEAD`, "--doc", `no${ch(0x2029)}such.md`]);
    expect(doc.code).toBe(2);
    expect(rawIn(Buffer.concat([doc.stdout, doc.stderr]))).toEqual([]);
    expect(doc.stderr.toString("utf8")).toContain("\\u{2029}");
    const req = cli(r.dir, ["--range", `${r.base}..HEAD`, "--request", `missing${ch(0x202e)}.md`, "--json"]);
    expect(req.code).toBe(2);
    expect(rawIn(req.stdout)).toEqual([]);
  });

  it("LF in an output directory is allowed but printed as \\u{A} (one line per message)", () => {
    const r = repo();
    const dir = path.join(r.dir, "two\nlines");
    const res = cli(r.dir, ["--range", `${r.base}..HEAD`, "-o", path.join(dir, "packet.md")]);
    expect(res.code, res.stderr.toString()).toBe(0);
    const out = res.stdout.toString("utf8");
    expect(out).toContain("two\\u{A}lines");
    expect(out.split("\n").filter((l) => l.length > 0)).toHaveLength(3);
  });
});
