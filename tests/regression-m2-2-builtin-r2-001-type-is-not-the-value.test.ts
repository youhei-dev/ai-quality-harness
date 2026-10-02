/**
 * M2-2-BUILTIN-R2-001 (High; ADR-0019, decisions 2 and 7): the output guard (tests/structure/output-guard.ts) let an element
 * access on `process` / `globalThis` through when the type of its key was one safe string literal, and did the same in
 * other places (child stdio, the target of an fs write, a call of a value whose declaration is unknown, `Function`, `Safe`).
 * A type does not promise the value at run time: `const key = raw as "platform"; process[key]` type-checks (as, any,
 * JSON.parse, a parameter, an overload, a readonly property or a declare const each make the type say what the value is not)
 * and reached the terminal without a report. Now a permission rests on the syntax (a string literal written in the source)
 * or on the declaration a name resolves to, and a type is used only to find a violation. Each fixture below is a string
 * compiled in memory with the repository's tsconfig and type-checks (the angle-bracket form is rejected by
 * erasableSyntaxOnly and is listed only to record that). The guard is imported as a namespace so that this file also runs
 * against the v0.5.18 guard, where the forms that were let through fail on their own (the record of the failures before the
 * fix). A form the guard does not report on purpose is a known limit of ADR-0019 and is recorded in LIMITS.
 */
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/type-is-not-the-value";

interface Forged {
  /** a part of the report the guard must give */
  expect: string;
  src: string;
}

