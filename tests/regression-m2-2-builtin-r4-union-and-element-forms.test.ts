/**
 * M2-2-BUILTIN-R4 (High 4 / Medium 2; ADR-0019, decision 7): the structure guards (tests/structure/output-guard.ts,
 * brand-guard.ts) looked at the top-level flag of a type (a union, an intersection or a type parameter was not taken
 * apart: an fs writer's first argument `string | number`, an `fd` option in a union) and at one syntax form (an
 * identifier, not an element access or a destructuring; a spread, not a computed name after `stdio`), and treated parentheses
 * and `!` as an assertion in one place and not in another. Each fixture below is a string compiled in memory with the
 * repository's tsconfig and type-checks (four forms are rejected by TypeScript itself; they are recorded apart, with
 * the type error as the expectation). `reported: false` on a form that runs the forbidden way is a known limit of ADR-0019,
 * not a pass (the conditional and mapped types of a generic cast); `reported: true` under COST is the price of a rule on a
 * safe form. The guards are imported as namespaces so that this file also runs against the v0.5.20 guards, where the forms
 * that expect a report fail on their own (the record of the failures before the fix).
 */
import { describe, expect, it } from "vitest";
import { brandGuard } from "./structure/brand-guard.ts";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/r4";

/** A fixture: a source string. `reported`: the guards report it. */
interface Case {
  reported: boolean;
  src: string;
}

/** R4-001: an fs writer's first argument that can be a file descriptor or a device path in one branch of a union, an intersection or a type parameter's constraint */
const R4_001: Record<string, Case> = {
  a01_string_or_number: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (t: string | number): void => {\n  writeFileSync(t, "x");\n};\n` },
  a02_one_or_string: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (t: 1 | string): void => {\n  writeFileSync(t, "x");\n};\n` },
  a03_pathlike_or_number: { reported: true, src: `import { writeFileSync, type PathLike } from "node:fs";\nexport const f = (t: PathLike | number): void => {\n  writeFileSync(t, "x");\n};\n` },
  a04_path_or_fd_alias: { reported: true, src: `import { writeFileSync, type PathOrFileDescriptor } from "node:fs";\nexport const f = (t: PathOrFileDescriptor): void => {\n  writeFileSync(t, "x");\n};\n` },
  a05_parameters_of_writer: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (t: Parameters<typeof writeFileSync>[0]): void => {\n  writeFileSync(t, "x");\n};\n` },
  a06_conditional_fd_or_path: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (toStdout: boolean, p: string): void => {\n  writeFileSync(toStdout ? 1 : p, "x");\n};\n` },
  a07_property_union: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (o: { target: string | number }): void => {\n  writeFileSync(o.target, "x");\n};\n` },
  a08_type_param_number: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = <T extends number>(fd: T): void => {\n  writeFileSync(fd, "x");\n};\n` },
  a09_type_param_union: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = <T extends string | number>(t: T): void => {\n  writeFileSync(t, "x");\n};\n` },
  a10_branded_number: { reported: true, src: `import { writeSync } from "node:fs";\ntype Fd = number & { readonly __kind: "fd" };\nexport const f = (fd: Fd): void => {\n  writeSync(fd, "x");\n};\n` },
  a11_device_union_literal: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (err: boolean): void => {\n  writeFileSync(err ? "/dev/stderr" : "/dev/stdout", "x");\n};\n` },
  a12_device_or_file_const: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (toStdout: boolean): void => {\n  const target = toStdout ? "/dev/stdout" : "out.txt";\n  writeFileSync(target, "x");\n};\n` },
  a13_append_union: { reported: true, src: `import { appendFileSync } from "node:fs";\nexport const f = (t: string | number): void => {\n  appendFileSync(t, "x");\n};\n` },
  a14_control_number: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (t: number): void => {\n  writeFileSync(t, "x");\n};\n` },
  a15_control_narrowed: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (t: string | number): void => {\n  if (typeof t === "number") writeFileSync(t, "x");\n};\n` },
  a16_control_string: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync(p, "x");\n};\n` },
  a17_control_pathlike: { reported: false, src: `import { writeFileSync, type PathLike } from "node:fs";\nexport const f = (p: PathLike): void => {\n  writeFileSync(p, "x");\n};\n` },
  a18_control_file_union_literal: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (b: boolean): void => {\n  writeFileSync(b ? "a.txt" : "b.txt", "x");\n};\n` },
};

/** R4-002: an `fd` option in one branch of a union, an intersection or a type parameter's constraint; keys that are not known (rule K, fs calls only) */
const R4_002: Record<string, Case> = {
  b01_union_options: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: { fd: number } | { flags: string }): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b02_optional_options_param: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string, o?: { fd?: number }): void => {\n  createWriteStream(p, o).write("x");\n};\n` },
  b03_parameters_of_stream: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string, o?: Parameters<typeof createWriteStream>[1]): void => {\n  createWriteStream(p, o).write("x");\n};\n` },
  b04_nonnullable_parameters: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string, o: NonNullable<Parameters<typeof createWriteStream>[1]>): void => {\n  createWriteStream(p, o).write("x");\n};\n` },
  b05_type_param: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = <O extends { fd?: number }>(o: O): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b06_intersection: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: { fd: number } & { autoClose: boolean }): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b07_encoding_or_options: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: BufferEncoding | { fd: number }): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b08_spread_of_union: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: { fd: number } | { flags: string }): void => {\n  createWriteStream("unused.txt", { ...o }).write("x");\n};\n` },
  b09_computed_dynamic_key: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (k: string): void => {\n  createWriteStream("unused.txt", { [k]: 1 }).write("x");\n};\n` },
  b10_record_options: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: Record<string, number>): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b11_conditional_options: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (toStdout: boolean): void => {\n  createWriteStream("unused.txt", toStdout ? { fd: 1 } : {}).write("x");\n};\n` },
  b12_control_object: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (o: { fd?: number }): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\n` },
  b13_control_no_fd: { reported: false, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string): void => {\n  createWriteStream(p, { flags: "a" }).write("x");\n};\n` },
  b14_control_optional_no_fd: { reported: false, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string, o?: { flags?: string }): void => {\n  createWriteStream(p, o).write("x");\n};\n` },
};

