/**
 * M2-2-BUILTIN-R3 (High 7 / Medium 1; ADR-0019, decision 7): the structure guards (tests/structure/output-guard.ts, brand-guard.ts)
 * still allowed things by a name or by a static type where decision 7 of v0.5.19 said "syntax or declaration": the writer
 * of src/output.ts (a union with one Safe branch, any terminal member, a same-named local declaration), the creators and callers of
 * the brands (a same-named local declaration), generic casts (an optional / default / rest / callback parameter carrying T),
 * child stdio (a spread after it), fd targets (a number shown as a string), fs and child_process calls (the function copied into
 * another function type, or called with .call / .apply / Reflect.apply), `.constructor` (behind as const / satisfies / !), and the
 * fs path check (every argument, so a data string that looks like a device path was reported). SP1 also found an fd option in a
 * spread / a variable / a wrapper and two caller-name forms in brand-guard. Each fixture below is a string compiled in memory
 * with the repository's tsconfig and type-checks (one form is rejected by TypeScript itself: the spread after stdio with a
 * literal; it is listed to record that). A fixture that modifies src/output.ts or a brand file is compiled as a copy of that
 * file (the writers and creators are recognized by the file's path). `reported: false` on a form that runs the forbidden way
 * is a known limit of ADR-0019, not a pass. The guards are imported as namespaces so that this file also runs against the
 * v0.5.19 guards, where the forms that expect a report fail on their own (the record of the failures before the fix).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import { brandGuard } from "./structure/brand-guard.ts";
import * as guard from "./structure/output-guard.ts";
import { ROOT, createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/r3";

/** A fixture: a source string, or an edit of a repository file (replace, then append). `reported`: the guards report it. */
interface Case {
  reported: boolean;
  src?: string;
  file?: string;
  replace?: [string, string][];
  append?: string;
}

/** R3-001: a writer of src/output.ts calls exactly its own terminal member with one argument that is Safe in every branch */
const R1: Record<string, Case> = {
  r1a_union_safe_error: { reported: true, file: "src/output.ts", replace: [["function emitOut(text: Safe, line: boolean)", "function emitOut(text: Safe | Error, line: boolean)"], ["else process.stdout.write(text);", "else process.stdout.write(text instanceof Error ? \"\" : text);"]], append: `\nexport function leakOut(e: Error): void {\n  emitOut(e, true);\n}\n` },
  r1g_union_safe_string: { reported: true, file: "src/output.ts", replace: [["function emitOut(text: Safe, line: boolean)", "function emitOut(text: Safe | string, line: boolean)"]], append: `\nexport function leakOut2(raw: string): void {\n  emitOut(raw, true);\n}\n` },
  r1h_control_plain_string: { reported: true, file: "src/output.ts", replace: [["function emitOut(text: Safe, line: boolean)", "function emitOut(text: string, line: boolean)"]] },
  r1b_console_trace: { reported: true, file: "src/output.ts", replace: [["if (line) console.log(text);", "if (line) console.trace(text);"]] },
  r1c_console_trace_no_arg: { reported: true, file: "src/output.ts", replace: [["if (line) console.log(text);", "if (line) console.trace();"]] },
  r1d_console_warn: { reported: true, file: "src/output.ts", replace: [["if (line) console.log(text);", "if (line) console.warn(text);"]] },
  r1e_stdout_end: { reported: true, file: "src/output.ts", replace: [["else process.stdout.write(text);", "else process.stdout.end(text);"]] },
  r1f_control_real: { reported: false, file: "src/output.ts", append: `` },
};