/** The key of an element access has a safe type and another value (or another holder): reported. */
const KEYS: Record<string, Forged> = {
  // the former control c01 of the R1 test: a const of literal type as the key, a harmless member (the type is not the value)
  r1c01_literal_typed_platform: { expect: "dynamic access to", src: `const key = "platform" as const;\nexport const f = (): string => process[key];\n` },
  // the former control c04 of the R1 test: an assignment through a literal-typed key
  r1c04_literal_typed_exitcode: { expect: "dynamic access to", src: `const key = "exitCode" as const;\nexport const f = (): void => {\n  process[key] = 1;\n};\n` },
  // the former control c05 of the R1 test: globalThis[p] with p a const of literal type
  r1c05_literal_typed_globalthis_process: { expect: "dynamic access to", src: `const p = "process" as const;\nexport const f = (): string => globalThis[p].platform;\n` },
  // the form of the review: a const string, cast to a safe literal type
  q01_review_as_const_literal: { expect: "dynamic access to", src: `const raw = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // a string cast to a safe literal type
  q02_as_via_string: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // an any value assigned to a variable annotated with a safe literal type
  q03_any_annotation: { expect: "dynamic access to", src: `const raw: any = "getBuiltinModule";\nconst key: "platform" = raw;\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // the result of JSON.parse (any) assigned to a safe literal type
  q04_json_parse: { expect: "dynamic access to", src: `const key: "platform" = JSON.parse('"getBuiltinModule"');\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // as unknown as
  q05_as_unknown_as: { expect: "dynamic access to", src: `const key = "getBuiltinModule" as unknown as "platform";\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // an angle-bracket assertion (rejected by erasableSyntaxOnly; listed to record that)
  q06_angle_bracket: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst key = <"platform">raw;\nconst load = process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // a parameter of a safe literal type; the caller forges it
  q07_parameter_forged_caller: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst read = (key: "platform"): unknown => process[key];\nexport const f = (): unknown => read(raw as "platform");\n` },
  // a generic key K extends the safe literal
  q08_generic_key: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst read = <K extends "platform">(key: K): unknown => process[key];\nexport const f = (): unknown => read(raw as "platform");\n` },
  // the return type of a function is the safe literal
  q09_function_return: { expect: "dynamic access to", src: `const pick = (): "platform" => JSON.parse('"getBuiltinModule"');\nconst load = process[pick()] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // a readonly property of an as const object
  q10_readonly_property: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst o = { k: raw as "platform" } as const;\nconst load = process[o.k] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // an element of an as const tuple
  q11_tuple_element: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst t = [raw as "platform"] as const;\nconst load = process[t[0]] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // an index signature read with a non-null assertion
  q12_record_index: { expect: "dynamic access to", src: `const m: Record<string, "platform"> = JSON.parse('{"a":"getBuiltinModule"}');\nconst load = process[m["a"]!] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // the key with satisfies
  q13_satisfies_key: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst load = process[raw as "platform" satisfies string] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // a declare const (a ReferenceError at run time; the type is trusted)
  q14_declare_const: { expect: "dynamic access to", src: `declare const key: "platform";\nexport const f = (): unknown => process[key];\n` },
  // a string narrowed by === (true at run time as well; a false positive taken as the price of the rule)
  q15_narrowed_by_equality: { expect: "dynamic access to", src: `export const f = (key: string): unknown => (key === "platform" ? process[key] : undefined);\n` },
  // the key is stdout at run time: the terminal rule itself was bypassed
  q16_stdout_forged: { expect: "dynamic access to", src: `const raw: string = "stdout";\nconst key = raw as "platform";\nexport const f = (): boolean => (process[key] as unknown as { write(s: string): boolean }).write("x");\n` },
  // an overload declaration that claims the safe literal
  q17_overload: { expect: "dynamic access to", src: `function pick(x: string): "platform";\nfunction pick(x: number): number;\nfunction pick(x: string | number): string | number {\n  return x;\n}\nconst load = process[pick("getBuiltinModule")] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // a readonly property of a class
  q18_class_readonly_property: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nclass K {\n  readonly k = raw as "platform";\n}\nconst load = process[new K().k] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // globalThis.process[key] (the review's form)
  h01_globalthis_process: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = globalThis.process[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // the node:process module (reported by the allowlist; the element access is reported too)
  h02_node_process_default: { expect: "a built-in module outside the allowlist", src: `import proc from "node:process";\nconst raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = proc[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // globalThis[p][key] with a forged key
  h03_globalthis_second_key: { expect: "dynamic access to", src: `const p = "process" as const;\nconst raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = globalThis[p][key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // globalThis[p] where p is process at run time and Math by its type
  h04_globalthis_first_key: { expect: "dynamic access to", src: `const raw: string = "process";\nconst p = raw as "Math";\nconst holder = globalThis[p] as unknown as { getBuiltinModule(name: string): Console };\nexport const f = (): void => {\n  holder.getBuiltinModule("node:console").log("x");\n};\n` },
  // process?.[key]
  h05_optional_chain: { expect: "dynamic access to", src: `const raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = process?.[key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // (process)![key] (reported as a use of process as a value before too)
  h06_parenthesized_non_null: { expect: "used as a value", src: `const raw: string = "getBuiltinModule";\nconst key = raw as "platform";\nconst load = (process)![key] as unknown as (name: string) => Console;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
};

/** Other places that trusted a type: a stdio value, an any callee or target, a constructor, a literal key, a generic cast. */
const OTHERS: Record<string, Forged> = {
  // child stdio cast to pipe (inherit at run time)
  t01_stdio_forged: { expect: "child process spawnSync with stdio", src: `import { spawnSync } from "node:child_process";\nconst raw: string = "inherit";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: raw as "pipe" });\n};\n` },
  // child stdio is a parameter of type pipe
  t02_stdio_parameter: { expect: "child process spawnSync with stdio", src: `import { spawnSync } from "node:child_process";\nexport const f = (mode: "pipe"): void => {\n  spawnSync("node", ["-e", "0"], { stdio: mode });\n};\n` },
  // an element of a stdio array is forged
  t03_stdio_array_forged: { expect: "child process spawnSync with stdio", src: `import { spawnSync } from "node:child_process";\nconst raw: string = "inherit";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: ["ignore", raw as "pipe", "pipe"] });\n};\n` },
  // fs cast to any: nothing is checked about what is called
  t04_fs_any_callee: { expect: "a call of an untyped (any) value", src: `import fs from "node:fs";\nexport const f = (): void => {\n  (fs as any).writeSync(1, "x");\n};\n` },
  // a file descriptor cast to any (not NumberLike)
  t05_fs_fd_any: { expect: "fs writeSync to an untyped (any) target", src: `import { writeSync } from "node:fs";\nexport const f = (): void => {\n  writeSync(1 as any, "x");\n};\n` },
  // the constructor of a function cast to another type and called
  t06_function_ctor_cast: { expect: "dynamic code: constructor", src: `const F = (() => 0).constructor as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("return 1")();\n` },
  // globalThis["eval"] (a literal key is not an identifier)
  t07_globalthis_eval_literal: { expect: "dynamic code: eval", src: `export const f = (): unknown => globalThis["eval"]("1");\n` },
  // globalThis["Function"] cast and called
  t08_globalthis_function_literal: { expect: "dynamic code: Function", src: `export const f = (): unknown => (globalThis["Function"] as unknown as (body: string) => () => unknown)("return 1")();\n` },
  // Safe made by a generic cast
  t09_safe_generic_cast: { expect: "a type assertion to a type parameter", src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(x: unknown): T => x as T;\nexport const f = (): Safe => cast<Safe>("raw");\n` },
  // the specifier of import() is forged (syntax decides, so it was reported before too)
  t10_import_forged_spec: { expect: "dynamic code: import() of a computed module", src: `const raw: string = "node:console";\nexport const f = (): Promise<unknown> => import(raw as "node:fs");\n` },
  // process cast to another type (reported before too)
  t11_holder_cast_value: { expect: "used as a value", src: `const p = process as unknown as { stdout: { write(s: string): boolean } };\nexport const f = (): boolean => p.stdout.write("x");\n` },
  // process passed to an any parameter (reported before too)
  t12_holder_any_param: { expect: "used as a value", src: `const w = (p: any): boolean => p.stdout.write("x");\nexport const f = (): boolean => w(process);\n` },
  // the constructor of an any value cast to a function type
  t14_any_constructor: { expect: "dynamic code: constructor", src: `const g: any = () => 0;\nconst F = g.constructor as (body: string) => () => unknown;\nexport const f = (): unknown => F("return 1")();\n` },
};

