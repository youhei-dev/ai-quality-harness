/**
 * Backlog 1 (M2-2-R4-002, Medium; ADR-0019): the output guard (tests/structure/output-guard.ts) did not report
 * `process.getBuiltinModule(…)`, a way to load `node:console`, `node:vm` or any other built-in without an import — and of
 * the 49 forms of the same kind that SP1 listed (the ones that type-check) it missed 40: a built-in other than console /
 * vm loaded by import, `export … from` or import(), `process.dlopen`, `process.report`, `process.emitWarning`,
 * `process.execve`, `process.stdin`, a `data:` import, a file the checker cannot see, … (v0.5.16; src/ used none of them).
 * Now every module a file of src/ loads at run time must be a built-in of BUILTIN_ALLOWED (written with `node:`), a
 * source file of src/ or a runtime dependency of package.json, and six members of `process` are violations wherever
 * they resolve. The fixtures are strings compiled in memory with the repository's tsconfig (each one type-checks, except
 * import() of a data: URL, which tsc rejects). The guard is imported as a namespace so that this file also runs against
 * the v0.5.16 guard, where each case fails on its own (the record of the failures before the fix).
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/allowlist";

/** `process.getBuiltinModule` in every spelling (gb13-gb15 were reported by other rules already). */
const GET_BUILTIN: Record<string, string> = {
  gb01_console_literal: `export const f = (): void => {\n  process.getBuiltinModule("node:console").log("x");\n};\n`,
  gb02_vm_literal: `export const f = (): unknown => process.getBuiltinModule("node:vm").runInThisContext("0");\n`,
  gb03_name_variable: `export const f = (name: string): object | undefined => process.getBuiltinModule(name);\n`,
  gb04_name_built: `const part: string = "console";\nexport const f = (): void => {\n  (process.getBuiltinModule("node:" + part) as Console | undefined)?.log("x");\n};\n`,
  gb05_bare_name: `export const f = (): void => {\n  process.getBuiltinModule("console").log("x");\n};\n`,
  gb06_globalthis: `export const f = (): void => {\n  globalThis.process.getBuiltinModule("node:console").log("x");\n};\n`,
  gb07_alias: `const load = process.getBuiltinModule;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n`,
  gb08_destructuring: `const { getBuiltinModule } = process;\nexport const f = (): void => {\n  getBuiltinModule("node:console").log("x");\n};\n`,
  gb09_element_literal: `export const f = (): void => {\n  process["getBuiltinModule"]("node:console").log("x");\n};\n`,
  gb10_node_process_import: `import { getBuiltinModule } from "node:process";\nexport const f = (): void => {\n  getBuiltinModule("node:console").log("x");\n};\n`,
  gb11_worker_threads: `export const f = (): void => {\n  const { Worker } = process.getBuiltinModule("node:worker_threads");\n  new Worker("process.stdout.write('x')", { eval: true });\n};\n`,
  gb12_globalthis_destructuring: `const { process: p } = globalThis;\nexport const f = (): void => {\n  p.getBuiltinModule("node:console").log("x");\n};\n`,
  gb13_child_inherit: `export const f = (): void => {\n  process.getBuiltinModule("node:child_process").spawnSync("echo", ["x"], { stdio: "inherit" });\n};\n`,
  gb14_fs_fd: `export const f = (): number => process.getBuiltinModule("node:fs").writeSync(1, "x");\n`,
  gb15_process_stdout: `export const f = (): boolean => process.getBuiltinModule("node:process").stdout.write("x");\n`,
};