/** R3-002: a writer / a creator of a brand is the top-level declaration of that name, not a local one of the same name (also K2: the callers of the issuers) */
const R2: Record<string, Case> = {
  r2a_local_safetext: { reported: true, file: "src/output.ts", append: `\nexport function forgeA(raw: string): Safe {\n  const safeText = (s: string): Safe => s as Safe;\n  return safeText(raw);\n}\n` },
  r2b_method_safetext: { reported: true, file: "src/output.ts", append: `\nexport class ForgeB {\n  safeText(raw: string): Safe {\n    return raw as Safe;\n  }\n}\n` },
  r2c_nested_emitout: { reported: true, file: "src/output.ts", append: `\nexport function other(t: Safe): void {\n  const emitOut = (x: Safe): void => {\n    console.log(x);\n  };\n  emitOut(t);\n}\n` },
  r2d_local_safejson: { reported: true, file: "src/output.ts", append: `\nexport function forgeD(raw: string): Safe {\n  const safeJson = (s: string): Safe => s as Safe;\n  return safeJson(raw);\n}\n` },
  r2h_control_outside_creator: { reported: true, file: "src/output.ts", append: `\nexport function plainForge(raw: string): Safe {\n  return raw as Safe;\n}\n` },
  r2i_control_outside_creator_checked: { reported: true, file: "src/review/checked.ts", append: `\nexport function plainForgeChecked(raw: string): Checked {\n  return raw as Checked;\n}\n` },
  r2e_local_issue_checked: { reported: true, file: "src/review/checked.ts", append: `\nexport function forgeChecked(raw: string): Checked {\n  const issue = (v: string): Checked => v as Checked;\n  return issue(raw);\n}\n` },
  r2f_local_issuemd: { reported: true, file: "src/review/packet.ts", append: `\nexport function forgeMd(raw: string): Md {\n  const issueMd = (v: string): Md => v as Md;\n  return issueMd(raw);\n}\n` },
  r2g_local_rejected: { reported: true, file: "src/review/checked.ts", append: `\nexport function forgeRejected(): Rejected {\n  const REJECTED = { rejected: true } as unknown as Rejected;\n  return REJECTED;\n}\n` },
  r2j_local_md_caller: { reported: true, file: "src/review/packet.ts", append: `\nexport function forgeMd2(raw: string): Md {\n  const md = (s: string): Md => issueMd(s);\n  return md(raw);\n}\n` },
  r2k_local_checkvalue_caller: { reported: true, file: "src/review/checked.ts", append: `\nexport function forgeChecked2(raw: string): Checked {\n  const checkValue = (s: string): Checked => issue(s);\n  return checkValue(raw);\n}\n` },
};

/** R3-003: a generic cast is allowed only where a required parameter is of type T itself */
const R3: Record<string, Case> = {
  r3a_optional_param: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, x?: T): T | undefined => (x === undefined ? (raw as T) : x);\nexport const f = (): Safe | undefined => cast<Safe>("raw");\n` },
  r3b_default_param: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, x: T = raw as unknown as T): T => x;\nexport const f = (): Safe => cast<Safe>("raw");\n` },
  r3c_rest_param: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, ..._xs: T[]): T => raw as T;\nexport const f = (): Safe => cast<Safe>("raw");\n` },
  r3d_callback_carrier: { reported: true, src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(raw: string, _cb: (v: T) => void): T => raw as T;\nexport const f = (): Safe => cast<Safe>("raw", () => undefined);\n` },
  r3i_required_t_unrelated_value: { reported: false, src: `import type { Safe } from "../../../src/output.ts";\nconst cast = <T>(_x: T, raw: string): T => raw as T;\nexport const f = (real: Safe): Safe => cast(real, "raw");\n` },
  r3e_required_exactly_t: { reported: false, src: `const id = <T>(value: T): T => value as T;\nexport const f = (): number => id(1);\n` },
  r3f_required_array_of_t: { reported: true, src: `const first = <T>(xs: T[]): T => xs[0] as T;\nexport const f = (): number => first([1]);\n` },
  r3g_required_wrapped_t: { reported: true, src: `const unwrap = <T>(o: { v: unknown; t?: T }): T => o.v as T;\nexport const f = (): number => unwrap<number>({ v: 1 });\n` },
  r3h_optional_brand_checked: { reported: true, src: `import type { Checked } from "../../../src/review/checked.ts";\nconst cast = <T>(raw: string, x?: T): T | undefined => (x === undefined ? (raw as T) : x);\nexport const f = (): Checked | undefined => cast<Checked>("raw");\n` },
};

