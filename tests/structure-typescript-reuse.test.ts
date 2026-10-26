/**
 * Item 50 (v0.15.1; batch2 design, final, §1.6 and §1.8, 50-B): the SourceFiles of `createProgram` (tests/structure/typescript.ts)
 * are reused within a test file's process only when their key is the same, and the answers of the type checker and of the structure
 * guards do not change with the reuse. T50-1 and T50-6 fail without the table (T50-6 first checks that it compares a program with
 * the table and one without); T50-7 fails without the way to switch it off and to see the host; the others guard the cases where
 * nothing may be reused.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";
import { brandGuard } from "./structure/brand-guard.ts";
import { outputViolations } from "./structure/output-guard.ts";
import * as helper from "./structure/typescript.ts";
import { ROOT, createProgram, filesUnder, typeErrors, type Program } from "./structure/typescript.ts";

const CLI = path.join(ROOT, "src", "cli.ts");
const OUTPUT = path.join(ROOT, "src", "output.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

/** A small project in a temporary directory: its tsconfig files (name → compiler options) and its files (name → text; the .ts ones are the root files). */
function project(configs: Record<string, Record<string, unknown>>, files: Record<string, string>): { dir: string; config: (name: string) => string } {
  const { dir, cleanup } = makeTempDir();
  cleanups.push(cleanup);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  for (const [name, compilerOptions] of Object.entries(configs)) {
    writeFileSync(path.join(dir, name), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], lib: ["es2022"], ...compilerOptions }, files: Object.keys(files).filter((f) => f.endsWith(".ts")) }));
  }
  return { dir, config: (name) => path.join(dir, name) };
}
const sourceOf = (p: Program, file: string): ts.SourceFile => {
  const sf = p.program.getSourceFile(file);
  if (sf === undefined) throw new Error(`not in the program: ${file}`);
  return sf;
};
const guards = (p: Program, files: readonly ts.SourceFile[]): string[] => [...outputViolations(p, files).map((v) => v.what), ...brandGuard(p, files).map((v) => v.rule)];

