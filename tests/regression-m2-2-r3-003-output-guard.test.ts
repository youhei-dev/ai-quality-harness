/**
 * M2-2-R3-003 (Medium, fixed in v0.5.4): the output guard (tests/structure/output-guard.ts) resolved an element access
 * only when its key was a string literal naming the terminal, so `process[key]` with a key of type "stdout" was not
 * reported — nor, as SP1 found, 14 other dynamic or reflective forms of 24 (`Reflect.get(process, …)`,
 * `(process as any).stdout`, `new Function`, fs writes to a descriptor, a child process with stdio "inherit", …); and it
 * allowed src/output.ts as a whole, so a write added there without safeText / safeJson was not reported either (v0.5.3;
 * src/ used none of these forms).
 * Now the objects from which the terminal is one property away (process, globalThis, the node:process module) may only be
 * read by a property name; code the checker cannot see, file descriptors and inherited stdio are violations; and in
 * src/output.ts only the two writers (emitOut, emitErr) reach the terminal, with arguments of type Safe, which only
 * safeText / safeJson create.
 * The fixtures are strings compiled in memory with the repository's tsconfig (every one type-checks).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { outputReferences, outputViolations } from "./structure/output-guard.ts";
import { ROOT, createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/outguard";

/** SP1 §3.3: the reviewer's two forms and the same kind of forms (g23 and g24 are the controls). */
const SP1_FORMS: Record<string, string> = {
  g01_key_literal_type: `const key: "stdout" = "stdout";\nexport const f = (): boolean => process[key].write("x");\n`,
  g02_key_string_cast: `export const f = (key: string): boolean => process[key as "stdout"].write("x");\n`,
  g03_key_concatenated: `export const f = (): boolean => process[("std" + "out") as "stdout"].write("x");\n`,
  g04_console_key_literal: `const key: "log" = "log";\nexport const f = (): void => {\n  console[key]("x");\n};\n`,
  g05_console_key_string: `export const f = (key: string): void => {\n  (console as unknown as Record<string, (s: string) => void>)[key]?.("x");\n};\n`,
  g06_globalthis_key: `const key: "console" = "console";\nexport const f = (): void => {\n  globalThis[key].log("x");\n};\n`,
  g07_globalthis_literal: `export const f = (): void => {\n  globalThis["console"].log("x");\n};\n`,
  g08_reflect_get_literal: `export const f = (): void => {\n  (Reflect.get(process, "stdout") as NodeJS.WriteStream).write("x");\n};\n`,
  g09_reflect_get_string: `export const f = (key: string): void => {\n  (Reflect.get(process, key) as NodeJS.WriteStream).write("x");\n};\n`,
  g10_descriptor_process: `export const f = (): void => {\n  (Object.getOwnPropertyDescriptor(process, "stdout")?.value as NodeJS.WriteStream).write("x");\n};\n`,
  g11_descriptor_globalthis: `export const f = (): void => {\n  (Object.getOwnPropertyDescriptor(globalThis, "console")?.value as Console).log("x");\n};\n`,
  g12_object_values_console: `export const f = (): void => {\n  for (const v of Object.values(console)) if (typeof v === "function") (v as (s: string) => void)("x");\n};\n`,
  g13_cast_any: `export const f = (): void => {\n  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n  (process as any).stdout.write("x");\n};\n`,
  g14_cast_record: `export const f = (): boolean => (process as unknown as Record<string, NodeJS.WriteStream>)["stdout"]!.write("x");\n`,
  g15_computed_destructuring: `const key = "stdout" as const;\nconst { [key]: s } = process;\nexport const f = (): boolean => s.write("x");\n`,
  g16_dynamic_import: `export const f = async (): Promise<boolean> => (await import("node:process")).stdout.write("x");\n`,
  g17_create_require: `import { createRequire } from "node:module";\nconst req = createRequire(import.meta.url);\nexport const f = (): void => {\n  (req("node:process") as NodeJS.Process).stdout.write("x");\n};\n`,
  g18_new_function: `export const f = (): void => {\n  new Function("process.stdout.write('x')")();\n};\n`,
  g19_fs_fd_number: `import { writeSync } from "node:fs";\nexport const f = (fd: number): number => writeSync(fd, "x");\n`,
  g20_fs_fd_option: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("", { fd: 2 }).end("x");\n};\n`,
  g21_fs_dev_tty: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("/dev/tty").end("x");\n};\n`,
  g22_child_inherit: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("echo", ["x"], { stdio: "inherit" });\n};\n`,
  g23_control_direct: `export const f = (): boolean => process.stdout.write("x");\n`,
};

/** Forms of the same kinds beyond SP1's list (found while writing the rules). */
const MORE_FORMS: Record<string, string> = {
  m01_function_constructor: `export const f = (): void => {\n  const make = (() => 0).constructor;\n  make("process.stdout.write('x')")();\n};\n`,
  m02_import_computed: `export const f = async (name: string): Promise<void> => {\n  const m = (await import(name)) as { stdout: { write: (s: string) => boolean } };\n  m.stdout.write("x");\n};\n`,
  m03_vm: `import vm from "node:vm";\nexport const f = (): void => {\n  vm.runInThisContext("process.stdout.write('x')");\n};\n`,
  m04_eval: `export const f = (): void => {\n  globalThis.eval("process.stdout.write('x')");\n};\n`,
  m05_net_socket_fd: `import { Socket } from "node:net";\nexport const f = (): void => {\n  new Socket({ fd: 1 }).write("x");\n};\n`,
  m06_fork_default_stdio: `import { fork } from "node:child_process";\nexport const f = (): void => {\n  fork("child.js");\n};\n`,
  m07_execfilesync_default_stderr: `import { execFileSync } from "node:child_process";\nexport const f = (): void => {\n  execFileSync("git", ["status"], { encoding: "utf8" });\n};\n`,
  m08_stdio_array_inherit: `import { spawn } from "node:child_process";\nexport const f = (): void => {\n  spawn("git", ["status"], { stdio: ["ignore", "inherit", "pipe"] });\n};\n`,
  m09_globalthis_process_key: `const key: "stdout" = "stdout";\nexport const f = (): boolean => globalThis.process[key].write("x");\n`,
  m10_widened_to_object: `const p: object = process;\nexport const f = (): void => {\n  (Reflect.get(p, "stdout") as NodeJS.WriteStream).write("x");\n};\n`,
  m11_rest_destructuring: `const { exitCode, ...rest } = process;\nexport const f = (): boolean => (exitCode === undefined ? (rest as unknown as Record<string, NodeJS.WriteStream>)["stdout"]!.write("x") : false);\n`,
  m12_fs_copy_to_dev: `import { copyFileSync } from "node:fs";\nexport const f = (): void => {\n  copyFileSync("a.txt", "/dev/stdout");\n};\n`,
};

/** Not the terminal (controls, never reported). */
const NOT_TERMINAL: Record<string, string> = {
  c01_env_key: `export const f = (key: string): string | undefined => process.env[key];\n`,
  c02_exitcode_literal: `export const f = (): void => {\n  process["exitCode"] = 1;\n};\n`,
  c03_static_destructuring: `const { env, platform } = process;\nexport const f = (): string => \`\${platform} \${Object.keys(env).length}\`;\n`,
  c04_child_piped: `import { spawnSync } from "node:child_process";\nexport const f = (): string => spawnSync("git", ["status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).stdout;\n`,
  c05_fs_file_and_read_fd: `import { closeSync, openSync, readSync, writeFileSync } from "node:fs";\nexport const f = (file: string): number => {\n  writeFileSync(file, "x");\n  const fd = openSync(file, "r");\n  const n = readSync(fd, Buffer.alloc(1));\n  closeSync(fd);\n  return n;\n};\n`,
};