/** R3-004: a spread after stdio can override it */
const R4: Record<string, Case> = {
  r4a_spread_after_stdio: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (opts: { stdio?: "inherit" | "pipe" }): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ...opts });\n};\n` },
  r4b_literal_spread_after: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ...{ stdio: "inherit" as const } });\n};\n` },
  r4c_array_then_spread: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (opts: { stdio?: "inherit" }): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: ["pipe", "pipe", "pipe"], ...opts });\n};\n` },
  r4d_spread_before_stdio: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (opts: { stdio?: "inherit" }): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { ...opts, stdio: "pipe" });\n};\n` },
  r4e_exec_file_sync_spread: { reported: true, src: `import { execFileSync } from "node:child_process";\nexport const f = (opts: { stdio?: "inherit" }): void => {\n  execFileSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ...opts });\n};\n` },
};

/** R3-005: a target whose static type was set by an assertion (the rest is a known limit) */
const R5: Record<string, Case> = {
  r5a_double_assertion: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync(1 as unknown as string, "x");\n};\n` },
  r5b_json_parse_annotation: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  const target: string = JSON.parse("1");\n  writeFileSync(target, "x");\n};\n` },
  r5c_append_file_sync: { reported: true, src: `import { appendFileSync } from "node:fs";\nexport const f = (): void => {\n  appendFileSync(1 as unknown as string, "x");\n};\n` },
  r5d_write_file_callback: { reported: true, src: `import { writeFile } from "node:fs";\nexport const f = (): void => {\n  writeFile(1 as unknown as string, "x", () => undefined);\n};\n` },
  r5e_number_typed_fd: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (fd: number): void => {\n  writeFileSync(fd, "x");\n};\n` },
  r5f_ordinary_path_control: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync(p, "x");\n};\n` },
};

/** R3-006: an fs / child_process function used other than as the callee of a call (K4: call, apply, Reflect.apply) */
const R6: Record<string, Case> = {
  r6a_retype_assertion: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  const w = writeFileSync as unknown as (p: string, d: string) => void;\n  w("/dev/stdout", "x");\n};\n` },
  r6b_retype_assignment: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  const w: (p: string, d: string) => void = writeFileSync;\n  w("/dev/stdout", "x");\n};\n` },
  r6c_typeof_control: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  const w: typeof writeFileSync = writeFileSync;\n  w("/dev/stdout", "x");\n};\n` },
  r6d_di_interface: { reported: true, src: `import { writeFileSync } from "node:fs";\ninterface Deps {\n  write: (p: string, d: string) => void;\n}\nexport const f = (): void => {\n  const deps: Deps = { write: writeFileSync };\n  deps.write("/dev/stdout", "x");\n};\n` },
  r6e_child_retype: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  const sp = spawnSync as unknown as (c: string, a: string[], o: object) => unknown;\n  sp("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\n` },
  r6f_call_method: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync.call(undefined, "/dev/stdout", "x");\n};\n` },
  r6g_apply_method: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync.apply(undefined, ["/dev/stdout", "x"]);\n};\n` },
  r6h_reflect_apply: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  Reflect.apply(writeFileSync, undefined, ["/dev/stdout", "x"]);\n};\n` },
  r6i_bind_method: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync.bind(undefined)("/dev/stdout", "x");\n};\n` },
  r6j_child_call_method: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync.call(undefined, "node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\n` },
  r6k_direct_control: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/dev/stdout", "x");\n};\n` },
};

