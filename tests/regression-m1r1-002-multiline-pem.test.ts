/**
 * M1-R1-002: a real (multi-line) PEM private key must be detected. The scanner reads line by line,
 * so the private-key category is detected by a BEGIN → END state machine; the finding carries the
 * BEGIN line and the END line, never the key body. A PEM cut off before its END line is still
 * reported (fail closed).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const BODY = ["MIIEfakekeyline1", "MIIEfakekeyline2", "MIIEfakekeyline3"];
function pem(kind: string, body: string[] = BODY, withEnd = true): string {
  const label = kind.length > 0 ? `${kind} ` : "";
  const lines = [fake(`-----BEGIN ${label}`, "PRIVATE KEY-----"), ...body];
  if (withEnd) lines.push(fake(`-----END ${label}`, "PRIVATE KEY-----"));
  return lines.join("\n");
}
function repo(files: Record<string, string>): string {
  const t = makeTempDir("aiqh-r1-002-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  for (const [rel, c] of Object.entries(files)) writeFileSync(path.join(t.dir, rel), c);
  execFileSync("git", ["add", "--", ".gitignore", ...Object.keys(files)], { cwd: t.dir });
  return t.dir;
}

describe("M1-R1-002: multi-line PEM private keys", () => {
  for (const kind of ["RSA", "EC", ""]) {
    it(`detects a ${kind || "plain"} PRIVATE KEY block with start and end lines`, () => {
      const dir = repo({ "key.pem": `# header\n${pem(kind)}\ntrailer\n` });
      const r = scanRepository(dir);
      const keys = r.findings.filter((f) => f.kind === "secret" && f.category === "private-key");
      expect(keys).toHaveLength(1);
      expect(keys[0]?.file).toBe("key.pem");
      expect(keys[0]?.line).toBe(2);
      expect(keys[0]?.endLine).toBe(2 + BODY.length + 1);
      const serialized = JSON.stringify(r);
      for (const b of BODY) expect(serialized).not.toContain(b);
    });
  }

  it("a PEM without its END line (truncated) is still reported, ending at the last line", () => {
    const dir = repo({ "cut.txt": `${pem("RSA", BODY, false)}\n` });
    const keys = scanRepository(dir).findings.filter((f) => f.category === "private-key");
    expect(keys).toHaveLength(1);
    expect(keys[0]?.line).toBe(1);
    expect(keys[0]?.endLine).toBe(1 + BODY.length);
  });

  it("two keys in one file give two findings; the console output shows lines but no body", async () => {
    const dir = repo({ "keys.txt": `${pem("EC")}\n\n${pem("RSA")}\n` });
    const lines: string[] = [];
    const code = await runSecurityScan({ cwd: dir, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(1);
    const out = lines.join("\n");
    expect(out).toMatch(/keys\.txt:1\b/);
    expect(out).toMatch(/keys\.txt:7\b/);
    for (const b of BODY) expect(out).not.toContain(b);
  });
});
