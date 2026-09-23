/**
 * M2-0-R3-003, widened in M2-1 (v0.4.0): tracked Markdown documents (docs/, CHANGELOG, README, …)
 * must be valid UTF-8 and free of the raw characters of `src/security/raw-chars.ts` — C0 controls
 * except TAB / LF (CR included), DEL, C1, U+2028 / U+2029, the bidirectional controls and U+FEFF.
 * They break table rows or change how text is displayed, and an escape written as text ("\u2028")
 * has turned into the raw character before. Test sources are out of scope (fixtures may contain
 * them on purpose). This file contains none of the forbidden characters.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeUtf8Strict, findRawChars, formatCodePoint } from "../src/security/raw-chars.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("M2-0-R3-003 / M2-1: no raw control, separator or bidi characters in tracked documents", () => {
  it("every tracked .md file outside tests/ is valid UTF-8 without forbidden raw characters", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => f.length > 0 && !f.startsWith("tests/"));
    expect(files.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const f of files) {
      const decoded = decodeUtf8Strict(readFileSync(path.join(ROOT, f)));
      if (!decoded.ok) {
        hits.push(`${f}:${decoded.line} invalid UTF-8`);
        continue;
      }
      for (const h of findRawChars(decoded.text)) hits.push(`${f}:${h.line}:${h.column} ${formatCodePoint(h.codePoint)}`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