/** R4-003: an fs / child_process function taken by an element access, a destructuring or `fs/promises`, used other than as the callee of a call */
const R4_003: Record<string, Case> = {
  c01_ns_element_retyped: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const w: (p: string, d: string) => void = fs["writeFileSync"];\n  w("/dev/stdout", "x");\n};\n` },
  c02_ns_element_plain_var: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const w = fs["writeFileSync"];\n  w("/dev/stdout", "x");\n};\n` },
  c03_ns_element_direct_call: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  fs["writeFileSync"]("/dev/stdout", "x");\n};\n` },
  c04_ns_element_call_method: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  fs["writeFileSync"].call(undefined, "/dev/stdout", "x");\n};\n` },
  c05_ns_element_di: { reported: true, src: `import * as fs from "node:fs";\ninterface Deps {\n  write: (p: string, d: string) => void;\n}\nexport const f = (): void => {\n  const deps: Deps = { write: fs["writeFileSync"] };\n  deps.write("/dev/stdout", "x");\n};\n` },
  c06_ns_element_reflect: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  Reflect.apply(fs["writeFileSync"], undefined, ["/dev/stdout", "x"]);\n};\n` },
  c07_default_import_element: { reported: true, src: `import fs from "node:fs";\nexport const f = (): void => {\n  const w: (p: string, d: string) => void = fs["writeFileSync"];\n  w("/dev/stdout", "x");\n};\n` },
  c08_child_ns_element_retyped: { reported: true, src: `import * as cp from "node:child_process";\nexport const f = (): void => {\n  const sp: (c: string, a: string[], o: object) => unknown = cp["spawnSync"];\n  sp("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\n` },
  c09_destructure_retyped: { reported: true, src: `import * as fs from "node:fs";\ntype F = (p: string, d: string) => void;\nexport const f = (): void => {\n  const { writeFileSync: w }: { writeFileSync: F } = fs;\n  w("/dev/stdout", "x");\n};\n` },
  c10_promises_member_retyped: { reported: true, src: `import { promises } from "node:fs";\nexport const f = (): Promise<void> => {\n  const w: (p: string, d: string) => Promise<void> = promises.writeFile;\n  return w("/dev/stdout", "x");\n};\n` },
  c11_ns_element_template_key: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const w: (p: string, d: string) => void = fs[\`writeFileSync\`];\n  w("/dev/stdout", "x");\n};\n` },
  c12_dynamic_import_element: { reported: true, src: `export const f = async (): Promise<void> => {\n  const m = await import("node:fs");\n  const w: (p: string, d: string) => void = m["writeFileSync"];\n  w("/dev/stdout", "x");\n};\n` },
  c13_control_property_retyped: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const w: (p: string, d: string) => void = fs.writeFileSync;\n  w("/dev/stdout", "x");\n};\n` },
  c14_ns_element_optional_chain: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const w: ((p: string, d: string) => void) | undefined = fs?.["writeFileSync"];\n  w?.("/dev/stdout", "x");\n};\n` },
};

