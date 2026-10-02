/**
 * M2-2-BUILTIN-R6 (High 4, all forms that can be written without care; 0 places in src/; ADR-0019, decision 7 and the table of
 * entrances): v0.5.22 closed the entrance of the fs / child_process functions at the import of the module, but (R6-001) let a named
 * function be exported again, so the local module that exports it is a namespace of those functions that a helper with a local interface
 * can take; (R6-002) found `new Utf8Stream` only where the constructor keeps its declaration, not through a local construct signature;
 * (R6-003) looked for the registration method of a listener only as `process.on`, not as `process["on"]`; (R6-004) followed the alias of a
 * listener through a variable or a property assignment, three steps at most, not through a shorthand property or a class field.
 * The fix: exporting an fs / child_process function by name is a violation (with or without `from`; `export type` / `{ type x }` are not);
 * `Utf8Stream` is not imported or exported as a value (a type is); a registration method written as a literal element access is checked like
 * the property access; the alias is followed through every declaration that hands the value on, once per declaration (a cycle ends).
 * Each fixture below is a string compiled in memory with the repository's tsconfig and type-checks. `reported: false` on a form that runs the
 * forbidden way is a known limit of ADR-0019 (a listener in a record, an array, a parameter, a call's result, a getter), not a pass. The
 * guards are imported as namespaces so that this file also runs against the v0.5.22 guards, where the forms that expect a report fail on
 * their own (the record of the failures before the fix). This last fix was not reviewed again by an independent reviewer.
 */
import { describe, expect, it } from "vitest";
import { brandGuard } from "./structure/brand-guard.ts";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/r6";

/** A fixture: a source string. `reported`: the guards report it. */
interface Case {
  reported: boolean;
  src: string;
}


/** R6-001: an fs / child_process function exported by name (single-file forms; the forms that span files are in TWO_FILES) */
const R6_001: Record<string, Case> = {
  a10_export_type: { reported: false, src: `export type { Stats } from "node:fs";\n` },
  a11_export_inline_type: { reported: false, src: `export { type Stats } from "node:fs";\n` },
  a12_path_reexport: { reported: false, src: `export { join } from "node:path";\n` },
  a14_crypto_reexport: { reported: false, src: `export { createHash } from "node:crypto";\n` },
};

