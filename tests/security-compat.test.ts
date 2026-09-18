/**
 * M1 — R-012: the masker and the security scanner share one pattern definition. A synthetic
 * credential corpus (assembled at runtime) must be masked by maskSecrets AND detected by the
 * scanner for every category flagged scan: true; mask-only categories are masked and reported
 * as unscanned; plain text is untouched and undetected by both.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { scanRepository } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** category -> synthetic samples (value that must disappear, full line) */
const CORPUS: Record<string, Array<{ secret: string; line: string }>> = {
  "private-key": [{ secret: "MIIEfakekey", line: `${fake("-----BEGIN RSA ", "PRIVATE KEY-----")} MIIEfakekey ${fake("-----END RSA ", "PRIVATE KEY-----")}` }],
  "url-credential": [{ secret: "hunter2pass", line: `git clone https://${fake("alice:", "hunter2pass")}@example.invalid/repo.git` }],
  anthropic: [{ secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef", line: `key=${fake("sk-", "ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef")}` }],
  openai: [{ secret: "abcdefghijklmnopqrstuvwxyz012345", line: `OPENAI ${fake("sk-", "proj-abcdefghijklmnopqrstuvwxyz012345")}` }],
  aws: [{ secret: "ABCDEFGHIJKLMNOP", line: `aws_access_key_id = ${fake("AKIA", "ABCDEFGHIJKLMNOP")}` }],
  github: [
    { secret: "abcdefghijklmnopqrstuvwxyz0123456789", line: `token ${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")}` },
    { secret: "abcdefghijklmnopqrstuvwxyz0123456789_ABC", line: `pat ${fake("github_", "pat_abcdefghijklmnopqrstuvwxyz0123456789_ABC")}` },
  ],
  slack: [{ secret: "1234567890-abcdefghijklmnop", line: `SLACK=${fake("xoxb", "-1234567890-abcdefghijklmnop")}` }],
  google: [{ secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678", line: `maps ${fake("AIza", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678")}` }],
  gitlab: [{ secret: "abcdefghijklmnopqrstuvwxyz", line: `GL=${fake("glpat", "-abcdefghijklmnopqrstuvwxyz")}` }],
  jwt: [{ secret: "eyJzdWIiOiIxMjM0NTY3ODkwIn0", line: `jwt ${fake("eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz")}` }],
  // mask-only categories
  bearer: [{ secret: "abcdefghijklmnopqrstuvwxyz0123", line: `Authorization: Bearer ${fake("abcdefghijklm", "nopqrstuvwxyz0123")}` }],
  basic: [{ secret: fake("dXNlcjpw", "YXNz"), line: `Authorization: Basic ${fake("dXNlcjpw", "YXNz")}` }],
  "key-value": [{ secret: "SuperSecretValue1", line: `password=${fake("Super", "SecretValue1")}` }],
};
const PLAIN = [
  "commit 3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39 on main",
  "src/runner/execute.ts:12 error TS2322",
  "Basic auth is used by the dashboard; bearer authentication is optional",
  "https://example.invalid/path?x=1",
];

describe("R-012: one pattern definition for masker and scanner", () => {
  const scanCats = [...new Set(SECRET_PATTERNS.filter((p) => p.scan).map((p) => p.category))];
  const maskOnly = [...new Set(SECRET_PATTERNS.filter((p) => !p.scan).map((p) => p.category))];

  it("the corpus covers every defined category", () => {
    const defined = [...new Set(SECRET_PATTERNS.map((p) => p.category))].sort();
    expect(Object.keys(CORPUS).sort()).toEqual(defined);
    expect(scanCats).toEqual(expect.arrayContaining(["aws", "github", "anthropic", "private-key"]));
    expect(maskOnly.sort()).toEqual(["basic", "bearer", "key-value"]);
    for (const p of SECRET_PATTERNS.filter((q) => !q.scan)) expect(p.scanNote?.length ?? 0).toBeGreaterThan(0);
  });

  it("maskSecrets removes every sample value and emits the category marker", () => {
    for (const [category, samples] of Object.entries(CORPUS)) {
      for (const s of samples) {
        const out = maskSecrets(s.line);
        expect(out, `${category}: ${s.line}`).not.toContain(s.secret);
        expect(out, category).toContain(`[REDACTED:${category}]`);
      }
    }
    for (const p of PLAIN) expect(maskSecrets(p)).toBe(p);
  });

  it("the scanner detects every scan:true sample at the right line, reports mask-only categories as unscanned, and never outputs values", () => {
    const t = makeTempDir("aiqh-compat-");
    cleanups.push(t.cleanup);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    const lines: string[] = [];
    const expected: Array<[string, number]> = [];
    for (const [category, samples] of Object.entries(CORPUS)) {
      for (const s of samples) {
        lines.push(s.line);
        if (scanCats.includes(category)) expected.push([category, lines.length]);
      }
    }
    for (const p of PLAIN) lines.push(p);
    writeFileSync(path.join(t.dir, "corpus.txt"), `${lines.join("\n")}\n`);
    execFileSync("git", ["add", "--", "corpus.txt", ".gitignore"], { cwd: t.dir });

    const r = scanRepository(t.dir);
    const got = r.findings.filter((f) => f.kind === "secret").map((f) => [f.category, f.line] as [string, number]);
    for (const e of expected) expect(got, `expected ${e[0]} at line ${e[1]}`).toContainEqual(e);
    // no false positive on plain lines
    const plainStart = lines.length - PLAIN.length + 1;
    expect(got.filter(([, line]) => line >= plainStart)).toEqual([]);
    // mask-only categories are listed as unscanned, never as findings
    expect(r.unscannedCategories.map((u) => u.category).sort()).toEqual(maskOnly.sort());
    expect(got.map(([c]) => c)).not.toEqual(expect.arrayContaining(maskOnly));
    // the result carries no secret values
    const serialized = JSON.stringify(r);
    for (const samples of Object.values(CORPUS)) for (const s of samples) expect(serialized).not.toContain(s.secret);
  });
});
