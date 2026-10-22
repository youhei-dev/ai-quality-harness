/**
 * Item 43 (v0.13.2): seven test files ended their opening comment with a reference to the project's instructions file for the
 * fake() helper. That file is untracked since v0.8.3 (ADR-0030), so a public reader could not follow the reference; the comments
 * now point to tests/helpers.ts, where fake() is documented. This guard keeps the tracked files of src/, scripts/ and tests/ free
 * of the file's name (case-sensitive; docs/ may still name it as history). The name is assembled at run time, so this file does
 * not contain it. A failure names the file and the line only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const UNTRACKED_DOC = ["CLAUDE", "md"].join(".");

describe("item 43: src/, scripts/ and tests/ do not refer to the untracked instructions file", () => {
  it("no tracked file under src/, scripts/ or tests/ contains its name", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--", "src", "scripts", "tests"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => f.length > 0);
    expect(files.length).toBeGreaterThan(250);
    expect(files).toContain("tests/helpers.ts");
    const hits = files.flatMap((f) =>
      readFileSync(path.join(ROOT, f), "utf8")
        .split("\n")
        .flatMap((line, i) => (line.includes(UNTRACKED_DOC) ? [`${f}:${i + 1}`] : [])),
    );
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
