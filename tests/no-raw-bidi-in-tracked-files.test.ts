/**
 * v0.11.1: no tracked file — tests/ and fixtures included — may contain the raw characters of
 * `src/security/raw-chars.ts`: the bidirectional controls, the line / paragraph separators, C0 controls
 * except TAB / LF (CR included), DEL, C1 and U+FEFF. v0.11.0 shipped a raw U+202E inside a test string
 * (an escape typed as text became the character), and the self verify did not see it: the security check
 * does not use the raw-character check (ROADMAP item 48). tests/docs-no-raw-separators.test.ts covers the
 * tracked Markdown outside tests/ only. A failure names the file, the line and the code point, never the
 * text of the line. A test that needs such a character builds it from a number (`String.fromCodePoint`).
 * This file contains none of the forbidden characters.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeUtf8Strict, findRawChars, formatCodePoint } from "../src/security/raw-chars.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

/** `<file>:<line> U+XXXX` for each forbidden character in one file's bytes (no column, no text). */
function rawCharLines(file: string, bytes: Uint8Array): string[] {
  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) return [`${file}:${decoded.line} invalid UTF-8`];
  return findRawChars(decoded.text).map((h) => `${file}:${h.line} ${formatCodePoint(h.codePoint)}`);
}

describe("v0.11.1: no raw bidi, separator or control characters in tracked files", () => {
  it("every tracked file is valid UTF-8 without forbidden raw characters", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => f.length > 0);
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain("src/security/raw-chars.ts");
    expect(files).toContain("tests/output-json-within.test.ts");
    const hits = files.flatMap((f) => rawCharLines(f, readFileSync(path.join(ROOT, f))));
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("a hit names the file, the line and the code point only", () => {
    const rlo = String.fromCodePoint(0x202e);
    const ls = String.fromCodePoint(0x2028);
    const ps = String.fromCodePoint(0x2029);
    const text = `first\nvisible words ${rlo} here\nplain\none${ls}two${ps}three\n`;
    const lines = rawCharLines("a/b.ts", new TextEncoder().encode(text));
    expect(lines).toEqual(["a/b.ts:2 U+202E", "a/b.ts:4 U+2028", "a/b.ts:4 U+2029"]);
    expect(lines.join("\n")).not.toMatch(/visible|words|here|one|two|three/);
    expect(rawCharLines("c.bin", Uint8Array.of(0x61, 0x0a, 0xff))).toEqual(["c.bin:2 invalid UTF-8"]);
    expect(rawCharLines("d.ts", new TextEncoder().encode("tab\tand lf\nonly\n"))).toEqual([]);
  });
});
