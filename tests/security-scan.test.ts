/**
 * M1 — built-in security scan: tracked + untracked (not ignored) files, secret patterns (no values
 * in the output), tracked .env files, .gitignore coverage, binary skipping, fail-closed exit codes.
 * (M1-R1: untracked files are scanned, no size limit — see the regression-m1r1-* tests.)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { scanRepository, ScanError } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function repo(files: Record<string, string | Buffer>, opts: { track?: string[]; gitignore?: string | null } = {}): string {
  const t = makeTempDir("aiqh-scan-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  if (opts.gitignore !== null) writeFileSync(path.join(t.dir, ".gitignore"), opts.gitignore ?? ".env\n.env.*\n");
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(t.dir, rel)), { recursive: true });
    writeFileSync(path.join(t.dir, rel), content);
  }
  const track = opts.track ?? [...Object.keys(files), ...(opts.gitignore === null ? [] : [".gitignore"])];
  if (track.length > 0) execFileSync("git", ["add", "-f", "--", ...track], { cwd: t.dir });
  return t.dir;
}

const AWS = fake("AKIA", "ABCDEFGHIJKLMNOP");
const GH = fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789");

describe("scanRepository", () => {
  it("finds secret-shaped tokens in tracked files and reports category / file / line only", () => {
    const dir = repo({ "src/config.ts": `export const a = "${AWS}";\nexport const b = 1;\nexport const c = "${GH}";\n`, "README.md": "clean\n" });
    const r = scanRepository(dir);
    const secrets = r.findings.filter((f) => f.kind === "secret");
    expect(secrets.map((f) => [f.category, f.file, f.line])).toEqual([
      ["aws", "src/config.ts", 1],
      ["github", "src/config.ts", 3],
    ]);
    expect(JSON.stringify(r)).not.toContain(AWS);
    expect(JSON.stringify(r)).not.toContain(GH);
    expect(r.filesScanned).toBe(3);
  });

  it("ignores files that git ignores, even when they are present in the work tree", () => {
    const dir = repo({ "tracked.txt": "ok\n" }, { gitignore: ".env\n.env.*\nlocal/\n" });
    mkdirSync(path.join(dir, "local"));
    writeFileSync(path.join(dir, "local", "secrets.txt"), `${AWS}\n`);
    const r = scanRepository(dir);
    expect(r.findings.filter((f) => f.kind === "secret")).toEqual([]);
    expect(r.filesUntracked).toBe(0);
  });

  it("flags tracked .env files but lists example files separately", () => {
    const dir = repo({ ".env": "X=1\n", ".env.production": "Y=2\n", ".env.example": "X=\n" }, { track: [".env", ".env.production", ".env.example", ".gitignore"] });
    const r = scanRepository(dir);
    expect(r.findings.filter((f) => f.kind === "tracked-env").map((f) => f.file).sort()).toEqual([".env", ".env.production"]);
    expect(r.exampleEnvFiles).toEqual([".env.example"]);
  });

  it("flags .gitignore that does not cover .env and .env.*", () => {
    const only = scanRepository(repo({ "a.txt": "x\n" }, { gitignore: ".env\n" }));
    expect(only.findings.filter((f) => f.kind === "gitignore").map((f) => f.message)).toEqual([expect.stringMatching(/\.env\.\*/)]);
    const none = scanRepository(repo({ "a.txt": "x\n" }, { gitignore: "node_modules\n" }));
    expect(none.findings.filter((f) => f.kind === "gitignore")).toHaveLength(2);
    const star = scanRepository(repo({ "a.txt": "x\n" }, { gitignore: ".env*\n" }));
    expect(star.findings.filter((f) => f.kind === "gitignore")).toHaveLength(0);
    const missing = scanRepository(repo({ "a.txt": "x\n" }, { gitignore: null }));
    expect(missing.findings.filter((f) => f.kind === "gitignore").length).toBeGreaterThan(0);
  });

  it("skips binary files (counted, not scanned); large text files are scanned", () => {
    const bin = Buffer.concat([Buffer.from("PNG\0\0\0"), Buffer.from(AWS)]);
    const big = Buffer.alloc(1024 * 1024 + 1, 0x41);
    const dir = repo({ "img.bin": bin, "big.txt": big, "ok.txt": "fine\n" });
    const r = scanRepository(dir);
    expect(r.skippedBinary).toBe(1);
    expect(r.filesScanned).toBe(3);
    expect(r.findings.filter((f) => f.kind === "secret")).toEqual([]);
  });

  it("lists the mask-only categories as unscanned with a reason", () => {
    const r = scanRepository(repo({ "a.txt": "x\n" }));
    const names = r.unscannedCategories.map((u) => u.category).sort();
    expect(names).toEqual(["basic", "bearer", "key-value"]);
    for (const u of r.unscannedCategories) expect(u.reason.length).toBeGreaterThan(0);
  });

  it("ignores aiqh's own canonical markers but still finds a secret that follows one on the same line", () => {
    const marker = "https://[REDACTED:url-credential]@example.invalid/x";
    const dir = repo({
      "report.md": `masked: ${marker}\nmixed: ${marker} and ${AWS}\n`,
    });
    const r = scanRepository(dir);
    const secrets = r.findings.filter((f) => f.kind === "secret").map((f) => [f.category, f.line]);
    expect(secrets).toEqual([["aws", 2]]);
  });

  it("throws ScanError outside a git repository", () => {
    const t = makeTempDir("aiqh-scan-nogit-");
    cleanups.push(t.cleanup);
    expect(() => scanRepository(t.dir)).toThrow(ScanError);
  });
});

describe("runSecurityScan (command)", () => {
  async function run(cwd: string, json = false) {
    const lines: string[] = [];
    const code = await runSecurityScan({ cwd, json, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    return { code, output: lines.join("\n") };
  }
  it("exit 0 on a clean repository and prints the unscanned categories", async () => {
    const r = await run(repo({ "a.txt": "x\n" }));
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/key-value/);
    expect(r.output).toMatch(/not scanned|unscanned|未走査/i);
  });
  it("exit 1 with findings and never prints the matched value", async () => {
    const r = await run(repo({ "k.txt": `${AWS}\n` }));
    expect(r.code).toBe(1);
    expect(r.output).toContain("k.txt:1");
    expect(r.output).toContain("aws");
    expect(r.output).not.toContain(AWS);
  });
  it("exit 2 outside a git repository", async () => {
    const t = makeTempDir("aiqh-scan-nogit-");
    cleanups.push(t.cleanup);
    expect((await run(t.dir)).code).toBe(2);
  });
  it("--json prints a machine-readable result", async () => {
    const r = await run(repo({ "a.txt": "x\n" }), true);
    const parsed = JSON.parse(r.output) as { findings: unknown[]; filesScanned: number };
    expect(parsed.filesScanned).toBe(2);
    expect(parsed.findings).toEqual([]);
  });
});