/** The other members of process that reach the terminal, load code or replace the program (pm09, pm10, pm13 were reported already). */
const PROCESS_FORMS: Record<string, string> = {
  pm01_dlopen: `export const f = (): void => {\n  process.dlopen({ exports: {} }, "./addon.node");\n};\n`,
  pm02_report_stdout: `export const f = (): string => process.report.writeReport("stdout");\n`,
  pm03_report_file: `export const f = (): string => process.report.writeReport();\n`,
  pm04_report_settings: `export const f = (): void => {\n  process.report.filename = "stdout";\n  process.report.reportOnFatalError = true;\n};\n`,
  pm05_report_alias: `const r = process.report;\nexport const f = (): string => r.writeReport("stderr");\n`,
  pm06_emitwarning: `export const f = (): void => {\n  process.emitWarning("x");\n};\n`,
  pm07_emitwarning_destructuring: `const { emitWarning } = process;\nexport const f = (): void => {\n  emitWarning("x");\n};\n`,
  pm08_execve: `export const f = (): void => {\n  process.execve?.("/bin/echo", ["echo", "x"]);\n};\n`,
  pm09_binding_cast: `export const f = (): unknown => (process as unknown as { binding(name: string): unknown }).binding("fs");\n`,
  pm10_rawdebug_cast: `export const f = (): void => {\n  (process as unknown as { _rawDebug(s: string): void })._rawDebug("x");\n};\n`,
  pm11_stdin_write: `export const f = (): boolean => process.stdin.write("x");\n`,
  pm13_main_module_require: `export const f = (): unknown => process.mainModule?.require("node:console");\n`,
  gt01_globalthis_emitwarning: `export const f = (): void => {\n  globalThis.process.emitWarning("x");\n};\n`,
  gt02_report_element: `export const f = (): string => process["report"].writeReport("stdout");\n`,
};

/** node:module and require (mr02 was reported already). */
const MODULE_FORMS: Record<string, string> = {
  mr01_module_load_cast: `import Module from "node:module";\nexport const f = (): unknown => (Module as unknown as { _load(request: string): unknown })._load("node:console");\n`,
  mr02_require_cache: `export const f = (): number => Object.keys(require.cache).length;\n`,
  mr03_module_register: `import { register } from "node:module";\nexport const f = (): void => {\n  register("./hooks.mjs", import.meta.url);\n};\n`,
};

/** import() (di03 was reported already; import() of a data: URL is DATA_IMPORT below). */
const DYNAMIC_FORMS: Record<string, string> = {
  di01_console_literal: `export const f = async (): Promise<void> => {\n  (await import("node:console")).log("x");\n};\n`,
  di02_worker_literal: `export const f = async (): Promise<void> => {\n  const { Worker } = await import("node:worker_threads");\n  new Worker("process.stdout.write('x')", { eval: true });\n};\n`,
  di03_template_substitution: `export const f = async (name: string): Promise<unknown> => import(\`node:\${name}\`);\n`,
  // v0.5.22 (M2-2-BUILTIN-R5-001): import() of fs / child_process gives their functions as one value (a namespace), so it is reported. It was a control (ct07) until v0.5.21
  di05_fs_dynamic_import_namespace: `export const f = async (): Promise<number> => (await import("node:fs")).readFileSync("a").length;\n`,
};

/** Static import and `export … from`. */
const IMPORT_FORMS: Record<string, string> = {
  si01_worker_threads: `import { Worker } from "node:worker_threads";\nexport const f = (): void => {\n  new Worker("process.stdout.write('x')", { eval: true });\n};\n`,
  si02_repl: `import { start } from "node:repl";\nexport const f = (): void => {\n  start();\n};\n`,
  si03_node_test: `import { test } from "node:test";\nexport const f = (): void => {\n  void test("x", () => undefined);\n};\n`,
  si04_inspector: `import * as inspector from "node:inspector";\nexport const f = (): void => {\n  inspector.open();\n};\n`,
  si05_tty: `import { WriteStream } from "node:tty";\nexport const f = (): boolean => new WriteStream(1).write("x");\n`,
  si06_debuglog: `import { debuglog } from "node:util";\nexport const f = (): void => {\n  debuglog("aiqh")("x");\n};\n`,
  si07_wasi: `import { WASI } from "node:wasi";\nexport const f = (): object => new WASI({ version: "preview1" }).getImportObject();\n`,
  si08_cluster: `import cluster from "node:cluster";\nexport const f = (): void => {\n  cluster.fork();\n};\n`,
  si09_bare_builtin: `import { readFileSync } from "fs";\nexport const f = (): number => readFileSync("a").length;\n`,
  si10_reexport: `export { Worker } from "node:worker_threads";\n`,
  si11_side_effect_data: `import "data:text/javascript,process.stdout.write('x')";\nexport const f = 1;\n`,
  si12_side_effect_mjs: `import "./si12-helper.mjs";\nexport const f = 1;\n`,
  si13_inline_type_only: `import { type Worker } from "node:worker_threads";\nexport const f = (w: Worker): number => w.threadId;\n`,
};

