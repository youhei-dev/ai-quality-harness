/**
 * v0.8.0 (ADR-0028, Q2): the oversized candidates and what `security.allow` suppressed were shown only in the terminal output of
 * `aiqh security-scan`. verify now reads that output (the parser `aiqh-security-scan`) into the check's `parsed` field: the counts of
 * the findings line, and the entries by kind. The input here is the real text of runSecurityScan (the same renderer), so a change of
 * its format breaks this test first. The exit code of the scan and the verdict are not changed (an oversized candidate is still a
 * finding: exit 1, FAIL).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSecurityScan } from "../src/commands/security-scan.ts";
import { runVerify } from "../src/commands/verify.ts";
import { summaryText } from "../src/parse/describe.ts";
import { parseOutputAs } from "../src/parse/read.ts";
import { LineAssembler } from "../src/security/scan.ts";
import type { VerificationReport } from "../src/types.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "src", "cli.ts");
const ANT = fake("sk-ant-", "api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef");

/** Where the first window of a newline-free file ends when read in 64 KiB chunks (as in regression-m2-0-001). */
function firstWindowEnd(): number {
  let end = 0;
  const a = new LineAssembler((line) => {
    if (end === 0) end = line.length;
  });
  for (let i = 0; i < 8 && end === 0; i += 1) a.push("-".repeat(64 * 1024));
  return end;
}

function repo(): string {
  const t = makeTempDir("aiqh-parse-sec-");
  cleanups.push(t.cleanup);
  const files: Record<string, string> = {
    ".gitignore": ".env\n.env.*\nartifacts/\n",
    "tests/test_a.py": `KEY = "${ANT}"\n`,
    "cand.txt": `${"-".repeat(firstWindowEnd() - 100)}https://${fake("user:", "q".repeat(70 * 1024))}${"-".repeat(200_000)}`,
  };
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(t.dir, rel)), { recursive: true });
    writeFileSync(path.join(t.dir, rel), content);
  }
  const config = {
    version: 1,
    project: { name: "sec" },
    checks: [{ name: "security", kind: "security", command: `node "${CLI}" security-scan` }],
    security: {
      allow: [
        { path: "tests/**", category: "anthropic", reason: "synthetic test keys built at run time" },
        { path: "docs/**", reason: "never matches" },
        { path: "other/**", reason: "old rule", expires: "2020-01-01" },
      ],
    },
  };
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify(config));
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  execFileSync("git", ["add", "--", ...Object.keys(files), "aiqh.config.jsonc"], { cwd: t.dir });
  return t.dir;
}

async function scanText(cwd: string): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await runSecurityScan({ cwd, log: (l) => lines.push(l), logError: (l) => lines.push(l) });
  return { code, text: `${lines.join("\n")}\n` };
}

const SECURITY_ZERO = { findings: 0, secretShaped: 0, oversizedCandidates: 0, trackedEnv: 0, untrackedEnv: 0, gitignore: 0, rawChars: 0, suppressed: 0, allowRulesUsed: 0, expiredAllowRules: 0, unusedAllowRules: 0 };

describe("the security-scan output as verify reads it", () => {
  it("the oversized candidate, the suppressed finding and the allow rules (used, expired, unused) become counts and entries", async () => {
    const dir = repo();
    const { code, text } = await scanText(dir);
    expect(code).toBe(1);
    const r = parseOutputAs("aiqh-security-scan", { stdout: text, stderr: "", exitCode: code, stdoutTruncated: false, stderrTruncated: false });
    expect(r.status).toBe("parsed");
    expect(r.counts).toEqual({ ...SECURITY_ZERO, findings: 1, oversizedCandidates: 1, suppressed: 1, allowRulesUsed: 1, expiredAllowRules: 1, unusedAllowRules: 1 });
    expect(r.items.map((i) => i.kind)).toEqual(["oversized-candidate", "allowed", "allow-rule-used", "expired-allow-rule", "unused-allow-rule"]);
    expect(r.items[0]?.name).toBe("cand.txt:1 url-credential — url-credential candidate longer than maxCarryBytes could not be scanned completely");
    expect(r.items[1]?.name).toBe("tests/test_a.py:1 anthropic by rule #1");
    expect(r.items[2]?.name).toBe("1×: #1 path=tests/** category=anthropic — synthetic test keys built at run time");
    expect(r.items[3]?.name).toBe("#3 path=other/** expires=2020-01-01 — old rule");
    expect(r.items[4]?.name).toBe("#2 path=docs/** — never matches");
    expect(JSON.stringify(r)).not.toContain(ANT);
  });
  it("the self verify's security output: no findings, no entries", () => {
    const stdout = readFileSync(path.join(ROOT, "tests", "fixtures", "parse", "security-self.stdout.txt"), "utf8");
    expect(parseOutputAs("aiqh-security-scan", { stdout, stderr: "", exitCode: 0, stdoutTruncated: false, stderrTruncated: false })).toEqual({ tool: "aiqh-security-scan", status: "parsed", reason: null, truncated: false, counts: SECURITY_ZERO, items: [], itemsOmitted: 0 });
  });
  it.each([
    ["no header (another tool, or an error before the scan)", "findings: 0 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 0)\n\nSECURITY SCAN: no findings\n", "no-summary"],
    ["the JSON output (--json)", '{ "root": "/w", "findings": [] }\n', "no-summary"],
    ["kinds that do not add up", "aiqh security-scan — /w\nfindings: 2 (secret-shaped: 1, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 0)\n\nSECURITY SCAN: findings present (see above)\n", "unexpected-summary"],
    ["a last line that does not match the findings", "aiqh security-scan — /w\nfindings: 0 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 0)\n\nSECURITY SCAN: findings present (see above)\n", "unexpected-summary"],
    ["no last line", "aiqh security-scan — /w\nfindings: 0 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0, raw characters: 0)\n", "no-summary"],
  ])("%s: unparsed (%s)", (_name, stdout, reason) => {
    expect(parseOutputAs("aiqh-security-scan", { stdout, stderr: "", exitCode: 1, stdoutTruncated: false, stderrTruncated: false })).toMatchObject({ status: "unparsed", reason });
  });
});

