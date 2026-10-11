/**
 * Independent review R1 of backlog 23, B23-R1-001 (Low; docs/reviews/backlog-23/): the tests of v0.5.37 fixed the three write targets
 * with links that point outside by an absolute path, and the inside controls with links inside a root that is not itself a link. The
 * check compares the final targets (realpath of the root and of the link), so these boundary forms already behave; the tests below keep
 * them from changing if the comparison is ever rewritten (a lexical path, another condition): the root itself is a link, a relative link
 * that climbs out of the root, and two-step links whose final target decides. Case-insensitive file systems are not tested (it depends
 * on the machine). In-process (runInit), on a copy of a fixture repository; no `src/` change goes with these tests.
 */
import { cpSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos", "node-vite");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A project (copy of the fixture) and a directory outside it, both under one temp dir. */
function project(): { base: string; proj: string; outside: string } {
  const t = makeTempDir("aiqh-b23r1-");
  cleanups.push(t.cleanup);
  const proj = path.join(t.dir, "proj");
  const outside = path.join(t.dir, "outside");
  cpSync(FIX, proj, { recursive: true });
  mkdirSync(outside);
  return { base: t.dir, proj, outside };
}

async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}

const OUTSIDE = /symbolic link to .* outside the project root/;

describe("B23-R1-001 (1): the project root itself is a symbolic link", () => {
  it("a write target linked to a file inside the real root is written through (config and .gitignore)", async () => {
    const { base, proj } = project();
    const rootLink = path.join(base, "proj-link");
    symlinkSync(proj, rootLink);
    mkdirSync(path.join(proj, "config"));
    writeFileSync(path.join(proj, "config", "aiqh.jsonc"), "{}\n");
    symlinkSync(path.join("config", "aiqh.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    rmSync(path.join(proj, ".gitignore"), { force: true });
    writeFileSync(path.join(proj, "gitignore.shared"), "node_modules/\n");
    symlinkSync("gitignore.shared", path.join(proj, ".gitignore"));
    const r = await init(rootLink, { write: true, force: true, writeGitignore: true });
    expect(r.code, r.output).toBe(0);
    expect(readFileSync(path.join(proj, "config", "aiqh.jsonc"), "utf8")).toMatch(/"checks"/);
    expect(readFileSync(path.join(proj, "gitignore.shared"), "utf8")).toBe("node_modules/\nartifacts/\n");
  });

  it("a write target linked to a file outside the real root is still refused: exit 2, the file outside is unchanged", async () => {
    const { base, proj, outside } = project();
    const rootLink = path.join(base, "proj-link");
    symlinkSync(proj, rootLink);
    writeFileSync(path.join(outside, "other.jsonc"), "{}\n");
    symlinkSync(path.join(outside, "other.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(rootLink, { write: true, force: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(OUTSIDE);
    expect(readFileSync(path.join(outside, "other.jsonc"), "utf8")).toBe("{}\n");
  });
});

describe("B23-R1-001 (2): a relative link that climbs out of the root (../outside/…)", () => {
  it("aiqh.config.jsonc -> ../outside/other.jsonc with --write --force: exit 2, the file outside is unchanged", async () => {
    const { proj, outside } = project();
    writeFileSync(path.join(outside, "other.jsonc"), "{}\n");
    symlinkSync(path.join("..", "outside", "other.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to write .*aiqh\.config\.jsonc: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "other.jsonc"), "utf8")).toBe("{}\n");
  });

  it(".gitignore -> ../outside/shared-gitignore with --write-gitignore: exit 2, the file outside is unchanged", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"), { force: true });
    writeFileSync(path.join(outside, "shared-gitignore"), "node_modules/\n");
    symlinkSync(path.join("..", "outside", "shared-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*\.gitignore: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "shared-gitignore"), "utf8")).toBe("node_modules/\n");
  });

  it("package.json -> ../outside/package.json with --write-scripts: exit 2, the file outside is unchanged", async () => {
    const { proj, outside } = project();
    const original = readFileSync(path.join(proj, "package.json"), "utf8");
    renameSync(path.join(proj, "package.json"), path.join(outside, "package.json"));
    symlinkSync(path.join("..", "outside", "package.json"), path.join(proj, "package.json"));
    const r = await init(proj, { writeScripts: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*package\.json: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "package.json"), "utf8")).toBe(original);
  });
});

describe("B23-R1-001 (3): two links in a row: the final target decides", () => {
  it("inside link -> inside link -> file outside: exit 2, the file outside is unchanged", async () => {
    const { proj, outside } = project();
    writeFileSync(path.join(outside, "other.jsonc"), "{}\n");
    symlinkSync(path.join(outside, "other.jsonc"), path.join(proj, "hop.jsonc"));
    symlinkSync("hop.jsonc", path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(OUTSIDE);
    expect(readFileSync(path.join(outside, "other.jsonc"), "utf8")).toBe("{}\n");
  });

  it("link -> link outside the root -> file inside: exit 0, the file inside is written and the link outside stays a link", async () => {
    const { proj, outside } = project();
    mkdirSync(path.join(proj, "config"));
    writeFileSync(path.join(proj, "config", "aiqh.jsonc"), "{}\n");
    symlinkSync(path.join(proj, "config", "aiqh.jsonc"), path.join(outside, "hop.jsonc"));
    symlinkSync(path.join("..", "outside", "hop.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code, r.output).toBe(0);
    expect(readFileSync(path.join(proj, "config", "aiqh.jsonc"), "utf8")).toMatch(/"checks"/);
    expect(lstatSync(path.join(outside, "hop.jsonc")).isSymbolicLink()).toBe(true);
  });
});