/** R3-007: `.constructor` through a wrapper that changes only the static type */
const R7: Record<string, Case> = {
  r7a_as_const_key: { reported: true, src: `const g = (): number => 0;\nconst F = g["constructor" as const] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7b_satisfies_key: { reported: true, src: `const g = (): number => 0;\nconst F = g["constructor" satisfies string] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7c_non_null_key: { reported: true, src: `const g = (): number => 0;\nconst F = g["constructor"!] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7d_double_wrapper_key: { reported: true, src: `const g = (): number => 0;\nconst F = g[("constructor" as const)!] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7e_paren_control: { reported: true, src: `const g = (): number => 0;\nconst F = g[("constructor")] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7f_template_control: { reported: true, src: `const g = (): number => 0;\nconst F = g[\`constructor\`] as unknown as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7g_concat_key: { reported: false, src: `const g = (): number => 0;\nconst F = (g as unknown as Record<string, unknown>)["con" + "structor"] as (body: string) => () => unknown;\nexport const f = (): unknown => F("process.stdout.write('x')")();\n` },
  r7h_typed_function_call: { reported: true, src: `const g = (): number => 0;\nexport const f = (): unknown => g["constructor" as const]("return 1")();\n` },
};

/** R3-008: only the path argument of an fs writer is checked for a device path */
const R8: Record<string, Case> = {
  r8a_data_is_device_literal: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync(p, "/dev/stdout");\n};\n` },
  r8b_data_dev_null_note: { reported: false, src: `import { writeFileSync } from "node:fs";\nconst NOTE = "/dev/null";\nexport const f = (p: string): void => {\n  writeFileSync(p, NOTE);\n};\n` },
  r8c_read_proc: { reported: true, src: `import { readFileSync } from "node:fs";\nexport const f = (): string => readFileSync("/proc/self/status", "utf8");\n` },
  r8d_exists_dev_null: { reported: true, src: `import { existsSync } from "node:fs";\nexport const f = (): boolean => existsSync("/dev/null");\n` },
  r8e_copy_to_stdout: { reported: true, src: `import { copyFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  copyFileSync(p, "/dev/stdout");\n};\n` },
  r8f_rename_to_stdout: { reported: true, src: `import { renameSync } from "node:fs";\nexport const f = (p: string): void => {\n  renameSync(p, "/dev/stdout");\n};\n` },
  r8g_plain_options: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string): void => {\n  writeFileSync(p, "x", { encoding: "utf8" });\n};\n` },
};

/** K1: an fd option in a spread, a variable, a wrapper or a computed name */
const XC: Record<string, Case> = {
  xc01_fd_option_spread: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (opts: { fd?: number }): void => {\n  createWriteStream("/tmp/aiqh-x", { ...opts }).write("x");\n};\n` },
  xc02_fd_option_variable: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  const o = { fd: 1 };\n  createWriteStream("/tmp/aiqh-x", o).write("x");\n};\n` },
  xc03_stdio_variable_options: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  const o = { stdio: "pipe" as const };\n  spawnSync("node", ["-e", "0"], o);\n};\n` },
  xc04_stdio_late_assignment: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  const o: { stdio: "pipe" | "inherit" } = { stdio: "pipe" };\n  o.stdio = "inherit";\n  spawnSync("node", ["-e", "process.stdout.write('x')"], o);\n};\n` },
  xc05_key_reassigned: { reported: true, src: `let key: string = "platform";\nkey = "getBuiltinModule";\nexport const f = (): unknown => (process as unknown as Record<string, unknown>)[key];\n` },
  xc06_process_reassigned_property: { reported: false, src: `export const f = (): void => {\n  process.exitCode = 1;\n};\n` },
  xc07_spread_data_options_writefile: { reported: false, src: `import { writeFileSync } from "node:fs";\nexport const f = (p: string, opts: { encoding?: BufferEncoding }): void => {\n  writeFileSync(p, "x", { ...opts });\n};\n` },
  xc08_child_env_spread: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (env: NodeJS.ProcessEnv): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", env: { ...env } });\n};\n` },
};

