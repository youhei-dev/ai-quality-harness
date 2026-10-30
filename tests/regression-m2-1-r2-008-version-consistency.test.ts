/**
 * M2-1-R2-008 (Medium): the README's current status still named v0.4.0 after the release of v0.4.1. The
 * version in package.json, the latest version heading of CHANGELOG.md and the version named in the README's
 * "現在の状態" (first line of that section, and the `aiqh review-packet` row of its feature table) must be
 * the same, so a release commit that forgets the README fails the tests. Since v0.17.1 the two root versions of package-lock.json
 * are checked against package.json too (ADR-0008 addendum).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");
const VERSION = /v(\d+\.\d+\.\d+)/;

function readmeStatus(): { first: string | null; row: string | null } {
  const lines = read("README.md").split("\n");
  const start = lines.indexOf("## 現在の状態");
  expect(start, "README.md has a '## 現在の状態' section").toBeGreaterThan(-1);
  const section: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith("## ")) break;
    section.push(l);
  }
  const firstLine = section.find((l) => l.trim().length > 0) ?? "";
  const row = section.find((l) => l.startsWith("| `aiqh review-packet`")) ?? "";
  return { first: VERSION.exec(firstLine)?.[1] ?? null, row: VERSION.exec(row)?.[1] ?? null };
}

describe("M2-1-R2-008: package.json, CHANGELOG and README name the same version", () => {
  it("package.json version = latest CHANGELOG heading = README current status (first line and the review-packet row)", () => {
    const pkg = (JSON.parse(read("package.json")) as { version: string }).version;
    const heading = read("CHANGELOG.md").split("\n").find((l) => /^## v\d/.test(l)) ?? "";
    const changelog = VERSION.exec(heading)?.[1] ?? null;
    const readme = readmeStatus();
    expect({ changelog, readmeFirstLine: readme.first, readmeReviewPacketRow: readme.row }).toEqual({ changelog: pkg, readmeFirstLine: pkg, readmeReviewPacketRow: pkg });
  });

  // v0.17.1 (ADR-0008 addendum, batch3 B3-D-Q9 B and B3-D-Q15 A): the two root "version" fields of package-lock.json are what npm
  // writes, and a release raises them with package.json (npm version <v> --no-git-tag-version); they are not held at 0.5.35 by hand
  it("package-lock.json's two root versions (top level and packages[\"\"]) = package.json version", () => {
    const pkg = (JSON.parse(read("package.json")) as { version: string }).version;
    const lock = JSON.parse(read("package-lock.json")) as { version?: unknown; packages?: Record<string, { version?: unknown }> };
    expect({ lockTopLevel: lock.version, lockRootEntry: lock.packages?.[""]?.version }).toEqual({ lockTopLevel: pkg, lockRootEntry: pkg });
  });
});
