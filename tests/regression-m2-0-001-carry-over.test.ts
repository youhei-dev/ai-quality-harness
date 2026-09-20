/**
 * M2-0 / M1-R3-001: a candidate that starts in one window (anchor found, no complete match) is
 * carried over to the next window, so a token longer than the fixed overlap is still detected;
 * a candidate longer than MAX_CARRY_BYTES becomes an "oversized-candidate" finding (fail closed).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LineAssembler, MAX_CARRY_BYTES, MAX_LINE_BYTES, scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
function repo(name: string, content: string): string {
  const t = makeTempDir("aiqh-m20-001-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  writeFileSync(path.join(t.dir, name), content);
  execFileSync("git", ["add", "--", ".gitignore", name], { cwd: t.dir });
  return t.dir;
}
/** Where the first window of a newline-free file ends when read in 64 KiB chunks. */
function firstWindowEnd(): number {
  let end = 0;
  const a = new LineAssembler((line) => {
    if (end === 0) end = line.length;
  });
  for (let i = 0; i < 8 && end === 0; i += 1) a.push("-".repeat(64 * 1024));
  return end;
}
const secrets = (dir: string) => scanRepository(dir).findings.filter((f) => f.kind === "secret" || f.kind === "oversized-candidate").map((f) => [f.kind, f.category, f.line]);

describe("M2-0 / M1-R3-001: candidate carry-over across windows", () => {
  it("a 5,000+ char url-credential starting 4,500 chars before the window end is detected once", () => {
    const end = firstWindowEnd();
    const cred = `https://${fake("user:", "p".repeat(5000))}@host.invalid`;
    const line = "-".repeat(end - 4500) + cred + "-".repeat(100_000);
    expect(secrets(repo("big.txt", line))).toEqual([["secret", "url-credential", 1]]);
  });
  it("a candidate longer than MAX_CARRY_BYTES becomes an oversized-candidate finding (category and line only)", () => {
    const end = firstWindowEnd();
    const body = "q".repeat(70 * 1024);
    const line = "-".repeat(end - 100) + `https://${fake("user:", body)}` + "-".repeat(200_000); // never closed by "@"
    const r = scanRepository(repo("cand.txt", line));
    const over = r.findings.filter((f) => f.kind === "oversized-candidate");
    expect(over.map((f) => [f.category, f.line])).toEqual([["url-credential", 1]]);
    expect(JSON.stringify(r)).not.toContain(body.slice(0, 64));
  });
  it("LineAssembler never retains more than MAX_LINE_BYTES + MAX_CARRY_BYTES characters", () => {
    const a = new LineAssembler(() => {}, { carryFrom: (w) => ({ start: Math.max(0, w.length - MAX_CARRY_BYTES - 1000), category: "url-credential" }) });
    const chunk = "z".repeat(64 * 1024);
    for (let i = 0; i < 64; i += 1) a.push(chunk);
    a.push("\nend\n");
    a.end();
    expect(a.maxRetained).toBeLessThanOrEqual(MAX_LINE_BYTES + MAX_CARRY_BYTES);
    expect(MAX_CARRY_BYTES).toBeGreaterThanOrEqual(64 * 1024);
  });
});
