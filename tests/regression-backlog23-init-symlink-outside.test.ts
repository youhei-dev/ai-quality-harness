/**
 * Backlog 23 and N1 (backlog-rest SP1): `aiqh init` wrote through a symbolic link that points outside the project root. With
 * `--write --force` an aiqh.config.jsonc linked to a file of another project was overwritten, with `--write-gitignore` a linked
 * .gitignore outside was appended to, and with `--write-scripts` a linked package.json outside was rewritten (that one needed no
 * `--force`; it was not in the backlog item). Now each of the three write targets is refused when it is a link that resolves outside
 * the root, in the form of the dangling-link refusal (backlog 8, O7 / O8): exit 2, "failed to write …" / "failed to update …", nothing
 * written. A link that resolves inside the root is written through as before (control). The cases are in-process (runInit), on a copy
 * of a fixture repository.
 */
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
function project(): { proj: string; outside: string } {
  const t = makeTempDir("aiqh-b23-");
  cleanups.push(t.cleanup);
  const proj = path.join(t.dir, "proj");
  const outside = path.join(t.dir, "outside");
  cpSync(FIX, proj, { recursive: true });
  mkdirSync(outside);
  return { proj, outside };
}

async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}

const OUTSIDE = /symbolic link to .* outside the project root/;

describe("backlog 23 / N1: a write target that is a link resolving outside the root is refused", () => {
  it("--write --force with aiqh.config.jsonc linked to a file outside: exit 2, the file outside is unchanged (before: overwritten)", async () => {
    const { proj, outside } = project();
    writeFileSync(path.join(outside, "other.jsonc"), "{}\n");
    symlinkSync(path.join(outside, "other.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to write .*aiqh\.config\.jsonc: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "other.jsonc"), "utf8")).toBe("{}\n");
  });

  it("--write-gitignore with .gitignore linked to a file outside: exit 2, the file outside is unchanged (before: appended to)", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"), { force: true });
    writeFileSync(path.join(outside, "shared-gitignore"), "node_modules/\n");
    symlinkSync(path.join(outside, "shared-gitignore"), path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*\.gitignore: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "shared-gitignore"), "utf8")).toBe("node_modules/\n");
  });

  it("--write-scripts with package.json linked to a file outside: exit 2, the file outside is unchanged (before: rewritten, no --force needed)", async () => {
    const { proj, outside } = project();
    const original = readFileSync(path.join(proj, "package.json"), "utf8");
    renameSync(path.join(proj, "package.json"), path.join(outside, "package.json"));
    symlinkSync(path.join(outside, "package.json"), path.join(proj, "package.json"));
    const r = await init(proj, { writeScripts: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/aiqh init: failed to update .*package\.json: it is a symbolic link to .* outside the project root/);
    expect(readFileSync(path.join(outside, "package.json"), "utf8")).toBe(original);
  });

  it("the writes stay independent: a refused config does not stop the .gitignore update (as for O7 / O8)", async () => {
    const { proj, outside } = project();
    rmSync(path.join(proj, ".gitignore"), { force: true });
    writeFileSync(path.join(outside, "other.jsonc"), "{}\n");
    symlinkSync(path.join(outside, "other.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true, writeGitignore: true });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(OUTSIDE);
    expect(readFileSync(path.join(proj, ".gitignore"), "utf8")).toBe("artifacts/\n");
  });
});

describe("backlog 23 controls: a link that resolves inside the root is written through as before (pass before and after)", () => {
  it("--write --force with aiqh.config.jsonc linked to a file inside the project: exit 0, the target inside is written", async () => {
    const { proj } = project();
    mkdirSync(path.join(proj, "config"));
    writeFileSync(path.join(proj, "config", "aiqh.jsonc"), "{}\n");
    symlinkSync(path.join("config", "aiqh.jsonc"), path.join(proj, "aiqh.config.jsonc"));
    const r = await init(proj, { write: true, force: true });
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(proj, "config", "aiqh.jsonc"), "utf8")).toMatch(/"checks"/);
  });

  it("--write-gitignore with .gitignore linked to a file inside the project: exit 0, the line is appended there", async () => {
    const { proj } = project();
    rmSync(path.join(proj, ".gitignore"), { force: true });
    writeFileSync(path.join(proj, "gitignore.shared"), "node_modules/\n");
    symlinkSync("gitignore.shared", path.join(proj, ".gitignore"));
    const r = await init(proj, { writeGitignore: true });
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(proj, "gitignore.shared"), "utf8")).toBe("node_modules/\nartifacts/\n");
  });
});