/** A device path spelled other than /dev/… at the start of a string literal. */
const PATHS: Record<string, Forged> = {
  // /./dev/stdout: not spelled /dev/ at the start
  z01_path_dot_segment: { expect: "fs writeFileSync to", src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/./dev/stdout", "x");\n};\n` },
  // //dev/stdout
  z02_path_double_slash: { expect: "fs writeFileSync to", src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("//dev/stdout", "x");\n};\n` },
  // /tmp/../dev/stdout (reaches the device where /tmp is not a link, e.g. Linux)
  z03_path_dotdot: { expect: "fs writeFileSync to", src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/tmp/../dev/stdout", "x");\n};\n` },
  // ../ up from the working directory to /dev/stdout
  z04_path_relative_dotdot: { expect: "fs writeFileSync to", src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("../../../../../../../../../../../../dev/stdout", "x");\n};\n` },
  // a const whose type is the literal /./dev/stdout
  z08_path_variable_dot_segment: { expect: "fs writeFileSync to", src: `import { writeFileSync } from "node:fs";\nconst p = "/./dev/stdout";\nexport const f = (): void => {\n  writeFileSync(p, "x");\n};\n` },
  // the plain /dev/stdout (as before)
  z05_path_plain_dev: { expect: "fs writeFileSync to /dev/stdout", src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/dev/stdout", "x");\n};\n` },
};