/** R4-004: a computed name (or an accessor, a method) after stdio can override it */
const R4_004: Record<string, Case> = {
  d01_computed_string_key: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", [k]: "inherit" });\n};\n` },
  d02_computed_union_key: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: "stdio" | "cwd"): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", [k]: "inherit" });\n};\n` },
  d05_getter_computed: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], {\n    stdio: "pipe",\n    get [k]() {\n      return "inherit";\n    },\n  });\n};\n` },
  d07_method_computed: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], {\n    stdio: "pipe",\n    [k]() {\n      return "inherit";\n    },\n  });\n};\n` },
  d09_array_then_computed: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: ["pipe", "pipe", "pipe"], [k]: "inherit" });\n};\n` },
  d10_exec_sync_computed: { reported: true, src: `import { execSync } from "node:child_process";\nexport const f = (k: string): void => {\n  execSync("node -e \\"process.stdout.write('x')\\"", { stdio: "pipe", [k]: "inherit" });\n};\n` },
  d11_computed_key_value_pair: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string, v: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", [k]: v });\n};\n` },
  d12_control_other_literal_key: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", ["cwd"]: "." });\n};\n` },
  d13_control_computed_before: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { [k]: "inherit", stdio: "pipe" });\n};\n` },
  d14_control_plain_after: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", env: {} });\n};\n` },
};