describe("item 50: the SourceFiles of createProgram are reused only under the same key", () => {
  // T50-1 makes the first program of this file (every file parsed): T3, 12 × 4.04 s, the longest in 3 quiet full runs -> 50 s
  it("T50-1: two programs with different fixtures share the SourceFile of a repository file", () => {
    const a = createProgram({ "tests/__fixtures__/reuse/a.ts": "export const a = 1;\n" });
    const b = createProgram({ "tests/__fixtures__/reuse/b.ts": "export const b = 2;\n" });
    expect(sourceOf(b, CLI)).toBe(sourceOf(a, CLI));
  }, 50_000);
  it("T50-2: a file changed on disk is parsed anew, and the next program has the type errors of the new text", () => {
    const { dir, config } = project({ "tsconfig.json": { target: "es2022", module: "esnext" } }, { "a.ts": 'export const x: number = "s";\n' });
    const file = path.join(dir, "a.ts");
    const before = createProgram({}, { configFile: config("tsconfig.json") });
    expect(typeErrors(before, [sourceOf(before, file)])).toHaveLength(1);
    writeFileSync(file, "export const x: number = 1;\n");
    const after = createProgram({}, { configFile: config("tsconfig.json") });
    expect(sourceOf(after, file)).not.toBe(sourceOf(before, file));
    expect(typeErrors(after, [sourceOf(after, file)])).toEqual([]);
    // the SHA-256 of the text is part of the key: the first text written back is the first SourceFile again
    writeFileSync(file, 'export const x: number = "s";\n');
    expect(sourceOf(createProgram({}, { configFile: config("tsconfig.json") }), file)).toBe(sourceOf(before, file));
  });
  it("T50-3: other parse conditions or options (target, jsx) give another SourceFile; the same ones give the same; two files of the same text are two", () => {
    const text = "export const x = 1;\n";
    const { dir, config } = project(
      { "tsconfig.json": { target: "es2022", module: "esnext" }, "same.json": { target: "es2022", module: "esnext" }, "target.json": { target: "es2020", module: "esnext" }, "jsx.json": { target: "es2022", module: "esnext", jsx: "preserve" } },
      { "a.ts": text, "b.ts": text },
    );
    const file = path.join(dir, "a.ts");
    const base = createProgram({}, { configFile: config("tsconfig.json") });
    expect(sourceOf(createProgram({}, { configFile: config("same.json") }), file)).toBe(sourceOf(base, file));
    expect(sourceOf(createProgram({}, { configFile: config("target.json") }), file)).not.toBe(sourceOf(base, file));
    expect(sourceOf(createProgram({}, { configFile: config("jsx.json") }), file)).not.toBe(sourceOf(base, file));
    const other = sourceOf(base, path.join(dir, "b.ts"));
    expect(other).not.toBe(sourceOf(base, file));
    expect(other.fileName).toBe(path.join(dir, "b.ts"));
  });
  it("T50-3b: the same options but another module format of the file (package.json type): another SourceFile", () => {
    const { dir, config } = project({ "tsconfig.json": { target: "es2022", module: "nodenext" } }, { "a.ts": "export const x = 1;\n", "package.json": '{ "type": "commonjs" }\n' });
    const file = path.join(dir, "a.ts");
    const commonjs = sourceOf(createProgram({}, { configFile: config("tsconfig.json") }), file);
    writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }\n');
    const esm = sourceOf(createProgram({}, { configFile: config("tsconfig.json") }), file);
    expect(esm).not.toBe(commonjs);
    expect([commonjs.impliedNodeFormat, esm.impliedNodeFormat]).toEqual([ts.ModuleKind.CommonJS, ts.ModuleKind.ESNext]);
  });
  it("T50-4: a repository file replaced by a fixture: the fixture's text stays in its program, and the next program has the file on disk", () => {
    const disk = readFileSync(OUTPUT, "utf8");
    const plain = createProgram();
    const replaced = createProgram({ "src/output.ts": `${disk}\nexport const broken: number = "x";\n` });
    const next = createProgram();
    expect(sourceOf(replaced, OUTPUT).text).toContain("broken");
    expect(typeErrors(replaced, [sourceOf(replaced, OUTPUT)])).toHaveLength(1);
    expect(sourceOf(next, OUTPUT)).toBe(sourceOf(plain, OUTPUT));
    expect(sourceOf(next, OUTPUT).text).toBe(disk);
    expect(typeErrors(next, [sourceOf(next, OUTPUT)])).toEqual([]);
  });
  it("T50-5: a SourceFile whose text a caller changed is not handed out again (it is parsed anew)", () => {
    const disk = readFileSync(CLI, "utf8");
    const first = createProgram();
    const shared = sourceOf(first, CLI);
    (shared as unknown as { text: string }).text = `${disk} `;
    const next = createProgram();
    expect(sourceOf(next, CLI)).not.toBe(shared);
    expect(sourceOf(next, CLI).text).toBe(disk);
  });
  // T50-6 compares a program over the repository made with the table and one made without it (`reuse: false`). The pair is made once,
  // by the first of the four tests, and every repository file is type-checked in both, in parts: one test of 18 s quietly would need a
  // limit over 200 s by T3. Limits by T3 (max(30 s, 12 × the longer time of 2 quiet full runs, up to a multiple of 10 s)): T50-6a
  // 6.27 s -> 80 s (it makes the pair); T50-6b 1.69 s, T50-6c 2.09 s and T50-6d 1.24 s -> 30 s, the default
  let pair: { withTable: Program; without: Program } | undefined;
  const programs = (): { withTable: Program; without: Program } => {
    if (pair !== undefined) return pair;
    const earlier = createProgram();
    const withTable = createProgram();
    const without = createProgram({}, { reuse: false });
    // the comparison is between a program that reused the SourceFiles and one that did not
    expect(sourceOf(withTable, CLI)).toBe(sourceOf(earlier, CLI));
    expect(sourceOf(without, CLI)).not.toBe(sourceOf(withTable, CLI));
    pair = { withTable, without };
    return pair;
  };
  /** The repository files of `p` under `prefix`, the first or the second half of them by path (`half` 0 or 1), or all of them. */
  const part = (p: Program, prefix: string, half?: 0 | 1): ts.SourceFile[] => {
    const files = filesUnder(p, prefix).sort((a, b) => (a.fileName < b.fileName ? -1 : 1));
    const middle = Math.ceil(files.length / 2);
    return half === undefined ? files : half === 0 ? files.slice(0, middle) : files.slice(middle);
  };
  it("T50-6a: with and without the table, the type errors of src/ and scripts/ and the answers of the guards on src/ are the same", () => {
    const { withTable, without } = programs();
    for (const prefix of ["src/", "scripts/"]) expect(typeErrors(withTable, part(withTable, prefix)), prefix).toEqual(typeErrors(without, part(without, prefix)));
    expect(part(withTable, "src/").map((sf) => withTable.rel(sf))).toEqual(part(without, "src/").map((sf) => without.rel(sf)));
    expect(guards(withTable, part(withTable, "src/"))).toEqual(guards(without, part(without, "src/")));
  }, 80_000);
  it("T50-6b: with and without the table, the type errors of the first half of tests/ are the same", () => {
    const { withTable, without } = programs();
    expect(part(withTable, "tests/", 0).map((sf) => withTable.rel(sf))).toEqual(part(without, "tests/", 0).map((sf) => without.rel(sf)));
    expect(typeErrors(withTable, part(withTable, "tests/", 0))).toEqual(typeErrors(without, part(without, "tests/", 0)));
  });
  it("T50-6c: with and without the table, the type errors of the second half of tests/ are the same", () => {
    const { withTable, without } = programs();
    expect(part(withTable, "tests/", 1).map((sf) => withTable.rel(sf))).toEqual(part(without, "tests/", 1).map((sf) => without.rel(sf)));
    expect(typeErrors(withTable, part(withTable, "tests/", 1))).toEqual(typeErrors(without, part(without, "tests/", 1)));
  });
  it("T50-6d: with and without the table, an edit of a repository file and a source-only fixture that the guards report give the same answers", () => {
    // from tests/regression-m2-2-builtin-r3-allow-branches.test.ts (r1b_console_trace and r3a_optional_param)
    const fixtures = {
      "src/output.ts": readFileSync(OUTPUT, "utf8").replace("if (line) console.log(text);", "if (line) console.trace(text);"),
      "tests/__fixtures__/reuse/r3a_optional_param.ts": `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, x?: T): T | undefined => (x === undefined ? (raw as T) : x);\nexport const f = (): Safe | undefined => cast<Safe>("raw");\n`,
    };
    const edited = createProgram(fixtures);
    const editedWithout = createProgram(fixtures, { reuse: false });
    const answers = (p: Program) =>
      ["src/output.ts", "tests/__fixtures__/reuse/r3a_optional_param.ts"].map((rel) => {
        const files = filesUnder(p, rel);
        return { rel, typeErrors: typeErrors(p, files), guards: guards(p, files) };
      });
    expect(answers(edited)).toEqual(answers(editedWithout));
    expect(answers(edited).map((a) => a.guards.length > 0)).toEqual([true, true]);
  });
  it("T50-7: nothing is reused for shouldCreateNewSourceFile, for a parse condition it does not know, or with reuse: false", () => {
    const { dir, config } = project({ "tsconfig.json": { target: "es2022", module: "esnext" } }, { "a.ts": "export const x = 1;\n" });
    const file = path.join(dir, "a.ts");
    const seen: { host?: ts.CompilerHost; plain?: ts.CompilerHost } = {};
    createProgram({}, { configFile: config("tsconfig.json"), onHost: (h) => {
      seen.host = h;
    } });
    const host = seen.host;
    if (host === undefined) throw new Error("no host");
    const conditions = { languageVersion: ts.ScriptTarget.ES2022 };
    const first = host.getSourceFile(file, conditions);
    expect(first).toBeDefined();
    expect(host.getSourceFile(file, conditions)).toBe(first);
    expect(host.getSourceFile(file, conditions, undefined, true)).not.toBe(first);
    expect(host.getSourceFile(file, { ...conditions, unknownCondition: 1 } as ts.CreateSourceFileOptions)).not.toBe(first);
    // the table still has the SourceFile of the known key
    expect(host.getSourceFile(file, conditions)).toBe(first);
    createProgram({}, { configFile: config("tsconfig.json"), reuse: false, onHost: (h) => {
      seen.plain = h;
    } });
    const plain = seen.plain;
    if (plain === undefined) throw new Error("no host");
    const once = plain.getSourceFile(file, conditions);
    expect(plain.getSourceFile(file, conditions)).not.toBe(once);
    expect(once).not.toBe(first);
  });
});

describe("item 50: the table stays inside tests/structure/typescript.ts (batch2 design, final, §1.6; B2-D-R2-003)", () => {
  it("the module exports these names only (values and types); none of them is the table", () => {
    expect(Object.keys(helper).sort()).toEqual(["ROOT", "createProgram", "filesUnder", "ownerName", "topOwnerName", "typeErrors", "where"]);
    const p = createProgram();
    const sf = sourceOf(p, path.join(ROOT, "tests", "structure", "typescript.ts"));
    const mod = p.checker.getSymbolAtLocation(sf);
    if (mod === undefined) throw new Error("no module symbol");
    expect(p.checker.getExportsOfModule(mod).map((s) => s.name).sort()).toEqual(["Program", "ROOT", "createProgram", "filesUnder", "ownerName", "topOwnerName", "typeErrors", "where"]);
  });
});