/** Other syntactic forms of using process / globalThis / node:process (the second survey of v0.5.19): reported. */
const SYNTAX: Record<string, Forged> = {
  // const { ["stdout"]: out } = process
  x01_computed_literal_destructuring: { expect: "destructuring of process with a computed key", src: `const { ["stdout"]: out } = process;\nexport const f = (): boolean => out.write("x");\n` },
  // const { ["getBuiltinModule"]: load } = process
  x03_computed_literal_getbuiltinmodule: { expect: "destructuring of process with a computed key", src: `const { ["getBuiltinModule"]: load } = process;\nexport const f = (): void => {\n  load("node:console").log("x");\n};\n` },
  // { ...process }
  x05_spread: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab({ ...process });\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // Object.assign({}, process)
  x06_object_assign: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab(Object.assign({}, process));\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // for (const k in process)
  x11_for_in: { expect: "used as a value (ForInStatement)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nexport const f = (): number => {\n  let n = 0;\n  for (const k in process) n += k.length;\n  return n;\n};\n` },
  // a comma expression that ends in process
  x16_comma: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab((Math.max(0), process));\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // a conditional expression that yields process
  x17_conditional: { expect: "used as a value (ConditionalExpression)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab(K.length > 0 ? process : globalThis);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // [process].map(fn)
  x20_array_callback: { expect: "used as a value (ArrayLiteralExpression)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = [process].map(grab)[0];\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // new C(process)
  x23_new_argument: { expect: "used as a value (NewExpression)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nclass C {\n  readonly w: W | undefined;\n  constructor(p: unknown) {\n    this.w = grab(p);\n  }\n}\nconst w = new C(process).w;\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // the result of process.on(…), which is process
  x27_call_result_as_holder: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab(process.on("x", () => undefined));\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // { process }
  x29_shorthand_property: { expect: "used as a value (ShorthandPropertyAssignment)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst o = { process };\nconst w = grab(o.process);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // export default process
  x30_export_default: { expect: "used as a value (ExportAssignment)", src: `export default process;\nexport const f = (): number => 0;\n` },
  // yield process
  x34_generator_yield: { expect: "used as a value (YieldExpression)", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nfunction* gen(): Generator<unknown> {\n  yield process;\n}\nconst w = grab(gen().next().value);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // const { ["process"]: p } = globalThis
  g04_computed_literal_destructuring: { expect: "destructuring of globalThis with a computed key", src: `const { ["process"]: p } = globalThis;\nexport const f = (): number => p.pid;\n` },
  // { globalThis }
  g05_shorthand_property: { expect: "used as a value (ShorthandPropertyAssignment)", src: `const o = { globalThis };\nexport const f = (): number => Object.keys(o).length;\n` },
  // global.process passed on
  y01_global_alias: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab(global.process);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // globalThis.globalThis[key]
  y03_globalthis_globalthis_key: { expect: "used as a value", src: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst key = K as "process";\nconst w = grab(globalThis.globalThis[key]);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
  // module.require(…)
  y05_module_require: { expect: "dynamic code: require", src: `export const f = (): unknown => module.require("node:fs");\n` },
  // require(…)
  y07_require_call: { expect: "dynamic code: require", src: `export const f = (): unknown => require("node:fs");\n` },
  // Function("return this")()
  y10_function_return_this: { expect: "dynamic code", src: `export const f = (): unknown => Function("return this")();\n` },
  // process.mainModule?.require(…)
  y13_mainmodule_require: { expect: "dynamic code: require", src: `export const f = (): unknown => process.mainModule?.require("node:fs");\n` },
  // import proc from "node:process"
  n01_node_process_default: { expect: "a built-in module outside the allowlist", src: `import proc from "node:process";\nconst K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nconst w = grab(proc);\nexport const f = (): boolean => w?.write("x") ?? false;\n` },
};

/** Not reported, on purpose: the known limits of ADR-0019 (a test failing here means the limit text has to change). */
const LIMITS: Record<string, string> = {
  // a device path built at run time (ADR-0019 known limit)
  n01_runtime_device_path: `import { writeFileSync } from "node:fs";\nconst dev: string = ["", "dev", "stdout"].join("/");\nexport const f = (): void => {\n  writeFileSync(dev, "x");\n};\n`,
  // a URL object as the path (ADR-0019 known limit: only a string literal path is checked)
  z06_path_url_object: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync(new URL("file:///dev/stdout"), "x");\n};\n`,
  // a path joined at run time (ADR-0019 known limit)
  z07_path_runtime_join: `import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nexport const f = (): void => {\n  writeFileSync(join("/dev", "stdout"), "x");\n};\n`,
  // Reflect.get(fn, "constructor") cast to a function type (ADR-0019 known limit: a name is not written)
  t13_reflect_get_constructor: `const F = Reflect.get(() => 0, "constructor") as (body: string) => () => unknown;\nexport const f = (): unknown => F("return 1")();\n`,
  // obj[k] with k = "constructor" cast to a function type (ADR-0019 known limit)
  t15_computed_constructor: `const k: string = "constructor";\nconst g = (): number => 0;\nconst F = (g as unknown as Record<string, unknown>)[k] as (body: string) => () => unknown;\nexport const f = (): unknown => F("return 1")();\n`,
  // an uncaught exception is printed by Node at exit (ADR-0019 known limit)
  y19_uncaught_throw: `export const f = (): never => {\n  throw new Error("x");\n};\n`,
  // an unhandled rejection is printed by Node at exit (ADR-0019 known limit)
  y22_unhandled_rejection: `export const f = (): void => {\n  void Promise.reject(new Error("x"));\n};\n`,
};

/** A listener of process.on / once that uses `this` (called with process as `this`): reported since v0.5.22 (M2-2-BUILTIN-R5-003). They were known limits of ADR-0019 until v0.5.21. */
const LISTENERS: Record<string, string> = {
  // a listener of process.on is called with this = process (reported since v0.5.22: M2-2-BUILTIN-R5-003)
  x25_this_carrier_listener: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nexport const f = (): void => {\n  process.on("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  process.emit("exit", 0);\n};\n`,
  // an object method passed to process.on: this is process at run time (reported since v0.5.22: M2-2-BUILTIN-R5-003)
  x26_this_carrier_object_method: `const fake = {\n  stdout: { write: (_s: string): boolean => false },\n  m(): void {\n    this.stdout.write("x");\n  },\n};\nexport const f = (): void => {\n  process.on("exit", fake.m);\n  process.emit("exit", 0);\n};\n`,
  // a class method passed to process.on: this is process at run time (reported since v0.5.22: M2-2-BUILTIN-R5-003)
  x36_this_carrier_class_method: `class A {\n  readonly stdout = { write: (_s: string): boolean => false };\n  m(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  process.on("exit", new A().m);\n  process.emit("exit", 0);\n};\n`,
  // process.once with a function expression that uses this (reported since v0.5.22: M2-2-BUILTIN-R5-003)
  x37_this_carrier_once_function_expression: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nexport const f = (): void => {\n  process.once("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  process.emit("exit", 0);\n};\n`,
  // globalThis.process.on with a function expression that uses this (reported since v0.5.22: M2-2-BUILTIN-R5-003)
  g06_this_carrier_process_from_globalthis: `const K: string = ["std", "out"].join("");\ntype W = { write(s: string): boolean };\nconst grab = (o: unknown): W | undefined => (o as Record<string, W | undefined>)[K];\nexport const _keep = [K, grab];\nexport const f = (): void => {\n  globalThis.process.on("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  globalThis.process.emit("exit", 0);\n};\n`,
};

/** Not violations. */
const CONTROLS: Record<string, string> = {
  // process["platform"]: a key written as a string literal
  c01_syntactic_platform: `export const f = (): string => process["platform"];\n`,
  // process[`platform`]: a template literal without substitutions
  c02_syntactic_template_platform: `export const f = (): string => process[\`platform\`];\n`,
  // globalThis["process"].platform
  c03_globalthis_literal_process: `export const f = (): string => globalThis["process"].platform;\n`,
  // an ordinary object with members of the same names
  c04_plain_object: `const obj = { getBuiltinModule: (): number => 0, report: { writeReport: (): string => "" } };\nconst key = "getBuiltinModule" as const;\nconst r = "report" as const;\nexport const f = (): string => \`\${obj[key]()} \${obj[r].writeReport()}\`;\n`,
  // references in a type position
  c05_type_positions: `const key = "getBuiltinModule" as const;\nexport type G = (typeof process)["getBuiltinModule"];\nexport type H = (typeof process)[typeof key];\nexport type I = NodeJS.Process["report"];\n`,
  // process.exitCode = 1
  c06_exitcode_assignment: `export const f = (): void => {\n  process.exitCode = 1;\n};\n`,
  // process.env[k] (env is not a holder)
  c07_process_env_key: `const k: string = "PATH";\nexport const f = (): string | undefined => process.env[k];\n`,
  // process.on / process.platform / process.pid
  c08_process_on_and_platform: `export const f = (): string => {\n  process.on("exit", () => undefined);\n  return \`\${process.platform} \${process.pid}\`;\n};\n`,
  // stdio: ["ignore", "pipe", "pipe"] (the form of src/)
  c09_stdio_literal_array: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: ["ignore", "pipe", "pipe"] });\n};\n`,
  // an ordinary path written with fs
  c10_fs_write_file_path: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync(p, "x");\n};\n`,
  // an ordinary typed call and as const
  c11_typed_call: `const a = ["x", "y"] as const;\nexport const f = (): number => a.length + Math.max(1, 2);\n`,
  // process.platform / cwd() / argv / env / a literal key
  c21_process_literal_members: `export const f = (): string => \`\${process.platform} \${process.cwd()} \${process.argv.length} \${process.env["HOME"] ?? ""}\`;\n`,
  // process.on(…) as a statement
  c22_process_on_statement: `export const f = (): void => {\n  process.on("exit", () => undefined);\n};\n`,
  // this in a class method
  c23_class_this: `class A {\n  readonly id = 1;\n  get(): number {\n    return this.id;\n  }\n}\nexport const f = (): number => new A().get();\n`,
  // globalThis.setTimeout and globalThis["process"].platform
  c24_globalthis_named: `export const f = (): string => \`\${typeof globalThis.setTimeout} \${globalThis["process"].platform}\`;\n`,
  // Object.entries / spread / in over an ordinary object
  c25_object_entries_plain: `const o = { a: 1 };\nexport const f = (): number => Object.entries({ ...o }).length + ('a' in o ? 1 : 0);\n`,
  // ordinary relative paths that contain dev/ or proc/
  z09_path_control_relative_dev: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("./dev/notes.txt", "x");\n  writeFileSync("src/proc/x.txt", "x");\n};\n`,
  // import.meta.dirname / import.meta.resolve
  y08_import_meta_control: `export const f = (): string => \`\${import.meta.dirname} \${import.meta.resolve("./x.ts")}\`;\n`,
};

const groups: Record<string, Forged>[] = [KEYS, OTHERS, PATHS, SYNTAX];
const sources: Record<string, string> = { ...LIMITS, ...LISTENERS, ...CONTROLS };
for (const g of groups) for (const [id, f] of Object.entries(g)) sources[id] = f.src;
const program = createProgram(Object.fromEntries(Object.entries(sources).map(([id, s]) => [`${P}/${id}.ts`, s])));
const fileOf = (id: string): ts.SourceFile[] => filesUnder(program, `${P}/${id}.ts`);
const reported = (id: string): string[] => guard.outputViolations(program, fileOf(id)).map((v) => v.what);

describe("M2-2-BUILTIN-R2-001: the fixtures", () => {
  it("every fixture type-checks, except the angle-bracket assertion (erasableSyntaxOnly)", () => {
    expect(Object.keys(sources).filter((id) => typeErrors(program, fileOf(id)).length > 0)).toEqual(["q06_angle_bracket"]);
  });
});

const suites: [string, Record<string, Forged>][] = [
  ["a key whose type is safe and whose value is not is reported", KEYS],
  ["the other places that trusted a type are reported", OTHERS],
  ["a device path spelled another way is reported", PATHS],
  ["other syntactic forms of holding process / globalThis are reported", SYNTAX],
];
for (const [title, g] of suites) {
  describe(`M2-2-BUILTIN-R2-001: ${title}`, () => {
    for (const [id, f] of Object.entries(g)) {
      it(id, () => {
        expect(reported(id).some((what) => what.includes(f.expect))).toBe(true);
      });
    }
  });
}

describe("M2-2-BUILTIN-R2-001: a listener of process.on that uses this is reported (v0.5.22, M2-2-BUILTIN-R5-003)", () => {
  for (const id of Object.keys(LISTENERS)) {
    it(id, () => {
      expect(reported(id).some((what) => what.includes("that uses this"))).toBe(true);
    });
  }
});

describe("M2-2-BUILTIN-R2-001: the known limits are not reported (ADR-0019)", () => {
  for (const id of Object.keys(LIMITS)) {
    it(id, () => {
      expect(reported(id)).toEqual([]);
    });
  }
});

describe("M2-2-BUILTIN-R2-001: controls are not reported", () => {
  for (const id of Object.keys(CONTROLS)) {
    it(id, () => {
      expect(reported(id)).toEqual([]);
    });
  }
});

describe("M2-2-BUILTIN-R2-001: src/", () => {
  it("src/ has no violation", () => {
    const real = createProgram();
    expect(guard.outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
  });
});
