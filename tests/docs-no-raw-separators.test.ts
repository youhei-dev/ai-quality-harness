/**
 * M2-0-R3-003: tracked Markdown documents (docs/, CHANGELOG, README, …) must not contain raw
 * U+2028 / U+2029 or C1 control characters (U+0080–U+009F). They break table rows in some viewers,
 * and an escape written as text ("\u2028") has turned into the raw character before. Test sources
 * are out of scope (fixtures may contain them on purpose). The forbidden characters are built from
 * their code points so this file contains none of them.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORBIDDEN = new Set<number>([0x2028, 0x2029, ...Array.from({ length: 0x20 }, (_, i) => 0x80 + i)]);

describe("M2-0-R3-003: no raw line separators or C1 controls in tracked documents", () => {
  it("every tracked .md file outside tests/ is free of U+2028, U+2029 and U+0080–U+009F", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => f.length > 0 && !f.startsWith("tests/"));
    expect(files.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const f of files) {
      const lines = readFileSync(path.join(ROOT, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        const bad = [...line].map((c) => c.codePointAt(0) ?? 0).filter((cp) => FORBIDDEN.has(cp));
        if (bad.length > 0) hits.push(`${f}:${i + 1} ${bad.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}`);
      });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
