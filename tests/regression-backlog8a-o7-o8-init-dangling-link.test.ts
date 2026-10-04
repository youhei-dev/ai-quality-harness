/**
 * Backlog 8 (A group), O7 and O8 (docs/reviews/m2-2/response-r1.md): `aiqh init --write` / `--write-gitignore` wrote through a
 * dangling symbolic link and created the file the link points to, outside the project too, and said "wrote …" with exit 0
 * (existsSync() is false for such a link, so the write looked like a creation). A dangling link is refused before the write:
 * exit 2 in the existing "failed to write …" / "failed to update …" form, nothing created. Only a dangling link is refused:
 * a link to an existing file (the existing "already exists" rule, `--force`, an append to a linked .gitignore) is a control
 * and behaves as before. The cases are in-process (runInit), on a copy of a fixture repository.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { fake, makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos", "node-vite");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
/** A project (copy of the fixture) and a directory outside it, both under one temp dir. */
function project(prefix = "aiqh-b8a-o78-"): { proj: string; outside: string } {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  const proj = path.join(t.dir, "proj");
  const outside = path.join(t.dir, "outside");
  cpSync(FIX, proj, { recursive: true });
  mkdirSync(outside);
  return { proj, outside };
}
async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}) {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}
const DANGLING = /symbolic link whose target does not exist/;

describe("backlog 8 O7: --write does not create the target of a dangling aiqh.config.jsonc link", () => {
  it("a link to a not-yet-created file outside the project: exit 2, the target is not created", async () => {
    const { proj, outside } = project();
    symlinkSync(path.join(outside, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to write .*aiqh\.config\.jsonc: it is a symbolic link whose target does not exist/);
    expect(r.output).not.toMatch(/^wrote /m);
    expect(existsSync(path.join(outside, "future.jsonc"))).toBe(false);
    expect(lstatSync(path.join(proj, "aiqh.config.jsonc")).isSymbolicLink()).toBe(true);
  });

  it("--force does not change that (there is no file to overwrite)", async () => {
    const { proj, outside } = project();
    symlinkSync(path.join(outside, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(DANGLING);
    expect(existsSync(path.join(outside, "future.jsonc"))).toBe(false);
  });

  it("a link to a not-yet-created file inside the project is refused as well", async () => {
    const { proj } = project();
    symlinkSync(path.join(proj, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(existsSync(path.join(proj, "future.jsonc"))).toBe(false);
  });

  it("a link whose target's parent directory does not exist is the same refusal (not the open() error)", async () => {
    const { proj, outside } = project();
    symlinkSync(path.join(outside, "nodir", "x.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(DANGLING);
  });
});

describe("backlog 8 O8: --write-gitignore does not create the target of a dangling .gitignore link", () => {
  it("a link to a not-yet-created file outside the project: exit 2, the target is not created", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"));
    symlinkSync(path.join(outside, "future-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*\.gitignore: it is a symbolic link whose target does not exist/);
    expect(r.output).not.toMatch(/^appended /m);
    expect(existsSync(path.join(outside, "future-gitignore"))).toBe(false);
  });

  it("a link to a not-yet-created file inside the project is refused as well", async () => {
    const { proj } = project();
    rmSync(path.join(proj, ".gitignore"));
    symlinkSync(path.join(proj, "future-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(existsSync(path.join(proj, "future-gitignore"))).toBe(false);
  });

  it("both dangling: each write is refused and reported (the writes are independent, M1-R1-010); nothing is created", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"));
    symlinkSync(path.join(outside, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    symlinkSync(path.join(outside, "future-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { write: true, writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/failed to write .*aiqh\.config\.jsonc/);
    expect(r.output).toMatch(/failed to update .*\.gitignore/);
    expect(existsSync(path.join(outside, "future.jsonc"))).toBe(false);
    expect(existsSync(path.join(outside, "future-gitignore"))).toBe(false);
  });
});

describe("backlog 8 O7 / O8: output boundary", () => {
  it("the refusal carries no raw control character and masks a secret-shaped name in the path", async () => {
    const { proj, outside } = project(`aiqh-b8a-o78-${fake("AKIA", "ABCDEFGHIJKLMNOP")}-`);
    symlinkSync(path.join(outside, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(r.output).not.toContain(fake("AKIA", "ABCDEFGHIJKLMNOP"));
    // eslint-disable-next-line no-control-regex
    expect(r.output).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
  });
});

describe("backlog 8 O7 / O8 controls (pass before and after)", () => {
  it("no link: --write creates aiqh.config.jsonc, --write-gitignore appends the line", async () => {
    const { proj } = project();
    rmSync(path.join(proj, ".gitignore"));
    const r = await init(proj, { write: true, writeGitignore: true });
    expect(r.code).toBe(0);
    expect(existsSync(path.join(proj, "aiqh.config.jsonc"))).toBe(true);
    expect(readFileSync(path.join(proj, ".gitignore"), "utf8")).toBe("artifacts/\n");
  });

  it("without a write flag, a dangling link is only reported by the proposal: exit 0 and nothing is created", async () => {
    const { proj, outside } = project();
    symlinkSync(path.join(outside, "future.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(outside, "future.jsonc"))).toBe(false);
  });

  it("a link to an existing file: --write without --force is the existing 'already exists' refusal", async () => {
    const { proj, outside } = project();
    writeFileSync(path.join(outside, "existing.jsonc"), "{}\n");
    symlinkSync(path.join(outside, "existing.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/already exists/);
    expect(readFileSync(path.join(outside, "existing.jsonc"), "utf8")).toBe("{}\n");
  });

  it("the boundary of the minimal change: only a dangling link is refused (an append through a link to an existing .gitignore still works)", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"));
    writeFileSync(path.join(outside, "existing-gitignore"), "node_modules/\n");
    symlinkSync(path.join(outside, "existing-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(outside, "existing-gitignore"), "utf8")).toBe("node_modules/\nartifacts/\n");
  });

  it("a link loop is still the write's own error (ELOOP), exit 2", async () => {
    const { proj } = project();
    symlinkSync("aiqh.config.jsonc", path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/failed to write .*ELOOP/);
  });
});
