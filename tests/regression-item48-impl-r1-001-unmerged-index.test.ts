/**
 * I48-I-R1-001 (implementation review item48-impl R1, Low; v0.13.1): with an unmerged path in the index (stages 1, 2 and 3 of the
 * same path, one file in the work tree), `git ls-files` lists the path once per stage, and the security scan checked the name and
 * read the content once per listed entry. A raw character became three findings, an allow rule was counted three times, and a
 * secret-shaped finding, filesTracked and filesScanned were tripled as well. The scan now keeps each listed path once, in git's
 * order. The verdict did not change (nothing was missed). Every forbidden character is built from its code point, so this file
 * contains none.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatCodePoint } from "../src/security/raw-chars.ts";
import { DEFAULT_SECURITY, scanRepository, type ScanFinding, type ScanResult } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const KEY = (): string => fake("AKIA", "QWERTYUIOPASDFGH");

/**
 * A repository whose index holds `rel` only as an unmerged path: stages 1, 2 and 3 with the blob of `content`, which is also the one
 * file in the work tree (`git update-index --index-info`). No .gitignore and no other file, so `rel` is the only listed path.
 */
function unmerged(rel: string, content: string): string {
  const t = makeTempDir("aiqh-i48i-");
  cleanups.push(t.cleanup);
  const dir = path.join(t.dir, "repo");
  mkdirSync(dir);
  const git = (args: string[], input = ""): string => execFileSync("git", args, { cwd: dir, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
  git(["init", "-q"]);
  writeFileSync(path.join(dir, rel), content);
  const blob = git(["hash-object", "-w", "--", rel]).trim();
  git(["update-index", "-z", "--index-info"], [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\t${rel}\0`).join(""));
  // The condition of the finding: git lists the path once per stage, and not as untracked.
  expect(git(["ls-files", "-z"]).split("\0").filter((f) => f.length > 0)).toEqual([rel, rel, rel]);
  expect(git(["ls-files", "-z", "--others", "--exclude-standard"])).toBe("");
  return dir;
}

const rawOf = (r: ScanResult): ScanFinding[] => r.findings.filter((f) => f.kind === "raw-char");

describe("I48-I-R1-001: an unmerged path (stages 1, 2 and 3) is scanned once", () => {
  it("(1) a raw U+202E on line 1 of the content is one finding", () => {
    const dir = unmerged("a.txt", `x${RLO}\n`);
    const codePoint = formatCodePoint(0x202e);
    expect(rawOf(scanRepository(dir))).toStrictEqual([
      { kind: "raw-char", category: "bidi-control", file: "a.txt", line: 1, endLine: 1, codePoint, message: `raw bidi-control character ${codePoint}` },
    ]);
  });

  it("(2) a U+2066 in the path name is one finding", () => {
    const name = `n${LRI}.txt`;
    const dir = unmerged(name, "plain\n");
    const codePoint = formatCodePoint(0x2066);
    expect(rawOf(scanRepository(dir))).toStrictEqual([{ kind: "raw-char", category: "bidi-control", file: name, codePoint, message: `raw bidi-control character ${codePoint} in the path` }]);
  });

  it("(3) an allow rule that names bidi-control suppresses the finding once, and its count is 1", () => {
    const dir = unmerged("a.txt", `x${RLO}\n`);
    const res = scanRepository(dir, { ...DEFAULT_SECURITY, allow: [{ path: "a.txt", category: "bidi-control", reason: "intended" }] });
    expect(rawOf(res)).toEqual([]);
    expect(res.suppressed.map((s) => [s.kind, s.file, s.line, s.codePoint, s.rule])).toEqual([["raw-char", "a.txt", 1, "U+202E", 0]]);
    expect(res.allowUsage.map((u) => u.count)).toEqual([1]);
    expect(res.unusedAllows).toEqual([]);
  });

  it("(4) a secret-shaped value is one finding, and the path counts once in filesTracked and filesScanned", () => {
    const dir = unmerged("key.ts", `export const k = "${KEY()}";\n`);
    const res = scanRepository(dir);
    expect(res.findings.filter((f) => f.kind === "secret").map((f) => [f.file, f.line])).toEqual([["key.ts", 1]]);
    expect({ filesTracked: res.filesTracked, filesScanned: res.filesScanned }).toEqual({ filesTracked: 1, filesScanned: 1 });
  });
});