/** R4-005: parentheses and `!` alone, and `satisfies` / `as const` / parentheses on a child options object, are not an assertion (false positives; controls) */
const R4_005: Record<string, Case> = {
  e01_fs_paren_path: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync((p), "x");\n};\n` },
  e02_fs_nonnull_path: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p?: string): void => {\n  writeFileSync(p!, "x");\n};\n` },
  e03_fs_nonnull_map_get: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (m: Map<string, string>): void => {\n  writeFileSync(m.get("out")!, "x");\n};\n` },
  e04_child_paren_options: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], ({ stdio: "pipe" }));\n};\n` },
  e05_child_satisfies_options: { reported: false, src: `import { spawnSync, type SpawnSyncOptions } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe" } satisfies SpawnSyncOptions);\n};\n` },
  e06_child_as_const_options: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe" } as const);\n};\n` },
  e07_control_fs_double_assertion: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync(1 as unknown as string, "x");\n};\n` },
  e08_control_fs_paren_assertion: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync((1 as unknown as string), "x");\n};\n` },
  e09_control_fs_nonnull_assertion: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (x: unknown): void => {\n  writeFileSync((x as string)!, "x");\n};\n` },
  e10_control_child_inherit_as: { reported: true, src: `import { spawnSync, type SpawnSyncOptions } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" } as SpawnSyncOptions);\n};\n` },
  e11_control_child_paren_inherit: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], ({ stdio: "inherit" }));\n};\n` },
};

/** SP1 inventory: generic casts through a union / intersection (`as T | undefined`), spread tuples, known limits (conditional and mapped types: not reported) */
const INV: Record<string, Case> = {
  x01_fs_writer_spread_tuple: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (...a: Parameters<typeof writeFileSync>): void => {\n  writeFileSync(...a);\n};\n` },
  x02_stream_spread_tuple: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (...a: Parameters<typeof createWriteStream>): void => {\n  createWriteStream(...a).write("x");\n};\n` },
  x03_copy_device_union: { reported: true, src: `import { copyFileSync } from "node:fs";\nexport const f = (from: string, err: boolean): void => {\n  copyFileSync(from, err ? "/dev/stderr" : "/dev/stdout");\n};\n` },
  x04_options_property_optional: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (cfg: { stream?: { fd?: number } }): void => {\n  createWriteStream("unused.txt", cfg.stream).write("x");\n};\n` },
  x05_destructure_plain_control: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const { writeFileSync } = fs;\n  writeFileSync("/dev/stdout", "x");\n};\n` },
  x06_type_param_device: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = <P extends "/dev/stdout" | "/dev/stderr">(p: P): void => {\n  writeFileSync(p, "x");\n};\n` },
  x07_generic_cast_union_undefined_safe: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst get = <T>(m: Map<string, unknown>, k: string): T | undefined => m.get(k) as T | undefined;\nexport const f = (): Safe | undefined => get<Safe>(new Map([["k", "raw"]]), "k");\n` },
  x08_generic_cast_nonnullable_safe: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst req = <T>(v: unknown): NonNullable<T> => v as NonNullable<T>;\nexport const f = (): Safe => req<Safe>("raw");\n` },
  x09_generic_cast_union_undefined_checked: { reported: true, src: `import type { Checked } from "../../../src/review/checked.ts";\nconst get = <T>(m: Map<string, unknown>, k: string): T | undefined => m.get(k) as T | undefined;\nexport const f = (): Checked | undefined => get<Checked>(new Map([["k", "raw"]]), "k");\n` },
  x10_generic_cast_control: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst get = <T>(m: Map<string, unknown>, k: string): T => m.get(k) as T;\nexport const f = (): Safe => get<Safe>(new Map([["k", "raw"]]), "k");\n` },
  x11_generic_cast_awaited: { reported: false, src: `import type { Safe } from "../../../src/output.ts";\nconst req = <T>(v: unknown): Awaited<T> => v as Awaited<T>;\nexport const f = (): Safe => req<Safe>("raw");\n` },
  x12_generic_cast_partial: { reported: false, src: `const req = <T>(v: unknown): Partial<T> => v as Partial<T>;\nexport const f = (): Partial<{ a: number }> => req<{ a: number }>("raw");\n` },
};

/** the price of the rules: safe forms that are now reported (a record, not a goal) */
const COST: Record<string, Case> = {
  f01_cost_path_or_fd_wrapper: { reported: true, src: `import { writeFileSync, type PathOrFileDescriptor } from "node:fs";\nexport const save = (t: PathOrFileDescriptor, d: string): void => {\n  writeFileSync(t, d);\n};\nexport const f = (): void => save("out.txt", "x");\n` },
  f02_cost_stream_options_wrapper: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const open = (p: string, o?: Parameters<typeof createWriteStream>[1]): void => {\n  createWriteStream(p, o).end("x");\n};\nexport const f = (): void => open("out.txt", { flags: "a" });\n` },
  f03_cost_destructure_read: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (p: string): string => {\n  const { readFileSync } = fs;\n  return readFileSync(p, "utf8");\n};\n` },
  f04_cost_dynamic_env_key: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (k: string): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", [k]: undefined });\n};\n` },
  f05_cost_generic_get: { reported: true, src: `export const get = <T>(m: Map<string, unknown>, k: string): T | undefined => m.get(k) as T | undefined;\nexport const f = (): number | undefined => get<number>(new Map([["k", 1]]), "k");\n` },
  f06_cost_mkdir_record: { reported: true, src: `import { mkdirSync } from "node:fs";\nexport const f = (p: string, opts: Record<string, unknown>): void => {\n  mkdirSync(p, opts);\n};\n` },
};