describe("verify with a security check: the entries in the report, the result unchanged", () => {
  it("the check is FAIL (exit 1 of the scan) with or without the parser; the report carries the oversized candidate and the allow entries", async () => {
    const dir = repo();
    const lines: string[] = [];
    const code = await runVerify({ cwd: dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    const report = JSON.parse(readFileSync(path.join(dir, "artifacts", "verification", "latest.json"), "utf8")) as VerificationReport;
    expect(code).toBe(1);
    expect(report.verdict).toBe("FAILED");
    const check = report.checks[0];
    expect(check?.status).toBe("FAIL");
    expect(check?.exitCode).toBe(1);
    expect(check?.parsed?.tool).toBe("aiqh-security-scan");
    expect(check?.parsed?.counts).toMatchObject({ findings: 1, oversizedCandidates: 1, suppressed: 1 });
    expect(check?.parsed?.items.map((i) => i.kind)).toEqual(["oversized-candidate", "allowed", "allow-rule-used", "expired-allow-rule", "unused-allow-rule"]);
    expect(lines).toContain("      parsed: aiqh-security-scan — findings 1 (secret-shaped 0, oversized candidates 1, tracked .env 0, untracked .env not ignored 0, .gitignore 0, raw characters 0); suppressed by security.allow 1; allow rules used 1, expired 1, unused 1");
    const md = readFileSync(path.join(dir, "artifacts", "verification", "latest.md"), "utf8");
    expect(md).toContain("- oversized-candidate: cand.txt:1 url-credential");
    expect(`${lines.join("\n")}${md}${JSON.stringify(report)}`).not.toContain(ANT);
  });
});

describe("item 48 (v0.13.0, ADR-0036): raw characters in the security-scan output", () => {
  it("T10: six kinds on the findings line (rawChars) and the raw-char entries are read, the parsed line says raw characters N; five kinds are an unexpected summary", async () => {
    const t = makeTempDir("aiqh-parse-raw-");
    cleanups.push(t.cleanup);
    writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
    writeFileSync(path.join(t.dir, "a.ts"), `const a = "x${String.fromCodePoint(0x202e)}y";\n`);
    execFileSync("git", ["init", "-q"], { cwd: t.dir });
    execFileSync("git", ["add", "--", ".gitignore", "a.ts"], { cwd: t.dir });
    const { code, text } = await scanText(t.dir);
    expect(code).toBe(1);
    const r = parseOutputAs("aiqh-security-scan", { stdout: text, stderr: "", exitCode: code, stdoutTruncated: false, stderrTruncated: false });
    expect(r.status).toBe("parsed");
    expect(r.counts).toEqual({ ...SECURITY_ZERO, findings: 1, rawChars: 1 });
    expect(r.items).toEqual([{ kind: "raw-char", name: "a.ts:1 U+202E bidi-control" }]);
    expect(summaryText(r)).toBe(
      "findings 1 (secret-shaped 0, oversized candidates 0, tracked .env 0, untracked .env not ignored 0, .gitignore 0, raw characters 1); suppressed by security.allow 0; allow rules used 0, expired 0, unused 0",
    );
    const five = "aiqh security-scan — /w\nfindings: 0 (secret-shaped: 0, oversized candidates: 0, tracked .env: 0, untracked .env not ignored: 0, .gitignore: 0)\n\nSECURITY SCAN: no findings\n";
    expect(parseOutputAs("aiqh-security-scan", { stdout: five, stderr: "", exitCode: 0, stdoutTruncated: false, stderrTruncated: false })).toMatchObject({ status: "unparsed", reason: "unexpected-summary" });
  });

  it("T14: the self verify's security output (the fixture, taken again with v0.13.0) says raw characters: 0 and is parsed", () => {
    const stdout = readFileSync(path.join(ROOT, "tests", "fixtures", "parse", "security-self.stdout.txt"), "utf8");
    expect(stdout).toContain(", .gitignore: 0, raw characters: 0)");
    expect(stdout).toContain("\nraw characters checked: bidi-control (U+202A-U+202E, U+2066-U+2069), line-separator (U+2028, U+2029)\n");
    expect(parseOutputAs("aiqh-security-scan", { stdout, stderr: "", exitCode: 0, stdoutTruncated: false, stderrTruncated: false })).toMatchObject({ status: "parsed", counts: { rawChars: 0 } });
  });
});