/**
 * src/output.ts with additions (the markers name them). Writes that bypass safeText / safeJson (outside the writers, or
 * inside a writer without a Safe value) and Safe made without safeText / safeJson.
 */
const OUTPUT_TS = readFileSync(path.join(ROOT, "src", "output.ts"), "utf8");
const BYPASS: Record<string, string> = {
  b01_console_error_raw: `export function rawError(raw: string): void {\n  console.error(raw); // b01_console_error_raw\n}\n`,
  b02_stdout_write_raw: `export function rawOut(raw: string): void {\n  process.stdout.write(raw); // b02_stdout_write_raw\n}\n`,
  b03_stderr_in_object: `export const RAW = { write: (s: string): boolean => process.stderr.write(s) }; // b03_stderr_in_object\n`,
};
const FORGED: Record<string, string> = {
  s01_cast_to_safe: `export function castOut(raw: string): void {\n  emitOut(raw as Safe, true); // s01_cast_to_safe\n}\n`,
  s02_type_predicate: `const isSafe = (s: string): s is Safe => s.length >= 0; // s02_type_predicate\nexport function predicateOut(raw: string): void {\n  if (isSafe(raw)) emitOut(raw, true);\n}\n`,
  s03_any_into_safe: `export function anyOut(raw: string): void {\n  emitOut(JSON.parse(raw), true); // s03_any_into_safe\n}\n`,
};
/** Inside a writer: a second argument that is not Safe, and a stream kept in a variable. */
const IN_WRITER: Record<string, [string, string]> = {
  w01_argument_not_safe: ["  if (line) console.log(text);\n", "  if (line) console.log(text, String(text)); // w01_argument_not_safe\n"],
  w02_stream_in_variable: ["  else process.stderr.write(text);\n", "  else {\n    const stream = process.stderr; // w02_stream_in_variable\n    stream.write(text);\n  }\n"],
};
let copy = `${OUTPUT_TS}\n${Object.values(BYPASS).join("")}${Object.values(FORGED).join("")}`;
for (const [from, to] of Object.values(IN_WRITER)) copy = copy.replace(from, to);
const lineOf = (marker: string): string => `src/output.ts:${copy.split("\n").findIndex((l) => l.includes(`// ${marker}`)) + 1}`;