const GROUPS: Record<string, Record<string, Case>> = { R4_001, R4_002, R4_003, R4_004, R4_005, INV, COST };
const TITLES: Record<string, string> = {
  R4_001: "R4-001: an fs writer's first argument that can be a file descriptor or a device path in one branch of a union, an intersection or a type parameter's constraint",
  R4_002: "R4-002: an `fd` option in one branch of a union, an intersection or a type parameter's constraint; keys that are not known (rule K, fs calls only)",
  R4_003: "R4-003: an fs / child_process function taken by an element access, a destructuring or `fs/promises`, used other than as the callee of a call",
  R4_004: "R4-004: a computed name (or an accessor, a method) after stdio can override it",
  R4_005: "R4-005: parentheses and `!` alone, and `satisfies` / `as const` / parentheses on a child options object, are not an assertion (false positives; controls)",
  INV: "SP1 inventory: generic casts through a union / intersection (`as T | undefined`), spread tuples, known limits (conditional and mapped types: not reported)",
  COST: "the price of the rules: safe forms that are now reported (a record, not a goal)",
};

/** The forms TypeScript rejects: the shared program must type-check, so they are compiled apart. */
const TYPE_ERRORS: Record<string, string> = {
  d03_computed_const_key: `import { spawnSync } from "node:child_process";\nconst K = "stdio";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", [K]: "inherit" });\n};\n`,
  d04_computed_literal_key: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ["stdio"]: "inherit" });\n};\n`,
  d06_getter_named: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], {\n    stdio: "pipe",\n    get stdio() {\n      return "inherit" as const;\n    },\n  });\n};\n`,
  d08_shorthand_after: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  const stdio = "inherit" as const;\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", stdio });\n};\n`,
};

const all = Object.entries(GROUPS).flatMap(([g, cases]) => Object.entries(cases).map(([id, c]) => ({ g, id, c })));

// the fixtures share one program
const program = createProgram(Object.fromEntries(all.map((x) => [`${P}/${x.id}.ts`, x.c.src])));
const violations = (id: string): string[] => {
  const files = filesUnder(program, `${P}/${id}.ts`);
  return [...guard.outputViolations(program, files).map((v) => v.what), ...brandGuard(program, files).map((v) => v.rule)];
};

describe("M2-2-BUILTIN-R4: the fixtures", () => {
  it("every fixture type-checks (the shared program has no type error)", () => {
    const failing = all.filter((x) => typeErrors(program, filesUnder(program, `${P}/${x.id}.ts`)).length > 0).map((x) => x.id);
    expect(failing).toEqual([]);
  });
  for (const [id, src] of Object.entries(TYPE_ERRORS)) {
    it(`${id}: TypeScript rejects it (a form that cannot be compiled)`, () => {
      const own = createProgram({ [`${P}/${id}.ts`]: src });
      expect(typeErrors(own, filesUnder(own, `${P}/${id}.ts`)).length).toBeGreaterThan(0);
    });
  }
});

for (const [g, cases] of Object.entries(GROUPS)) {
  describe(`M2-2-BUILTIN-R4: ${TITLES[g]}`, () => {
    for (const [id, c] of Object.entries(cases)) {
      it(`${id}: ${c.reported ? "reported" : "not reported"}`, () => {
        const v = violations(id);
        if (c.reported) expect(v).not.toEqual([]);
        else expect(v).toEqual([]);
      });
    }
  });
}

describe("M2-2-BUILTIN-R4: src/", () => {
  it("src/ has no violation (output guard and brand guard)", () => {
    const real = createProgram();
    expect(guard.outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
    expect(brandGuard(real, filesUnder(real, "src/"))).toEqual([]);
  });
});
