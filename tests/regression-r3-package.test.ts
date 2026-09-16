/**
 * Regression tests for independent review R3 — R3-003
 * (docs/reviews/m0/independent-review-r3.md). The distribution smoke test must assert that the
 * installed package's bin.aiqh is exactly "dist/cli.js" and that node_modules/.bin/aiqh links to it.
 * The assertion logic lives in scripts/package-smoke-checks.ts so it can be tested with fixtures here.
 */
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBinTarget } from "../scripts/package-smoke-checks.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const PKG = "ai-quality-harness";

/** Build a fake consumer: node_modules/<pkg>/{package.json,dist/cli.js} and node_modules/.bin/aiqh. */
function consumer(opts: { bin: string | Record<string, string>; linkTarget?: string; omitLink?: boolean }): string {
  const t = makeTempDir("aiqh-r3-pkg-");
  cleanups.push(t.cleanup);
  const installed = path.join(t.dir, "node_modules", PKG);
  mkdirSync(path.join(installed, "dist"), { recursive: true });
  mkdirSync(path.join(installed, "bin"), { recursive: true });
  writeFileSync(path.join(installed, "dist", "cli.js"), "#!/usr/bin/env node\n");
  writeFileSync(path.join(installed, "bin", "wrapper.js"), "#!/usr/bin/env node\n");
  writeFileSync(path.join(installed, "package.json"), JSON.stringify({ name: PKG, version: "0.0.0", bin: opts.bin }));
  const binDir = path.join(t.dir, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  if (!opts.omitLink) {
    symlinkSync(opts.linkTarget ?? `../${PKG}/dist/cli.js`, path.join(binDir, "aiqh"));
  }
  return t.dir;
}

describe("R3-003 checkBinTarget", () => {
  it("passes when bin.aiqh is dist/cli.js and .bin/aiqh links to it", () => {
    expect(checkBinTarget(consumer({ bin: { aiqh: "dist/cli.js" } }), PKG, "aiqh", "dist/cli.js")).toEqual([]);
  });

  it("rejects the string form of bin for a command name that differs from the package name", () => {
    // npm semantics: a string "bin" defines one command named after the package, i.e. not "aiqh".
    const problems = checkBinTarget(consumer({ bin: "dist/cli.js" }), PKG, "aiqh", "dist/cli.js");
    expect(problems.some((p) => p.includes("string form"))).toBe(true);
  });

  it("fails when bin points at a different (working) wrapper", () => {
    const problems = checkBinTarget(
      consumer({ bin: { aiqh: "bin/wrapper.js" }, linkTarget: `../${PKG}/bin/wrapper.js` }),
      PKG,
      "aiqh",
      "dist/cli.js",
    );
    expect(problems.some((p) => p.includes("bin.aiqh"))).toBe(true);
  });

  it("fails when .bin/aiqh links somewhere other than dist/cli.js", () => {
    const problems = checkBinTarget(
      consumer({ bin: { aiqh: "dist/cli.js" }, linkTarget: `../${PKG}/bin/wrapper.js` }),
      PKG,
      "aiqh",
      "dist/cli.js",
    );
    expect(problems.some((p) => p.includes(".bin/aiqh"))).toBe(true);
  });

  it("fails when the bin link is missing", () => {
    const problems = checkBinTarget(consumer({ bin: { aiqh: "dist/cli.js" }, omitLink: true }), PKG, "aiqh", "dist/cli.js");
    expect(problems.length).toBeGreaterThan(0);
  });
});