/** wrappers that change only the static type (as const, satisfies, !, parentheses) */
const XB: Record<string, Case> = {
  xb17_fd_computed_name: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/tmp/aiqh-x", { ["fd"]: 1 }).write("x");\n};\n` },
  xb18_fd_options_as_const: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/tmp/aiqh-x", { fd: 1 } as const).write("x");\n};\n` },
  xb19_fd_options_paren: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/tmp/aiqh-x", ({ fd: 1 })).write("x");\n};\n` },
  xb20_fd_options_satisfies: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/tmp/aiqh-x", { fd: 1 } satisfies object).write("x");\n};\n` },
  xb21_fd_direct_control: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/tmp/aiqh-x", { fd: 1 }).write("x");\n};\n` },
  xb22_callee_comma: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  (Math.max(0), writeFileSync)("/dev/stdout", "x");\n};\n` },
  xb23_callee_paren: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  (writeFileSync)("/dev/stdout", "x");\n};\n` },
  xb24_callee_optional: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync?.("/dev/stdout", "x");\n};\n` },
  xb25_stdio_options_paren: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], ({ stdio: "pipe" }));\n};\n` },
  xb01_holder_key_as_const: { reported: true, src: `export const f = (): string => process["platform" as const];\n` },
  xb02_holder_key_satisfies: { reported: true, src: `export const f = (): string => process["platform" satisfies string];\n` },
  xb03_holder_key_nonnull: { reported: true, src: `export const f = (): string => process["platform"!];\n` },
  xb04_holder_dangerous_key_as_const: { reported: true, src: `export const f = (): void => {\n  process["getBuiltinModule" as const]("node:console").log("x");\n};\n` },
  xb05_stdio_as_const: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe" as const });\n};\n` },
  xb06_stdio_array_as_const: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: ["ignore", "pipe", "pipe"] as const });\n};\n` },
  xb07_stdio_element_as_const: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: ["ignore", "pipe" as const, "pipe"] });\n};\n` },
  xb08_stdio_inherit_as_const: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "inherit" as const });\n};\n` },
  xb09_import_specifier_as_const: { reported: true, src: `export const f = (): Promise<unknown> => import("node:path" as const);\n` },
  xb10_globalthis_eval_as_const: { reported: true, src: `export const f = (): unknown => globalThis["eval" as const]("1");\n` },
  xb11_globalthis_function_satisfies: { reported: true, src: `export const f = (): unknown => (globalThis["Function" satisfies string] as unknown as (b: string) => () => unknown)("return 1")();\n` },
  xb12_device_path_as_const: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/dev/stdout" as const, "x");\n};\n` },
  xb13_holder_paren_nonnull: { reported: true, src: `export const f = (): boolean => (process)!.stdout.write("x");\n` },
  xb14_terminal_key_as_const: { reported: true, src: `export const f = (): boolean => process["stdout" as const].write("x");\n` },
  xb15_console_key_as_const: { reported: true, src: `export const f = (): void => {\n  console["log" as const]("x");\n};\n` },
  xb16_comma_wrapper_eval: { reported: true, src: `export const f = (): unknown => (0, eval)("1");\n` },
};

