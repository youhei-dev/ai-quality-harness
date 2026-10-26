/**
 * Item 50 (v0.15.1; batch2 design, final, §1.6 and §1.8, 50-B): the SourceFiles of `createProgram` (tests/structure/typescript.ts)
 * are reused within a test file's process only when their key is the same, and the answers of the type checker and of the structure
 * guards do not change with the reuse. T50-1 and T50-6 fail without the table (T50-6 first checks that it compares a program with
 * the table and one without); T50-7 fails without the way to switch it off and to see the host; the others guard the cases where
 * nothing may be reused.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
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

  // v0.16.0 (B2-I151-R1-001): TypeScript also passes setExternalModuleIndicator (always; made from the options) and, where it looks for a
  // package.json, packageJsonLocations and packageJsonScope (written by the program onto the SourceFile after getSourceFile). Each of them
  // is part of the reuse: the locations and the scope (its directory and the SHA-256 of its package.json) in the key, and the indicator
  // by computing it again on the SourceFile to be reused. These tests call the host's getSourceFile directly, so only one value differs.
  type Indicator = (f: ts.SourceFile) => void;
  const asScript: Indicator = (f) => {
    (f as unknown as { externalModuleIndicator?: unknown }).externalModuleIndicator = undefined;
  };
  const asModule: Indicator = (f) => {
    (f as unknown as { externalModuleIndicator?: unknown }).externalModuleIndicator = true;
  };
  /** A host of a small project and the parse conditions TypeScript would pass for its file a.ts (a script), with some values replaced. */
  const conditionsFor = (): { host: ts.CompilerHost; file: string; conditions: (replaced?: Record<string, unknown>) => ts.CreateSourceFileOptions } => {
    const { dir, config } = project({ "tsconfig.json": { target: "es2022", module: "esnext" } }, { "a.ts": "const x = 1;\n" });
    const seen: { host?: ts.CompilerHost } = {};
    createProgram({}, { configFile: config("tsconfig.json"), onHost: (h) => {
      seen.host = h;
    } });
    const host = seen.host;
    if (host === undefined) throw new Error("no host");
    const conditions = (replaced: Record<string, unknown> = {}): ts.CreateSourceFileOptions =>
      ({
        languageVersion: ts.ScriptTarget.ES2022,
        impliedNodeFormat: ts.ModuleKind.CommonJS,
        setExternalModuleIndicator: asScript,
        packageJsonLocations: [path.join(dir, "package.json")],
        packageJsonScope: { packageDirectory: dir, contents: { packageJsonContent: { name: "a" } } },
        ...replaced,
      }) as unknown as ts.CreateSourceFileOptions;
    return { host, file: path.join(dir, "a.ts"), conditions };
  };
  it("T50-8a: only packageJsonLocations differs: another SourceFile; the first stays in the table", () => {
    const { host, file, conditions } = conditionsFor();
    const first = host.getSourceFile(file, conditions());
    expect(host.getSourceFile(file, conditions({ packageJsonLocations: [path.join(path.dirname(file), "sub", "package.json")] }))).not.toBe(first);
    expect(host.getSourceFile(file, conditions())).toBe(first);
  });
  it("T50-8b: only the package.json of packageJsonScope differs: another SourceFile; the first stays in the table", () => {
    const { host, file, conditions } = conditionsFor();
    const first = host.getSourceFile(file, conditions());
    expect(host.getSourceFile(file, conditions({ packageJsonScope: { packageDirectory: path.dirname(file), contents: { packageJsonContent: { name: "b" } } } }))).not.toBe(first);
    expect(host.getSourceFile(file, conditions())).toBe(first);
  });
  it("T50-8c: only setExternalModuleIndicator differs (it makes the script a module): another SourceFile that is a module; the first stays", () => {
    const { host, file, conditions } = conditionsFor();
    const first = host.getSourceFile(file, conditions());
    const other = host.getSourceFile(file, conditions({ setExternalModuleIndicator: asModule }));
    expect(other).not.toBe(first);
    expect([first !== undefined && ts.isExternalModule(first), other !== undefined && ts.isExternalModule(other)]).toEqual([false, true]);
    expect(host.getSourceFile(file, conditions())).toBe(first);
  });
  it("T50-8d: the same values in new objects and a new function with the same effect: the same SourceFile (the reuse is kept)", () => {
    const { host, file, conditions } = conditionsFor();
    const first = host.getSourceFile(file, conditions());
    const same = conditions({
      setExternalModuleIndicator: (f: ts.SourceFile) => asScript(f),
      packageJsonLocations: [path.join(path.dirname(file), "package.json")],
      packageJsonScope: { packageDirectory: path.dirname(file), contents: { packageJsonContent: { name: "a" } } },
    });
    expect(host.getSourceFile(file, same)).toBe(first);
  });
  it("T50-8e: a value of a shape it does not know (locations not a list of strings, a scope without its package.json): not reused", () => {
    const { host, file, conditions } = conditionsFor();
    const first = host.getSourceFile(file, conditions());
    expect(host.getSourceFile(file, conditions({ packageJsonLocations: "package.json" }))).not.toBe(first);
    expect(host.getSourceFile(file, conditions({ packageJsonLocations: [1] }))).not.toBe(first);
    expect(host.getSourceFile(file, conditions({ packageJsonScope: { packageDirectory: path.dirname(file) } }))).not.toBe(first);
    // such a value never enters the table: the same value twice gives two SourceFiles
    const odd = conditions({ packageJsonLocations: "package.json" });
    expect(host.getSourceFile(file, odd)).not.toBe(host.getSourceFile(file, odd));
    const scopeless = conditions({ packageJsonScope: { packageDirectory: path.dirname(file) } });
    expect(host.getSourceFile(file, scopeless)).not.toBe(host.getSourceFile(file, scopeless));
    // (a setExternalModuleIndicator that is not a function is not reused either, but the host's own parse then throws, as TypeScript does)
  });
  it("T50-8f: only whether there is a setExternalModuleIndicator differs (one made the script a module, then none): another SourceFile, a script", () => {
    const { host, file, conditions } = conditionsFor();
    const module = host.getSourceFile(file, conditions({ setExternalModuleIndicator: asModule }));
    const plain = host.getSourceFile(file, conditions({ setExternalModuleIndicator: undefined }));
    expect(plain).not.toBe(module);
    expect([module !== undefined && ts.isExternalModule(module), plain !== undefined && ts.isExternalModule(plain)]).toEqual([true, false]);
  });
  it("T50-8g: with TypeScript's own conditions, a script under node_modules with a package.json of type module is reused by the next program", () => {
    // module esnext: TypeScript looks for the package.json (the file is under node_modules) and the program writes its scope onto the
    // SourceFile; the indicator then reads that scope, which the parse did not see. The check before reuse hides it, so it agrees.
    const { dir, config } = project(
      { "tsconfig.json": { target: "es2022", module: "esnext" } },
      { "a.ts": "export const x = 1;\n", "node_modules/pkg/b.ts": "const y = 1;\n", "node_modules/pkg/package.json": '{ "type": "module" }\n' },
    );
    const b = path.join(dir, "node_modules", "pkg", "b.ts");
    const first = sourceOf(createProgram({}, { configFile: config("tsconfig.json") }), b);
    const scope = (first as unknown as { packageJsonScope?: { packageDirectory: string } }).packageJsonScope;
    expect([first.impliedNodeFormat, scope?.packageDirectory]).toEqual([ts.ModuleKind.ESNext, path.join(dir, "node_modules", "pkg")]);
    expect(sourceOf(createProgram({}, { configFile: config("tsconfig.json") }), b)).toBe(first);
    expect(ts.isExternalModule(first)).toBe(ts.isExternalModule(sourceOf(createProgram({}, { configFile: config("tsconfig.json"), reuse: false }), b)));
  });
  /** What the parse gave each SourceFile of `p` (the repository files, the fixtures, the libraries and node_modules), by file name. */
  const parsed = (p: Program) =>
    p.program
      .getSourceFiles()
      .map((sf) => {
        const internal = sf as unknown as { packageJsonLocations?: readonly string[]; packageJsonScope?: { packageDirectory: string } };
        return {
          file: sf.fileName,
          languageVersion: sf.languageVersion,
          impliedNodeFormat: sf.impliedNodeFormat ?? null,
          module: ts.isExternalModule(sf),
          locations: internal.packageJsonLocations ?? null,
          scope: internal.packageJsonScope?.packageDirectory ?? null,
          syntax: p.program.getSyntacticDiagnostics(sf).map((d) => `${d.start ?? ""} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`),
        };
      })
      .sort((a, b) => (a.file < b.file ? -1 : 1));
  it("T50-9a: with and without the table, every SourceFile of the repository program was parsed the same (B2-I151-R1-001)", () => {
    const { withTable, without } = programs();
    const answers = parsed(withTable);
    expect(answers.length).toBeGreaterThan(500);
    expect(answers).toEqual(parsed(without));
  });
  it("T50-9b: with and without the table, every SourceFile of a guard fixture program was parsed the same, fixtures included", () => {
    const fixtures = {
      "src/output.ts": readFileSync(OUTPUT, "utf8").replace("if (line) console.log(text);", "if (line) console.trace(text);"),
      "tests/__fixtures__/reuse/r3a_optional_param.ts": `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, x?: T): T | undefined => (x === undefined ? (raw as T) : x);\nexport const f = (): Safe | undefined => cast<Safe>("raw");\n`,
    };
    const answers = parsed(createProgram(fixtures));
    expect(answers.filter((a) => a.file.includes("__fixtures__")).length).toBe(1);
    expect(answers).toEqual(parsed(createProgram(fixtures, { reuse: false })));
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