/** A device path in an fs call (reported already; a path built at run time is a known limit, ADR-0019). */
const FS_FORMS: Record<string, string> = {
  fs04_dev_fd_literal: `import { openSync } from "node:fs";\nexport const f = (): number => openSync("/dev/fd/1", "w");\n`,
};

/** Not violations (never reported). */
const CONTROLS: Record<string, string> = {
  ct01_src_like_imports: `import { execFileSync } from "node:child_process";\nimport { createHash } from "node:crypto";\nimport { readFileSync } from "node:fs";\nimport path from "node:path";\nimport { StringDecoder } from "node:string_decoder";\nimport { crc32 } from "node:zlib";\nexport const f = (file: string): string => {\n  const out = execFileSync("git", ["status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });\n  return \`\${createHash("sha256").update(readFileSync(path.join("a", file))).digest("hex")} \${new StringDecoder("utf8").write(Buffer.from(out))} \${crc32("x")}\`;\n};\n`,
  ct02_type_only: `import type { Worker } from "node:worker_threads";\nexport const f = (w: Worker): number => w.threadId;\n`,
  ct03_process_uses: `export const f = (key: string): string => {\n  process.exitCode = 1;\n  process.on("SIGINT", () => undefined);\n  process.kill(process.pid, 0);\n  return \`\${process.platform} \${process.pid} \${process.execPath} \${process.env[key] ?? ""}\`;\n};\n`,
  ct04_packages: `import { Command } from "commander";\nimport { parse } from "jsonc-parser";\nimport { z } from "zod";\nexport const f = (): unknown => [new Command("x"), parse("{}"), z.string()];\n`,
  ct05_relative_src: `import { safeText } from "../../../src/output.ts";\nexport const f = (s: string): string => safeText(s);\n`,
  ct06_type_position: `export type T = ReturnType<typeof process.getBuiltinModule>;\nexport type R = typeof process.report;\n`,
  ct08_import_meta_resolve: `export const f = (): string => import.meta.resolve("node:console");\n`,
};

/** tsc rejects it (Cannot find module), so the self verify's typecheck stops it before the guard. */
const DATA_IMPORT = "di04_data_url";
/** The six members of process that @types/node declares today, referenced once each. */
const MEMBER_REFS = "x01_member_refs";
const DECLARED_MEMBERS = ["getBuiltinModule", "dlopen", "report", "emitWarning", "execve", "stdin"];

const FORMS = { ...GET_BUILTIN, ...PROCESS_FORMS, ...MODULE_FORMS, ...DYNAMIC_FORMS, ...IMPORT_FORMS, ...FS_FORMS };
const all: Record<string, string> = {
  ...FORMS,
  ...CONTROLS,
  [DATA_IMPORT]: `export const f = async (): Promise<unknown> => import("data:text/javascript,process.stdout.write('x')");\n`,
  [MEMBER_REFS]: `export const members = [process.getBuiltinModule, process.dlopen, process.report, process.emitWarning, process.execve, process.stdin];\n`,
};
const program = createProgram(Object.fromEntries(Object.entries(all).map(([name, text]) => [`${P}/${name}.ts`, text])));
const real = createProgram();
const fileOf = (name: string): ts.SourceFile[] => filesUnder(program, `${P}/${name}.ts`);
const reported = (name: string): string[] => guard.outputViolations(program, fileOf(name)).map((v) => v.what);
/** The lists as the guard exports them (undefined on the v0.5.16 guard, which had none). */
const lists = guard as { BUILTIN_ALLOWED?: ReadonlySet<string>; PROCESS_MEMBERS?: ReadonlySet<string> };