const all = { ...SP1_FORMS, ...MORE_FORMS, ...NOT_TERMINAL };
const fixtures = { ...Object.fromEntries(Object.entries(all).map(([name, text]) => [`${P}/${name}.ts`, text])), "src/output.ts": copy };
const program = createProgram(fixtures);
const real = createProgram();

const reported = (names: readonly string[]): string[] => {
  const v = outputViolations(program, filesUnder(program, P));
  return names.filter((name) => v.some((r) => r.where.startsWith(`${P}/${name}.ts:`)));
};

describe("M2-2-R3-003: the output guard reports every dynamic or reflective way to the terminal", () => {
  it("every fixture type-checks (tsc accepts each form; the copy of src/output.ts with its additions)", () => {
    expect(typeErrors(program, [...filesUnder(program, P), ...filesUnder(program, "src/output.ts")])).toEqual([]);
  });

  it("every dynamic or reflective way to reach the terminal is reported (SP1: g01-g22, and the control g23)", () => {
    expect(reported(Object.keys(SP1_FORMS))).toEqual(Object.keys(SP1_FORMS));
  });

  it("the same kinds beyond SP1's list are reported (a Function value, import() of a computed module, node:vm, eval, an fd option, default stdio, …)", () => {
    expect(reported(Object.keys(MORE_FORMS))).toEqual(Object.keys(MORE_FORMS));
  });

  it("non-terminal dynamic access is not reported (process.env[key], process[\"exitCode\"], static destructuring, piped children, file writes)", () => {
    expect(reported(Object.keys(NOT_TERMINAL))).toEqual([]);
    expect(outputReferences(program, filesUnder(program, `${P}/c`))).toEqual([]);
  });
});

describe("M2-2-R3-003: inside src/output.ts only the two writers reach the terminal, with Safe values", () => {
  const violations = outputViolations(program, filesUnder(program, "src/"));

  it("a write inside src/output.ts that does not go through safeText / safeJson is reported (outside the writers, or in a writer)", () => {
    const markers = [...Object.keys(BYPASS), ...Object.keys(IN_WRITER)];
    expect(markers.filter((m) => !violations.some((v) => v.where === lineOf(m)))).toEqual([]);
  });

  it("a Safe made without safeText / safeJson is reported (a cast, a type predicate, an any value)", () => {
    expect(Object.keys(FORGED).filter((m) => !violations.some((v) => v.where === lineOf(m)))).toEqual([]);
  });

  it("src/ has no violation, and every terminal reference of src/ is inside emitOut / emitErr", () => {
    expect(outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
    const sf = real.program.getSourceFiles().find((f) => real.rel(f) === "src/output.ts");
    if (sf === undefined) throw new Error("src/output.ts not in the program");
    const writerLines = new Set<number>();
    sf.forEachChild((n) => {
      if (ts.isFunctionDeclaration(n) && (n.name?.text === "emitOut" || n.name?.text === "emitErr")) {
        const from = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        const to = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
        for (let l = from; l <= to; l++) writerLines.add(l);
      }
    });
    const refs = outputReferences(real, filesUnder(real, "src/"));
    expect(refs.map((r) => r.what).sort()).toEqual(["console", "console", "process.stderr", "process.stdout"]);
    expect(refs.filter((r) => !(r.where.startsWith("src/output.ts:") && writerLines.has(Number(r.where.split(":")[1]))))).toEqual([]);
  });
});