/** EventEmitter `this`: a listener the checker resolves to its declaration and that uses `this` is reported since v0.5.22 (M2-2-BUILTIN-R5-003: ee01–ee06); a listener in a record is a known limit of ADR-0019 (ee07); controls */
const EE: Record<string, Case> = {
  ee01_function_expression_this_param: { reported: true, src: `type W = { write(s: string): boolean };\nconst K: string = ["std", "out"].join("");\nexport const f = (): void => {\n  process.on("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  process.emit("exit", 0);\n};\n` },
  ee02_object_method_reference: { reported: true, src: `const fake = {\n  stdout: { write: (_s: string): boolean => false },\n  m(): void {\n    this.stdout.write("x");\n  },\n};\nexport const f = (): void => {\n  process.on("exit", fake.m);\n  process.emit("exit", 0);\n};\n` },
  ee03_class_method_reference: { reported: true, src: `class A {\n  readonly stdout = { write: (_s: string): boolean => false };\n  m(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  process.on("exit", new A().m);\n  process.emit("exit", 0);\n};\n` },
  ee04_once_function_expression: { reported: true, src: `type W = { write(s: string): boolean };\nconst K: string = ["std", "out"].join("");\nexport const f = (): void => {\n  process.once("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  process.emit("exit", 0);\n};\n` },
  ee05_globalthis_process_on: { reported: true, src: `type W = { write(s: string): boolean };\nconst K: string = ["std", "out"].join("");\nexport const f = (): void => {\n  globalThis.process.on("exit", function (this: Record<string, W | undefined>) {\n    this[K]?.write("x");\n  });\n  globalThis.process.emit("exit", 0);\n};\n` },
  ee06_function_declaration_this: { reported: true, src: `type W = { write(s: string): boolean };\nconst K: string = ["std", "out"].join("");\nfunction h(this: Record<string, W | undefined>): void {\n  this[K]?.write("x");\n}\nexport const f = (): void => {\n  process.on("exit", h);\n  process.emit("exit", 0);\n};\n` },
  ee07_record_of_handlers: { reported: false, src: `const fake = {\n  stdout: { write: (_s: string): boolean => false },\n  m(): void {\n    this.stdout.write("x");\n  },\n};\nconst table: Record<string, () => void> = { a: fake.m };\nexport const f = (): void => {\n  process.on("exit", table["a"] as () => void);\n  process.emit("exit", 0);\n};\n` },
  ee08_arrow_control: { reported: false, src: `export const f = (): void => {\n  process.on("exit", () => undefined);\n};\n` },
  ee09_handler_table_control: { reported: false, src: `type Handlers = Record<'SIGINT' | 'SIGTERM', () => void>;\nconst from: Handlers = { SIGINT: () => undefined, SIGTERM: () => undefined };\nconst to: Handlers = { SIGINT: () => undefined, SIGTERM: () => undefined };\nexport const f = (): void => {\n  for (const signal of ['SIGINT', 'SIGTERM'] as const) {\n    process.on(signal, to[signal]);\n    process.off(signal, from[signal]);\n  }\n};\n` },
  ee10_function_no_this_control: { reported: false, src: `class A {\n  m(): number {\n    return 1;\n  }\n}\nfunction h(): void {}\nexport const f = (): void => {\n  process.on("exit", h);\n  process.on("exit", new A().m);\n};\n` },
  ee11_arrow_inside_uses_outer_this_control: { reported: false, src: `class A {\n  n = 0;\n  register(): void {\n    process.on("exit", () => {\n      this.n += 1;\n    });\n  }\n}\nexport const f = (): void => new A().register();\n` },
};

/** K3: widening of a branded container (known limit: not reported) */
const BD: Record<string, Case> = {
  bd01_brand_container_depth: { reported: false, src: `import type { Checked } from "../../../src/review/checked.ts";\nexport const f = (c: { a: { b: { c: { d: { e: { v: Checked } } } } } }): { a: { b: { c: { d: { e: { v: string } } } } } } => c;\n` },
  bd02_widen_arrow_expression_body: { reported: false, src: `import type { Checked } from "../../../src/review/checked.ts";\nexport const f = (c: { v: Checked }): { v: string } => c;\n` },
  bd03_widen_return_statement: { reported: true, src: `import type { Checked } from "../../../src/review/checked.ts";\nexport const f = (c: { v: Checked }): { v: string } => {\n  return c;\n};\n` },
  bd04_widen_depth_return_statement: { reported: false, src: `import type { Checked } from "../../../src/review/checked.ts";\nexport const f = (c: { a: { b: { c: { d: { e: { v: Checked } } } } } }): { a: { b: { c: { d: { e: { v: string } } } } } } => {\n  return c;\n};\n` },
};