describe("backlog 1: the fixtures", () => {
  it("every fixture type-checks, except import() of a data: URL, which tsc rejects (Cannot find module)", () => {
    expect(Object.keys(all).filter((name) => typeErrors(program, fileOf(name)).length > 0)).toEqual([DATA_IMPORT]);
    expect(typeErrors(program, fileOf(DATA_IMPORT)).join(" ")).toContain("Cannot find module");
  });
});

const groups: Array<[string, Record<string, string>]> = [
  ["process.getBuiltinModule in every spelling is reported", GET_BUILTIN],
  ["the other members of process that reach the terminal, load code or replace the program are reported", PROCESS_FORMS],
  ["node:module and require are reported", MODULE_FORMS],
  ["import() of a module outside the allowlist, or of fs / child_process (their functions as one namespace), is reported", DYNAMIC_FORMS],
  ["import and export … from a module outside the allowlist (a built-in, a URL, a file the checker cannot see) are reported", IMPORT_FORMS],
  ["an fs call with a device path is reported", FS_FORMS],
];
for (const [title, forms] of groups) {
  describe(`backlog 1: ${title}`, () => {
    for (const name of Object.keys(forms)) {
      it(name, () => {
        expect(reported(name)).not.toEqual([]);
      });
    }
  });
}

describe("backlog 1: controls are not reported (the six built-ins, import type, ordinary uses of process, the runtime dependencies, src/, types, import.meta.resolve)", () => {
  for (const name of Object.keys(CONTROLS)) {
    it(name, () => {
      expect(reported(name)).toEqual([]);
    });
  }
});

describe("backlog 1: src/ and the lists of the guard", () => {
  it("src/ has no violation", () => {
    expect(guard.outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
  });

  it("BUILTIN_ALLOWED is exactly the set of built-ins src/ loads (changing it needs ADR-0019)", () => {
    const used = new Set<string>();
    for (const sf of filesUnder(real, "src/")) {
      const visit = (n: ts.Node): void => {
        let spec: ts.Expression | undefined;
        if (ts.isImportDeclaration(n) && n.importClause?.isTypeOnly !== true) spec = n.moduleSpecifier;
        else if (ts.isExportDeclaration(n) && !n.isTypeOnly) spec = n.moduleSpecifier;
        else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) spec = n.arguments[0];
        if (spec !== undefined && ts.isStringLiteralLike(spec) && spec.text.startsWith("node:")) used.add(spec.text);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect([...(lists.BUILTIN_ALLOWED ?? [])].sort()).toEqual([...used].sort());
  });

  it("the six members of process resolve to @types/node's process.d.ts, are in PROCESS_MEMBERS and are each reported", () => {
    const sf = fileOf(MEMBER_REFS)[0];
    if (sf === undefined) throw new Error(`${MEMBER_REFS} is not in the program`);
    let processId: ts.Identifier | undefined;
    const find = (n: ts.Node): void => {
      if (processId === undefined && ts.isIdentifier(n) && n.text === "process") processId = n;
      else ts.forEachChild(n, find);
    };
    find(sf);
    if (processId === undefined) throw new Error("no reference to process");
    const type = program.checker.getTypeAtLocation(processId);
    const unresolved = DECLARED_MEMBERS.filter(
      (name) => !(type.getProperty(name)?.declarations ?? []).some((d) => /[\\/]@types[\\/]node[\\/]process\.d\.ts$/.test(d.getSourceFile().fileName)),
    );
    expect(unresolved).toEqual([]);
    expect(DECLARED_MEMBERS.filter((name) => !(lists.PROCESS_MEMBERS?.has(name) ?? false))).toEqual([]);
    expect([...new Set(reported(MEMBER_REFS))].sort()).toEqual(DECLARED_MEMBERS.map((name) => `process.${name}`).sort());
  });
});
