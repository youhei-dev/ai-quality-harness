/**
 * M2-1-R3-003 (Medium, fixed in M2-2; ADR-0015): artifacts/verification/latest.json that was not valid JSON was
 * reported as "not valid JSON" (exit 2) before its text was checked, so a secret shape or a raw character in it
 * was hidden. Found with it: valid JSON of another shape (null, checks that are not an array of objects) threw an
 * internal error (no JSON for --json, "VERIFY ERROR"), and a latest.json that could not be read was reported as
 * "write failed".
 *  - not JSON, or not the shape that is rendered for <to>: the whole text is checked (a finding: exit 1), then the
 *    reason is a deferred error (exit 2 only without findings); the shape is checked with zod only when the
 *    report is rendered as the result of <to>; anything else stays "No verify result for <to>"
 *  - cannot be read: an inspection error, "cannot read artifacts/verification/latest.json" (exit 2, findings listed)
 * Secret shapes, forbidden characters and invalid bytes are built at run time.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const SOURCE = "verification (artifacts/verification/latest.json)";

interface Repo {
  dir: string;
  base: string;
  to: string;
}

/** A repository with one commit after base; `content` (with `<TO>` replaced by the HEAD SHA) becomes latest.json. */
function repo(latest: string | Buffer | "directory", changed?: string): Repo {
  const t = makeTempDir("aiqh-r3-003-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(t.dir, "a.ts"), "export const a = 1;\n");
  git("add", "--", "a.ts");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  if (changed !== undefined) {
    writeFileSync(path.join(t.dir, "b.ts"), changed);
    git("add", "--", "b.ts");
  }
  git("commit", "-q", "--allow-empty", "-m", "x");
  const to = git("rev-parse", "HEAD").trim();
  const dir = path.join(t.dir, "artifacts", "verification");
  mkdirSync(dir, { recursive: true });
  if (latest === "directory") mkdirSync(path.join(dir, "latest.json"));
  else writeFileSync(path.join(dir, "latest.json"), typeof latest === "string" ? latest.split("<TO>").join(to) : latest);
  return { dir: t.dir, base, to };
}

async function run(r: Repo, json = false): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runReviewPacket({ cwd: r.dir, range: `${r.base}..HEAD`, label: "p", json, toolVersion: "t", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, out: lines.join("\n") };
}

const written = (r: Repo): boolean => existsSync(path.join(r.dir, "artifacts", "ai-review"));
const packet = (r: Repo): string => readFileSync(path.join(r.dir, "artifacts", "ai-review", "review-packet-p.md"), "utf8");
const forTo = (fields: string): string => `{"git":{"commit":"<TO>","dirty":false},${fields}}`;

describe("M2-1-R3-003: malformed latest.json is checked as text", () => {
  it("a secret shape in latest.json that is not JSON: exit 1, never shown", async () => {
    const r = repo(`{ "verdict": "${SECRET()}", broken`);
    const res = await run(r);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain(`[secret] ${SOURCE}:1 aws`);
    expect(res.out).not.toContain(SECRET());
    expect(written(r)).toBe(false);
  });

  for (const [cp, name] of [
    [0x2028, "U+2028"],
    [0x202e, "U+202E"],
    [0x0d, "U+000D"],
  ] as const) {
    it(`a raw ${name} in latest.json that is not JSON: exit 1`, async () => {
      const r = repo(`{ "note": "a${ch(cp)}b", broken`);
      const res = await run(r);
      expect(res.code, res.out).toBe(1);
      expect(res.out).toContain(`[raw-char] ${SOURCE}:1 ${name}`);
      expect(written(r)).toBe(false);
    });
  }

  it("a BOM before otherwise valid JSON (JSON.parse rejects it): exit 1 (U+FEFF)", async () => {
    const r = repo(`${ch(0xfeff)}${forTo('"verdict":"PASSED"')}`);
    const res = await run(r);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain(`[raw-char] ${SOURCE}:1 U+FEFF`);
  });

  it("clean text that is not JSON stays exit 2 (not valid JSON)", async () => {
    const r = repo('{ "verdict": "PASSED", broken');
    const res = await run(r);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("artifacts/verification/latest.json is not valid JSON");
  });

  it("invalid UTF-8 stays exit 1 (decoded strictly first)", async () => {
    const r = repo(Buffer.concat([Buffer.from('{ "a": "'), Buffer.from([0xff]), Buffer.from('", broken')]));
    const res = await run(r);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain(`[invalid-utf8] ${SOURCE}:1`);
  });
});

describe("M2-1-R3-003: the shape of the result of <to>", () => {
  for (const [what, fields] of [
    ["checks that are not an array", '"verdict":"PASSED","checks":5'],
    ["a check that is null", '"verdict":"PASSED","checks":[null]'],
  ] as const) {
    it(`${what}: exit 2 with the reason, also as JSON`, async () => {
      const r = repo(forTo(fields));
      const res = await run(r, true);
      expect(res.code, res.out).toBe(2);
      const j = JSON.parse(res.out) as { result: string; error: string };
      expect(j.result).toBe("error");
      expect(j.error).toContain("artifacts/verification/latest.json does not have the shape of a verify result");
    });
  }

  it("another shape with a raw character in its text: exit 1 (the whole text is checked)", async () => {
    const r = repo(forTo(`"verdict":"a${ch(0x2028)}b","checks":5`));
    const res = await run(r);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain(`[raw-char] ${SOURCE}:1 U+2028`);
  });

  it("latest.json that is null: no verify result for <to> (as for any other non-report)", async () => {
    const r = repo("null");
    const res = await run(r);
    expect(res.code, res.out).toBe(0);
    expect(packet(r)).toContain("No verify result for <to>: latest.json is for commit unknown with dirty = null");
  });

  it("latest.json that is null + a secret in a changed file: exit 1 (no internal error)", async () => {
    const r = repo("null", `export const k = "${SECRET()}";\n`);
    const res = await run(r);
    expect(res.code, res.out).toBe(1);
    expect(res.out).toMatch(/\[secret\] full source b\.ts:1 aws/);
  });

  it("a number, or git null: no verify result for <to> (unchanged)", async () => {
    for (const latest of ["42", '{"git":null,"verdict":"PASSED"}']) {
      const r = repo(latest);
      const res = await run(r);
      expect(res.code, `${latest}: ${res.out}`).toBe(0);
      expect(packet(r)).toContain("No verify result for <to>");
    }
  });

  it("a raw character in a value that is not rendered (a check's output) stays out of scope: written (unchanged)", async () => {
    const r = repo(forTo(`"verdict":"PASSED","exitCode":0,"checks":[{"name":"c","kind":"custom","required":true,"status":"PASS","exitCode":0,"durationMs":1,"stdoutTail":"a${ch(0x2028)}b"}]`));
    const res = await run(r);
    expect(res.code, res.out).toBe(0);
    expect(packet(r)).toContain("Verdict: `PASSED`");
  });
});

describe("M2-1-R3-003: latest.json that cannot be read", () => {
  it("is an inspection error: cannot read (exit 2), not a write failure", async () => {
    const r = repo("directory");
    const res = await run(r);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EISDIR");
    expect(res.out).not.toContain("write failed");
  });

  it("with a finding: exit 2, the finding listed as incomplete", async () => {
    const r = repo("directory", `export const k = "${SECRET()}";\n`);
    const res = await run(r);
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("cannot read artifacts/verification/latest.json: EISDIR");
    expect(res.out).toMatch(/incomplete/);
    expect(res.out).toMatch(/\[secret\] full source b\.ts:1 aws/);
  });
});