/** R6-002: Utf8Stream as a value (a type is not) */
const R6_002: Record<string, Case> = {
  b01_ctor_param_interface: { reported: true, src: `import { Utf8Stream } from "node:fs";\ninterface Ctor {\n  new (o: { dest: string; sync: boolean }): { write(s: string): boolean; end(): void };\n}\nconst make = (C: Ctor): void => {\n  const s = new C({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\nexport const f = (): void => {\n  make(Utf8Stream);\n};\n` },
  b02_ctor_di_slot: { reported: true, src: `import { Utf8Stream } from "node:fs";\ninterface Ctor {\n  new (o: { dest: string; sync: boolean }): { write(s: string): boolean; end(): void };\n}\nconst deps: { Stream: Ctor } = { Stream: Utf8Stream };\nexport const f = (): void => {\n  const s = new deps.Stream({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  b03_const_alias: { reported: true, src: `import { Utf8Stream } from "node:fs";\nconst C = Utf8Stream;\nexport const f = (): void => {\n  const s = new C({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  b04_import_alias: { reported: true, src: `import { Utf8Stream as X } from "node:fs";\nexport const f = (): void => {\n  const s = new X({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  b05_factory_helper: { reported: true, src: `import { Utf8Stream } from "node:fs";\ninterface Ctor {\n  new (o: { dest: string; sync: boolean }): { write(s: string): boolean; end(): void };\n}\nconst pick = (): Ctor => Utf8Stream;\nexport const f = (): void => {\n  const s = new (pick())({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  b06_direct_new: { reported: true, src: `import { Utf8Stream } from "node:fs";\nexport const f = (): void => {\n  const s = new Utf8Stream({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  b07_import_type: { reported: false, src: `import type { Utf8Stream } from "node:fs";\nexport type U = Utf8Stream;\n` },
  b08_inline_type_import: { reported: false, src: `import { type Utf8Stream } from "node:fs";\nexport type U = Utf8Stream;\n` },
  b09_value_import_type_use: { reported: true, src: `import { Utf8Stream } from "node:fs";\nexport const f = (s: Utf8Stream): void => {\n  s.end();\n};\n` },
  b10_reexport_value: { reported: true, src: `export { Utf8Stream } from "node:fs";\n` },
  b11_reexport_type: { reported: false, src: `export type { Utf8Stream } from "node:fs";\n` },
};

/** R6-003: the registration method of a listener written as a literal element access */
const R6_003: Record<string, Case> = {
  c01_on_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["on"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c02_once_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["once"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c03_addListener_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["addListener"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c04_prependListener_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["prependListener"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c05_prependOnceListener_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["prependOnceListener"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c06_globalthis_process_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  globalThis.process["once"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c07_as_node_process_element: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  (process as NodeJS.Process)["on"]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c08_template_key: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process[\`on\`]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c09_as_const_key: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["on" as const]("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c10_property_access_control: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.on("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  c11_element_bind_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["on"]("SIGUSR2", r.onEvent.bind(r));\n  process.emit("SIGUSR2");\n};\n` },
  c12_element_arrow_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process["on"]("SIGUSR2", () => r.onEvent());\n  process.emit("SIGUSR2");\n};\n` },
  c13_element_no_this_control: { reported: false, src: `function quiet(): void {\n  return;\n}\nexport const f = (): void => {\n  process["on"]("SIGUSR2", quiet);\n};\n` },
  c14_dynamic_key_control: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (k: "on" | "once"): void => {\n  const r = new Reporter();\n  process[k]("SIGUSR2", r.onEvent);\n};\n` },
};

/** R6-004: the alias of a listener (shorthand property, class field, any number of steps, a cycle); the forms not followed are known limits */
const R6_004: Record<string, Case> = {
  d01_shorthand_property: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const h = r.onEvent;\n  const box = { h };\n  process.on("SIGUSR2", box.h);\n  process.emit("SIGUSR2");\n};\n` },
  d02_class_field_method_ref: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nclass Holder {\n  h = new Reporter().onEvent;\n}\nexport const f = (): void => {\n  process.on("SIGUSR2", new Holder().h);\n  process.emit("SIGUSR2");\n};\n` },
  d03_class_field_function_expression: { reported: true, src: `class Holder {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  h = function (this: { stdout: { write(s: string): boolean } }): void {\n    this.stdout.write("x");\n  };\n}\nexport const f = (): void => {\n  process.on("SIGUSR2", new Holder().h);\n  process.emit("SIGUSR2");\n};\n` },
  d04_class_field_arrow_control: { reported: false, src: `class Holder {\n  n = 0;\n  h = (): void => {\n    this.n += 1;\n  };\n}\nexport const f = (): void => {\n  process.on("SIGUSR2", new Holder().h);\n  process.emit("SIGUSR2");\n};\n` },
  d05_alias_2: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const a = r.onEvent;\n  const b = a;\n  process.on("SIGUSR2", b);\n  process.emit("SIGUSR2");\n};\n` },
  d06_alias_3: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const a = r.onEvent;\n  const b = a;\n  const c = b;\n  process.on("SIGUSR2", c);\n  process.emit("SIGUSR2");\n};\n` },
  d07_alias_4: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const a = r.onEvent;\n  const b = a;\n  const c = b;\n  const d = c;\n  process.on("SIGUSR2", d);\n  process.emit("SIGUSR2");\n};\n` },
  d08_alias_5: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const a = r.onEvent;\n  const b = a;\n  const c = b;\n  const d = c;\n  const e = d;\n  process.on("SIGUSR2", e);\n  process.emit("SIGUSR2");\n};\n` },
  d09_property_chain_4: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const o1 = { a: r.onEvent };\n  const o2 = { b: o1.a };\n  const o3 = { c: o2.b };\n  const o4 = { d: o3.c };\n  process.on("SIGUSR2", o4.d);\n  process.emit("SIGUSR2");\n};\n` },
  d10_cycle: { reported: false, src: `var a: (() => void) | undefined = b;\nvar b: (() => void) | undefined = a;\nexport const f = (): void => {\n  process.on("SIGUSR2", a!);\n};\n` },
  d11_getter: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const o = {\n    get h(): () => void {\n      return r.onEvent;\n    },\n  };\n  process.on("SIGUSR2", o.h);\n  process.emit("SIGUSR2");\n};\n` },
  d12_record_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\ntype Sig = "SIGUSR2" | "SIGINT";\nexport const f = (): void => {\n  const r = new Reporter();\n  const handlers: Record<Sig, () => void> = { SIGUSR2: r.onEvent, SIGINT: r.onEvent };\n  const sig: Sig = "SIGUSR2";\n  process.on(sig, handlers[sig]);\n  process.emit("SIGUSR2");\n};\n` },
  d13_array_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const hs = [r.onEvent];\n  process.on("SIGUSR2", hs[0] ?? (() => undefined));\n  process.emit("SIGUSR2");\n};\n` },
  d14_parameter_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nconst reg = (l: () => void): void => {\n  process.on("SIGUSR2", l);\n};\nexport const f = (): void => {\n  reg(new Reporter().onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  d15_return_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nconst get = (): (() => void) => new Reporter().onEvent;\nexport const f = (): void => {\n  process.on("SIGUSR2", get());\n  process.emit("SIGUSR2");\n};\n` },
  d16_src_form_control: { reported: false, src: `type Sig = "SIGUSR2" | "SIGINT";\nexport const f = (): void => {\n  const handlers: Record<Sig, () => void> = { SIGUSR2: () => undefined, SIGINT: () => undefined };\n  const sig: Sig = "SIGUSR2";\n  process.on(sig, handlers[sig]);\n  process.off(sig, handlers[sig]);\n};\n` },
};

const GROUPS: Record<string, Record<string, Case>> = { R6_001, R6_002, R6_003, R6_004 };
const TITLES: Record<string, string> = {
  R6_001: "R6-001: an fs / child_process function exported by name (with or without `from`) is a violation; a type, a function of another module and a value that is not a function are not",
  R6_002: "R6-002: Utf8Stream imported or exported as a value is a violation (also when only a local construct signature `new`s it); the type is not",
  R6_003: "R6-003: process['on'] and the other registration methods written as a literal element access are checked like process.on; controls",
  R6_004: "R6-004: the alias of a listener through a shorthand property, a class field and any number of steps; a cycle ends; a record, an array, a parameter and a return value are known limits",
};

/** The forms that span files (a module that exports an fs function, then the file that uses it). The files sit directly under src/ (the module rule needs a source file of src/). */
const TWO_FILES: Record<string, { reported: boolean; files: Record<string, string> }> = {
  a01_reexport_ns_to_interface: { reported: true, files: {
    "src/zz-r6-a01_reexport_ns_to_interfacea.ts": `export { writeFileSync } from "node:fs";\n`,
    "src/zz-r6-a01_reexport_ns_to_interfaceb.ts": `import * as w from "./zz-r6-a01_reexport_ns_to_interfacea.ts";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(w);\n};\n`,
  } },
  a02_reexport_renamed: { reported: true, files: {
    "src/zz-r6-a02_reexport_renameda.ts": `export { writeFileSync as wf } from "node:fs";\n`,
    "src/zz-r6-a02_reexport_renamedb.ts": `import * as w from "./zz-r6-a02_reexport_renameda.ts";\ninterface Wf {\n  wf(p: string, d: string): void;\n}\nconst put = (io: Wf): void => {\n  io.wf("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(w);\n};\n`,
  } },
  a03_child_reexport: { reported: true, files: {
    "src/zz-r6-a03_child_reexporta.ts": `export { spawnSync } from "node:child_process";\n`,
    "src/zz-r6-a03_child_reexportb.ts": `import * as c from "./zz-r6-a03_child_reexporta.ts";\ninterface Sp {\n  spawnSync(c: string, a: string[], o: object): unknown;\n}\nconst run = (m: Sp): void => {\n  m.spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\nexport const f = (): void => {\n  run(c);\n};\n`,
  } },
  a04_reexport_dynamic_import: { reported: true, files: {
    "src/zz-r6-a04_reexport_dynamic_importa.ts": `export { writeFileSync } from "node:fs";\n`,
    "src/zz-r6-a04_reexport_dynamic_importb.ts": `interface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = async (): Promise<void> => {\n  put(await import("./zz-r6-a04_reexport_dynamic_importa.ts"));\n};\n`,
  } },
  a05_reexport_chain: { reported: true, files: {
    "src/zz-r6-a05_reexport_chaina.ts": `export { writeFileSync } from "node:fs";\n`,
    "src/zz-r6-a05_reexport_chainc.ts": `export * from "./zz-r6-a05_reexport_chaina.ts";\n`,
    "src/zz-r6-a05_reexport_chainb.ts": `import * as w from "./zz-r6-a05_reexport_chainc.ts";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(w);\n};\n`,
  } },
  a06_import_then_export: { reported: true, files: {
    "src/zz-r6-a06_import_then_exporta.ts": `import { writeFileSync } from "node:fs";\nexport { writeFileSync };\n`,
    "src/zz-r6-a06_import_then_exportb.ts": `import * as w from "./zz-r6-a06_import_then_exporta.ts";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(w);\n};\n`,
  } },
  a07_import_then_export_alias: { reported: true, files: {
    "src/zz-r6-a07_import_then_export_aliasa.ts": `import { writeFileSync } from "node:fs";\nexport { writeFileSync as wf };\n`,
    "src/zz-r6-a07_import_then_export_aliasb.ts": `import * as w from "./zz-r6-a07_import_then_export_aliasa.ts";\ninterface Wf {\n  wf(p: string, d: string): void;\n}\nconst put = (io: Wf): void => {\n  io.wf("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(w);\n};\n`,
  } },
  a08_read_function_reexport: { reported: true, files: {
    "src/zz-r6-a08_read_function_reexporta.ts": `export { readFileSync } from "node:fs";\n`,
    "src/zz-r6-a08_read_function_reexportb.ts": `import { readFileSync } from "./zz-r6-a08_read_function_reexporta.ts";\nexport const f = (): string => readFileSync("package.json", "utf8");\n`,
  } },
  a09_named_import_of_reexport_call: { reported: true, files: {
    "src/zz-r6-a09_named_import_of_reexport_calla.ts": `export { writeFileSync } from "node:fs";\n`,
    "src/zz-r6-a09_named_import_of_reexport_callb.ts": `import { writeFileSync } from "./zz-r6-a09_named_import_of_reexport_calla.ts";\nexport const f = (): void => {\n  writeFileSync("/dev/stdout", "x");\n};\n`,
  } },
  a13_local_const_reexport: { reported: false, files: {
    "src/zz-r6-a13_local_const_reexporta.ts": `export const x = 1;\n`,
    "src/zz-r6-a13_local_const_reexportb.ts": `export { x } from "./zz-r6-a13_local_const_reexporta.ts";\n`,
  } },
};

