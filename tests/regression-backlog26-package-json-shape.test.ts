/**
 * Backlog 26: a package.json that is valid JSON but of the wrong shape. Before, src/adapters/context.ts only asserted the type:
 * `null` and `"scripts": 5` reached a raw TypeError (`aiqh: unexpected error: Cannot read properties of null …`,
 * `Cannot use 'in' operator …`, `VERIFY ERROR (internal error)`), and an array, a string or a number was taken as an empty
 * package.json: a Node project without scripts, accepted silently (exit 0). Now the top level and the "scripts", "dependencies" and
 * "devDependencies" fields, when present, must be JSON objects; anything else is an entry that cannot be examined, like a package.json
 * that is not JSON (backlog 8, O6; ADR-0022): `init` stops with exit 2 before it proposes or writes anything.
 * The well-formed cases are controls: they pass before and after.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExaminationError, buildRepoContext } from "../src/adapters/context.ts";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A repository whose package.json holds exactly `json` (the raw text). `.git` is an empty directory: no git is run. */
function repoWith(json: string): string {
  const t = makeTempDir("aiqh-b26-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, ".git"));
  writeFileSync(path.join(t.dir, "package.json"), json);
  return t.dir;
}

async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => out.push(l), logError: (l) => err.push(l), ...opts });
  return { code, out, err };
}

const NOT_AN_OBJECT: Array<[string, string]> = [
  ["null", "null"],
  ["an array", "[]"],
  ["a string", '"text"'],
  ["a number", "5"],
  ["true", "true"],
];

const FIELD_NOT_AN_OBJECT: Array<[string, string, string]> = [
  ["scripts", "a number", '{ "name": "demo", "scripts": 5 }'],
  ["scripts", "an array", '{ "name": "demo", "scripts": [] }'],
  ["scripts", "a string", '{ "name": "demo", "scripts": "build" }'],
  ["dependencies", "a string", '{ "name": "demo", "dependencies": "ab" }'],
  ["devDependencies", "null", '{ "name": "demo", "devDependencies": null }'],
];

describe("backlog 26: a package.json of the wrong shape cannot be examined (it is not an empty package.json)", () => {
  it.each(NOT_AN_OBJECT)("the top level is %s: an ExaminationError (before: a TypeError or an empty Node project)", (_name, json) => {
    const dir = repoWith(json);
    expect(() => buildRepoContext(dir)).toThrow(ExaminationError);
    expect(() => buildRepoContext(dir)).toThrow(/^package\.json is not a JSON object$/);
  });

  it.each(FIELD_NOT_AN_OBJECT)('"%s" is %s: an ExaminationError', (field, _what, json) => {
    const dir = repoWith(json);
    expect(() => buildRepoContext(dir)).toThrow(ExaminationError);
    expect(() => buildRepoContext(dir)).toThrow(new RegExp(`^package\\.json has a "${field}" field that is not a JSON object$`));
  });

  it("init on a package.json that is null: exit 2, 'cannot audit', no internal error (before: 'unexpected error', a TypeError)", async () => {
    const dir = repoWith("null");
    const r = await init(dir);
    expect(r.code).toBe(2);
    const text = r.err.join("\n");
    expect(text).toMatch(/aiqh init: cannot audit .*: package\.json is not a JSON object/);
    expect(text).not.toMatch(/unexpected error|internal error/);
    expect(r.out).toEqual([]);
  });

  it('init on "scripts": 5: exit 2 before anything is proposed (before: the TypeError of the "in" operator)', async () => {
    const dir = repoWith('{ "name": "demo", "scripts": 5 }');
    const r = await init(dir);
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/package\.json has a "scripts" field that is not a JSON object/);
    expect(r.out).toEqual([]);
  });

  it("init --write on an array: exit 2 and no config is written (before: exit 0, a config for a Node project without scripts)", async () => {
    const dir = repoWith("[]");
    const r = await init(dir, { write: true });
    expect(r.code).toBe(2);
    expect(existsSync(path.join(dir, "aiqh.config.jsonc"))).toBe(false);
  });
});

describe("backlog 26 controls: well-formed package.json files are read as before (pass before and after)", () => {
  it("an empty object: a Node context with no scripts and no dependencies", () => {
    const ctx = buildRepoContext(repoWith("{}"));
    expect(ctx.node?.scripts).toEqual({});
    expect([...(ctx.node?.deps ?? [])]).toEqual([]);
  });

  it("objects in every field: scripts and dependencies are read", () => {
    const ctx = buildRepoContext(repoWith('{ "name": "demo", "scripts": { "lint": "eslint ." }, "dependencies": { "a": "1" }, "devDependencies": { "b": "2" } }'));
    expect(ctx.node?.scripts).toEqual({ lint: "eslint ." });
    expect([...(ctx.node?.deps ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("init on a well-formed package.json: exit 0", async () => {
    const r = await init(repoWith('{ "name": "demo", "scripts": { "lint": "x" } }'));
    expect(r.code).toBe(0);
  });
});