const GROUPS: Record<string, Record<string, Case>> = { R1, R2, R3, R4, R5, R6, R7, R8, XC, XB, EE, BD };
const TITLES: Record<string, string> = {
  R1: "R3-001: a writer of src/output.ts calls exactly its own terminal member with one argument that is Safe in every branch",
  R2: "R3-002: a writer / a creator of a brand is the top-level declaration of that name, not a local one of the same name (also K2: the callers of the issuers)",
  R3: "R3-003: a generic cast is allowed only where a required parameter is of type T itself",
  R4: "R3-004: a spread after stdio can override it",
  R5: "R3-005: a target whose static type was set by an assertion (the rest is a known limit)",
  R6: "R3-006: an fs / child_process function used other than as the callee of a call (K4: call, apply, Reflect.apply)",
  R7: "R3-007: `.constructor` through a wrapper that changes only the static type",
  R8: "R3-008: only the path argument of an fs writer is checked for a device path",
  XC: "K1: an fd option in a spread, a variable, a wrapper or a computed name",
  XB: "wrappers that change only the static type (as const, satisfies, !, parentheses)",
  EE: "EventEmitter `this`: a direct listener that uses `this` is reported (R5-003); a listener in a record is a known limit (ee07); controls",
  BD: "K3: widening of a branded container (known limit: not reported)",
};

const all = Object.entries(GROUPS).flatMap(([g, cases]) => Object.entries(cases).map(([id, c]) => ({ g, id, c })));
const isEdit = (c: Case): boolean => c.file !== undefined;
const readRepo = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");
const edited = (c: Case): string => {
  let text = readRepo(c.file ?? "");
  for (const [from, to] of c.replace ?? []) {
    if (!text.includes(from)) throw new Error(`edit target not found: ${from}`);
    text = text.replace(from, to);
  }
  return `${text}${c.append ?? ""}`;
};

// the source-only fixtures share one program; each edit of a repository file has a program of its own
const plainProgram = createProgram(Object.fromEntries(all.filter((x) => !isEdit(x.c)).map((x) => [`${P}/${x.id}.ts`, x.c.src ?? ""])));
const violations = (x: { id: string; c: Case }): string[] => {
  if (!isEdit(x.c)) {
    const files = filesUnder(plainProgram, `${P}/${x.id}.ts`);
    return [...guard.outputViolations(plainProgram, files).map((v) => v.what), ...brandGuard(plainProgram, files).map((v) => v.rule)];
  }
  const file = x.c.file ?? "";
  const program = createProgram({ [file]: edited(x.c) });
  const files = filesUnder(program, file);
  return [...guard.outputViolations(program, files).map((v) => v.what), ...brandGuard(program, files).map((v) => v.rule)];
};

describe("M2-2-BUILTIN-R3: the fixtures", () => {
  it("every source-only fixture type-checks, except the spread after stdio with a literal (TS2783)", () => {
    const failing = all.filter((x) => !isEdit(x.c) && typeErrors(plainProgram, filesUnder(plainProgram, `${P}/${x.id}.ts`)).length > 0).map((x) => x.id);
    expect(failing).toEqual(["r4b_literal_spread_after"]);
  });
  it("every edit of a repository file type-checks", () => {
    const failing = all.filter((x) => isEdit(x.c)).filter((x) => {
      const file = x.c.file ?? "";
      const program = createProgram({ [file]: edited(x.c) });
      return typeErrors(program, filesUnder(program, file) as ts.SourceFile[]).length > 0;
    });
    expect(failing.map((x) => x.id)).toEqual([]);
  });
});

for (const [g, cases] of Object.entries(GROUPS)) {
  describe(`M2-2-BUILTIN-R3: ${TITLES[g]}`, () => {
    for (const [id, c] of Object.entries(cases)) {
      it(`${id}: ${c.reported ? "reported" : "not reported"}`, () => {
        const v = violations({ id, c });
        if (c.reported) expect(v).not.toEqual([]);
        else expect(v).toEqual([]);
      });
    }
  });
}

describe("M2-2-BUILTIN-R3: src/", () => {
  it("src/ has no violation (output guard and brand guard)", () => {
    const real = createProgram();
    expect(guard.outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
    expect(brandGuard(real, filesUnder(real, "src/"))).toEqual([]);
  });
});