const all = Object.entries(GROUPS).flatMap(([g, cases]) => Object.entries(cases).map(([id, c]) => ({ g, id, c })));

// the single-file fixtures share one program
const program = createProgram(Object.fromEntries(all.map((x) => [`${P}/${x.id}.ts`, x.c.src])));
const violations = (id: string): string[] => {
  const files = filesUnder(program, `${P}/${id}.ts`);
  return [...guard.outputViolations(program, files).map((v) => v.what), ...brandGuard(program, files).map((v) => v.rule)];
};
const twoProgram = createProgram(Object.assign({}, ...Object.values(TWO_FILES).map((t) => t.files)));
const twoViolations = (id: string): string[] => {
  const files = Object.keys(TWO_FILES[id]?.files ?? {}).flatMap((f) => filesUnder(twoProgram, f));
  return [...guard.outputViolations(twoProgram, files).map((v) => v.what), ...brandGuard(twoProgram, files).map((v) => v.rule)];
};

describe("M2-2-BUILTIN-R6: the fixtures", () => {
  it("every single-file fixture type-checks (the shared program has no type error)", () => {
    const failing = all.filter((x) => typeErrors(program, filesUnder(program, `${P}/${x.id}.ts`)).length > 0).map((x) => x.id);
    expect(failing).toEqual([]);
  });
  it("the forms that span files type-check", () => {
    const failing = Object.entries(TWO_FILES).filter(([, t]) => Object.keys(t.files).flatMap((f) => typeErrors(twoProgram, filesUnder(twoProgram, f))).length > 0).map(([id]) => id);
    expect(failing).toEqual([]);
  });
});

for (const [g, cases] of Object.entries(GROUPS)) {
  describe(`M2-2-BUILTIN-R6: ${TITLES[g]}`, () => {
    for (const [id, c] of Object.entries(cases)) {
      it(`${id}: ${c.reported ? "reported" : "not reported"}`, () => {
        const v = violations(id);
        if (c.reported) expect(v).not.toEqual([]);
        else expect(v).toEqual([]);
      });
    }
  });
}

describe("M2-2-BUILTIN-R6-001: the forms that span files (a module that exports an fs / child_process function, then the file that uses it)", () => {
  for (const [id, t] of Object.entries(TWO_FILES)) {
    it(`${id}: ${t.reported ? "reported" : "not reported"}`, () => {
      if (t.reported) expect(twoViolations(id)).not.toEqual([]);
      else expect(twoViolations(id)).toEqual([]);
    });
  }
});

describe("M2-2-BUILTIN-R6: src/", () => {
  it("has no violation of the output guard or the brand guard", () => {
    const real = createProgram();
    const files = filesUnder(real, "src/");
    expect(files.length).toBeGreaterThan(30);
    expect(guard.outputViolations(real, files)).toEqual([]);
    expect(brandGuard(real, files)).toEqual([]);
  });
});

