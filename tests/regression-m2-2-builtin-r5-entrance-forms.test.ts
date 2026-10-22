/**
 * M2-2-BUILTIN-R5 (High 2 / Medium 1 / Low 1; ADR-0019, decision 7 and the table of entrances): the guard followed the uses of an fs /
 * child_process function by three syntaxes (an identifier, an element access, a destructuring in a declaration), so a namespace passed
 * to a helper that takes a local interface, a parameter destructuring or an assignment destructuring gave a function the call rules did
 * not see (R5-001); it took the static type for the absence of `fd` in an options object (R5-002); it left an unbound method on
 * `process.on` to a known limit although the direct forms can be closed (R5-003); and it read a computed name only without a
 * type-only wrapper (R5-004). The fix closes the entrances: only a named import gives an fs / child_process function; the options of
 * createReadStream / createWriteStream are a new object literal; `new Utf8Stream` is a violation (found in the table of entrances);
 * a listener that uses `this` is a violation; `["stdio" as const]` is read as `stdio`.
 * Each fixture below is a string compiled in memory with the repository's tsconfig and type-checks (two forms are rejected by TypeScript
 * itself and are compiled apart). `reported: false` on a form that runs the forbidden way is a known limit of ADR-0019 (a listener in a
 * record: r12), not a pass. The guards are imported as namespaces so that this file also runs against the v0.5.21 guards, where the
 * forms that expect a report fail on their own (the record of the failures before the fix).
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { brandGuard } from "./structure/brand-guard.ts";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/r5";

/** A fixture: a source string. `reported`: the guards report it. */
interface Case {
  reported: boolean;
  src: string;
}


/** R5-001 (single-file fixtures; p08 and p09 span two files and are in TWO_FILES) */
const R5_001: Record<string, Case> = {
  p01_param_destructure_node_type: { reported: true, src: `import * as fs from "node:fs";\ntype W = Pick<typeof fs, "writeFileSync">;\nconst put = ({ writeFileSync: w }: W): void => {\n  w("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fs);\n};\n` },
  p02_param_destructure_local_type: { reported: true, src: `import * as fs from "node:fs";\ntype F = (p: string, d: string) => void;\nconst put = ({ writeFileSync: w }: { writeFileSync: F }): void => {\n  w("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fs);\n};\n` },
  p03_ns_to_local_interface: { reported: true, src: `import * as fs from "node:fs";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fs);\n};\n` },
  p04_var_key_retyped: { reported: true, src: `import * as fs from "node:fs";\ntype F = (p: string, d: string) => void;\nconst k = "writeFileSync" as const;\nexport const f = (): void => {\n  const w: F = fs[k];\n  w("/dev/stdout", "x");\n};\n` },
  p05_var_key_direct_call: { reported: true, src: `import * as fs from "node:fs";\nconst k = "writeFileSync" as const;\nexport const f = (): void => {\n  fs[k]("/dev/stdout", "x");\n};\n` },
  p06_assign_destructure: { reported: true, src: `import * as fs from "node:fs";\ntype F = (p: string, d: string) => void;\nexport const f = (): void => {\n  let w: F;\n  ({ writeFileSync: w } = fs);\n  w("/dev/stdout", "x");\n};\n` },
  p07_default_import_to_interface: { reported: true, src: `import fs from "node:fs";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fs);\n};\n` },
  p10_dynamic_import_ns: { reported: true, src: `interface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = async (): Promise<void> => {\n  put(await import("node:fs"));\n};\n` },
  p11_promises_to_interface: { reported: true, src: `import { promises } from "node:fs";\ninterface P {\n  writeFile(p: string, d: string): Promise<void>;\n}\nconst put = (m: P): Promise<void> => m.writeFile("/dev/stdout", "x");\nexport const f = (): Promise<void> => put(promises);\n` },
  p12_child_ns_to_interface: { reported: true, src: `import * as cp from "node:child_process";\ninterface Sp {\n  spawnSync(c: string, a: string[], o: object): unknown;\n}\nconst run = (m: Sp): void => {\n  m.spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\nexport const f = (): void => {\n  run(cp);\n};\n` },
  p13_child_param_destructure: { reported: true, src: `import * as cp from "node:child_process";\ntype S = (c: string, a: string[], o: object) => unknown;\nconst run = ({ spawnSync: sp }: { spawnSync: S }): void => {\n  sp("node", ["-e", "process.stdout.write('x')"], { stdio: "inherit" });\n};\nexport const f = (): void => {\n  run(cp);\n};\n` },
  p14_ns_alias_node_type: { reported: true, src: `import * as fs from "node:fs";\nexport const f = (): void => {\n  const m = fs;\n  m.writeFileSync("/dev/stdout", "x");\n};\n` },
  p15_ns_to_typeof_fs: { reported: true, src: `import * as fs from "node:fs";\nconst put = (io: typeof fs): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fs);\n};\n` },
  p16_named_fn_value: { reported: true, src: `import { writeFileSync } from "node:fs";\ntype F = (p: string, d: string) => void;\nconst put = (w: F): void => {\n  w("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(writeFileSync);\n};\n` },
  p17_named_import_call: { reported: true, src: `import { writeFileSync } from "node:fs";\nexport const f = (): void => {\n  writeFileSync("/dev/stdout", "x");\n};\n` },
  // reported since v0.5.23 (M2-2-BUILTIN-R6-001): exporting an fs function by name makes the module that exports it a namespace of those functions
  p18_named_reexport: { reported: true, src: `export { writeFileSync } from "node:fs";\n` },
  p19_default_import_path: { reported: false, src: `import path from "node:path";\nexport const f = (): string => path.join("a", "b");\n` },
  p20_constants_named_import: { reported: false, src: `import { accessSync, constants } from "node:fs";\nexport const f = (): void => {\n  accessSync(".", constants.R_OK);\n};\n` },
  p21_default_as_named: { reported: true, src: `import { default as fsd } from "node:fs";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fsd);\n};\n` },
  p22_promises_alias: { reported: true, src: `import { promises as p } from "node:fs";\ninterface P {\n  writeFile(p: string, d: string): Promise<void>;\n}\nconst put = (m: P): Promise<void> => m.writeFile("/dev/stdout", "x");\nexport const f = (): Promise<void> => put(p);\n` },
  p23_reexport_promises: { reported: true, src: `export { promises } from "node:fs";\n` },
  p24_reexport_default: { reported: true, src: `export { default } from "node:fs";\n` },
  p25_import_type_ns: { reported: false, src: `import type * as fs from "node:fs";\nexport type Fs = typeof fs;\n` },
  p26_path_namespace: { reported: false, src: `import * as path from "node:path";\nexport const f = (): string => path.join("a", "b");\n` },
  p27_crypto_namespace: { reported: false, src: `import * as crypto from "node:crypto";\nexport const f = (): string => crypto.randomBytes(2).toString("hex");\n` },
  p28_type_only_specifier: { reported: false, src: `import { type Stats, statSync } from "node:fs";\nexport const f = (p: string): Stats => statSync(p);\n` },
};

/** R5-002 */
const R5_002: Record<string, Case> = {
  q01_return_type_view: { reported: true, src: `import { createWriteStream } from "node:fs";\ninterface View {\n  flags?: string;\n}\nconst make = (): View => {\n  const o = { flags: "a", fd: 1 };\n  return o;\n};\nexport const f = (): void => {\n  createWriteStream("unused.txt", make()).write("x");\n};\n` },
  q02_param_view: { reported: true, src: `import { createWriteStream } from "node:fs";\ninterface View {\n  flags?: string;\n}\nconst open = (o: View): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\nexport const f = (): void => {\n  const cfg = { flags: "a", fd: 1 };\n  const v: View = cfg;\n  open(v);\n};\n` },
  q03_config_view: { reported: true, src: `import { createWriteStream } from "node:fs";\ninterface View {\n  flags?: string;\n}\nconst cfg: View = JSON.parse('{"flags":"a","fd":1}');\nexport const f = (): void => {\n  createWriteStream("unused.txt", cfg).write("x");\n};\n` },
  q04_pick_view: { reported: true, src: `import { createWriteStream } from "node:fs";\ntype View = Pick<Exclude<Parameters<typeof createWriteStream>[1], string | undefined>, "flags">;\nconst open = (o: View): void => {\n  createWriteStream("unused.txt", o).write("x");\n};\nexport const f = (): void => {\n  const cfg = { flags: "a", fd: 1 };\n  const v: View = cfg;\n  open(v);\n};\n` },
  q05_spread_of_view: { reported: true, src: `import { createWriteStream } from "node:fs";\ninterface View {\n  flags?: string;\n}\nconst make = (): View => {\n  const o = { flags: "a", fd: 1 };\n  return o;\n};\nexport const f = (): void => {\n  createWriteStream("unused.txt", { ...make() }).write("x");\n};\n` },
  q06_read_stream_view: { reported: true, src: `import { createReadStream } from "node:fs";\ninterface View {\n  flags?: string;\n}\nconst make = (): View => {\n  const o = { flags: "r", fd: 0 };\n  return o;\n};\nexport const f = (): void => {\n  createReadStream("unused.txt", make()).destroy();\n};\n` },
  q07_child_options_view: { reported: true, src: `import { spawnSync } from "node:child_process";\nimport type { SpawnSyncOptions } from "node:child_process";\nconst make = (): SpawnSyncOptions => ({ stdio: "inherit" });\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], make());\n};\n` },
  q08_fd_literal: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("unused.txt", { fd: 1 }).write("x");\n};\n` },
  q09_flags_literal: { reported: false, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string): void => {\n  createWriteStream(p, { flags: "a" }).end();\n};\n` },
  q10_options_var_no_fd: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string, o: { flags?: string }): void => {\n  createWriteStream(p, o).end();\n};\n` },
  q11_no_options: { reported: false, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string): void => {\n  createWriteStream(p).end();\n};\n` },
  q12_encoding_string: { reported: false, src: `import { createWriteStream } from "node:fs";\nexport const f = (p: string): void => {\n  createWriteStream(p, "utf8").end();\n};\n` },
};

/** R5-003 */
const R5_003: Record<string, Case> = {
  r01_class_method_on: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.on("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r02_object_method_on: { reported: true, src: `export const f = (): void => {\n  const r = {\n    stdout: { write: (s: string): boolean => s.length > 0 },\n    onEvent(): void {\n      this.stdout.write("x");\n    },\n  };\n  process.on("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r03_function_declaration: { reported: true, src: `function onEvent(this: { stdout: { write(s: string): boolean } }): void {\n  this.stdout.write("x");\n}\nexport const f = (): void => {\n  process.on("SIGUSR2", onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r04_function_expression: { reported: true, src: `export const f = (): void => {\n  process.on("SIGUSR2", function (this: { stdout: { write(s: string): boolean } }) {\n    this.stdout.write("x");\n  });\n  process.emit("SIGUSR2");\n};\n` },
  r05_once: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.once("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r06_addListener: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.addListener("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r07_prependListener: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.prependListener("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r08_bind_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.on("SIGUSR2", r.onEvent.bind(r));\n  process.emit("SIGUSR2");\n};\n` },
  r09_arrow_control: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  process.on("SIGUSR2", () => r.onEvent());\n  process.emit("SIGUSR2");\n};\n` },
  r10_no_this_function: { reported: false, src: `function onEvent(): void {\n  return;\n}\nexport const f = (): void => {\n  process.on("SIGUSR2", onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r11_no_this_method: { reported: false, src: `class Quiet {\n  onEvent(): void {\n    return;\n  }\n}\nexport const f = (): void => {\n  const q = new Quiet();\n  process.on("SIGUSR2", q.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r12_record_indirect: { reported: false, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\ntype Sig = "SIGUSR2" | "SIGINT";\nexport const f = (): void => {\n  const r = new Reporter();\n  const handlers: Record<Sig, () => void> = { SIGUSR2: r.onEvent, SIGINT: r.onEvent };\n  const sig: Sig = "SIGUSR2";\n  process.on(sig, handlers[sig]);\n  process.emit("SIGUSR2");\n};\n` },
  r13_property_indirect: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const box = { h: r.onEvent };\n  process.on("SIGUSR2", box.h);\n  process.emit("SIGUSR2");\n};\n` },
  r14_variable_alias: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  const h = r.onEvent;\n  process.on("SIGUSR2", h);\n  process.emit("SIGUSR2");\n};\n` },
  r15_globalthis_process: { reported: true, src: `class Reporter {\n  stdout = { write: (s: string): boolean => s.length > 0 };\n  onEvent(): void {\n    this.stdout.write("x");\n  }\n}\nexport const f = (): void => {\n  const r = new Reporter();\n  globalThis.process.on("SIGUSR2", r.onEvent);\n  process.emit("SIGUSR2");\n};\n` },
  r16_src_form_control: { reported: false, src: `type Sig = "SIGUSR2" | "SIGINT";\nexport const f = (): void => {\n  const handlers: Record<Sig, () => void> = { SIGUSR2: () => undefined, SIGINT: () => undefined };\n  const sig: Sig = "SIGUSR2";\n  process.on(sig, handlers[sig]);\n  process.off(sig, handlers[sig]);\n};\n` },
};

/** R5-004 */
const R5_004: Record<string, Case> = {
  s01_as_const_key_after_stdio: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", ["cwd" as const]: "." });\n};\n` },
  s02_satisfies_key_after_stdio: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", ["cwd" satisfies string]: "." });\n};\n` },
  s03_computed_literal_stdio: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { ["stdio"]: "pipe" });\n};\n` },
  s04_computed_as_const_stdio: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { ["stdio" as const]: "pipe" });\n};\n` },
  s05_rule_k_as_const_key: { reported: false, src: `import { mkdirSync } from "node:fs";\nexport const f = (p: string): void => {\n  mkdirSync(p, { ["recursive" as const]: true });\n};\n` },
  s06_holder_as_const_control: { reported: true, src: `export const f = (): string => process["platform" as const];\n` },
  s08_computed_literal_stdio_inherit: { reported: true, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { ["stdio"]: "inherit" });\n};\n` },
  s10_paren_key_control: { reported: false, src: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "0"], { stdio: "pipe", [("cwd")]: "." });\n};\n` },
  s11_fd_as_const_key_control: { reported: true, src: `import { createWriteStream } from "node:fs";\nexport const f = (): void => {\n  createWriteStream("unused.txt", { ["fd" as const]: 1 }).write("x");\n};\n` },
};

/** the table of entrances */
const ENTRY: Record<string, Case> = {
  z01_utf8stream_dest_device: { reported: true, src: `import { Utf8Stream } from "node:fs";\nexport const f = (): void => {\n  const s = new Utf8Stream({ dest: "/dev/stdout", sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  z02_utf8stream_fd: { reported: true, src: `import { Utf8Stream } from "node:fs";\nexport const f = (): void => {\n  const s = new Utf8Stream({ fd: 1, sync: true });\n  s.write("x");\n  s.end();\n};\n` },
  z03_utf8stream_view: { reported: true, src: `import { Utf8Stream } from "node:fs";\ninterface View {\n  sync?: boolean;\n}\nconst make = (): View => {\n  const o = { sync: true, fd: 1 };\n  return o;\n};\nexport const f = (): void => {\n  const s = new Utf8Stream(make());\n  s.write("x");\n  s.end();\n};\n` },
};

const GROUPS: Record<string, Record<string, Case>> = { R5_001, R5_002, R5_003, R5_004, ENTRY };
const TITLES: Record<string, string> = {
  R5_001: "R5-001: the functions of fs / child_process as one value (a namespace, a default import, `promises`, a re-export, import()) or taken by a parameter / assignment destructuring or a variable key; controls",
  R5_002: "R5-002: the options of createReadStream / createWriteStream that a variable holds (the static type does not show `fd`); controls",
  R5_003: "R5-003: an unbound method or a function that uses `this` passed to process.on / once / addListener / prependListener / prependOnceListener; a listener in a record is a known limit (r12); controls",
  R5_004: "R5-004: a computed name with `as const` / `satisfies` (false positives, now not reported); controls that stay reported",
  ENTRY: "the table of entrances (ADR-0019): new Utf8Stream names an fd or a path to write to",
};

/** Two files: a re-export of fs and a file that uses it. The files sit directly under src/ (the module rule needs a source file of src/). */
const TWO_FILES: Record<string, { reported: boolean; files: Record<string, string> }> = {
  p08_export_star_as: { reported: true, files: {
    "src/zz-r5-p08_export_star_asa.ts": `export * as fsns from "node:fs";\n`,
    "src/zz-r5-p08_export_star_asb.ts": `import { fsns } from "./zz-r5-p08_export_star_asa.ts";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (io: Io): void => {\n  io.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(fsns);\n};\n`,
  } },
  p09_export_star: { reported: true, files: {
    "src/zz-r5-p09_export_stara.ts": `export * from "node:fs";\n`,
    "src/zz-r5-p09_export_starb.ts": `import * as io from "./zz-r5-p09_export_stara.ts";\ninterface Io {\n  writeFileSync(p: string, d: string): void;\n}\nconst put = (m: Io): void => {\n  m.writeFileSync("/dev/stdout", "x");\n};\nexport const f = (): void => {\n  put(io);\n};\n`,
  } },
};

/** The forms TypeScript rejects (a literal key written twice): compiled apart; the type error is the expectation. */
const TYPE_ERRORS: Record<string, string> = {
  s07_stdio_override_as_const: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ["stdio" as const]: "inherit" });\n};\n`,
  s09_duplicate_literal_computed: `import { spawnSync } from "node:child_process";\nexport const f = (): void => {\n  spawnSync("node", ["-e", "process.stdout.write('x')"], { stdio: "pipe", ["stdio"]: "inherit" });\n};\n`,
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

describe("M2-2-BUILTIN-R5: the fixtures", () => {
  it("every single-file fixture type-checks (the shared program has no type error)", () => {
    const failing = all.filter((x) => typeErrors(program, filesUnder(program, `${P}/${x.id}.ts`)).length > 0).map((x) => x.id);
    expect(failing).toEqual([]);
  });
  it("the two-file fixtures type-check", () => {
    const failing = Object.entries(TWO_FILES).filter(([, t]) => Object.keys(t.files).flatMap((f) => typeErrors(twoProgram, filesUnder(twoProgram, f))).length > 0).map(([id]) => id);
    expect(failing).toEqual([]);
  });
  for (const [id, src] of Object.entries(TYPE_ERRORS)) {
    // Item 41 (v0.13.2), time budget T3 (docs/ops/ci-and-branch-protection.md): one limit for the two forms, the largest of their T3 = 40 s
    // (s09: 12 × the quiet 2.55 s; s07: 2.49 s, whose own T3 is 30 s)
    it(`${id}: TypeScript rejects it (a form that cannot be compiled)`, () => {
      const own = createProgram({ [`${P}/${id}.ts`]: src });
      expect(typeErrors(own, filesUnder(own, `${P}/${id}.ts`)).length).toBeGreaterThan(0);
    }, 40_000);
  }
});

for (const [g, cases] of Object.entries(GROUPS)) {
  describe(`M2-2-BUILTIN-R5: ${TITLES[g]}`, () => {
    for (const [id, c] of Object.entries(cases)) {
      it(`${id}: ${c.reported ? "reported" : "not reported"}`, () => {
        const v = violations(id);
        if (c.reported) expect(v).not.toEqual([]);
        else expect(v).toEqual([]);
      });
    }
  });
}

describe("M2-2-BUILTIN-R5-001: two files (a re-export of fs, then its use)", () => {
  for (const [id, t] of Object.entries(TWO_FILES)) {
    it(`${id}: ${t.reported ? "reported" : "not reported"}`, () => {
      if (t.reported) expect(twoViolations(id)).not.toEqual([]);
      else expect(twoViolations(id)).toEqual([]);
    });
  }
});

/** The fs APIs whose options (or constructor options) have an `fd`, found in @types/node by the type checker: [name, index of the options argument, is a class]. */
function fdApisOfFs(): Array<[string, number, boolean]> {
  const p = createProgram({ [`${P}/zz_enum.ts`]: 'import * as fs from "node:fs";\nexport const all = fs;\n' });
  const sf = filesUnder(p, `${P}/zz_enum.ts`)[0];
  const imp = sf?.statements.find(ts.isImportDeclaration);
  const mod = imp === undefined ? undefined : p.checker.getSymbolAtLocation(imp.moduleSpecifier);
  if (mod === undefined) throw new Error("node:fs does not resolve");
  const hasFd = (t: ts.Type): boolean => (t.isUnionOrIntersection() ? t.types.some(hasFd) : (t.flags & ts.TypeFlags.Object) !== 0 && p.checker.getPropertyOfType(t, "fd") !== undefined);
  const found: Array<[string, number, boolean]> = [];
  for (const e of p.checker.getExportsOfModule(mod)) {
    const sym = e.flags & ts.SymbolFlags.Alias ? p.checker.getAliasedSymbol(e) : e;
    const decl = sym.declarations?.[0];
    if (decl === undefined) continue;
    const t = p.checker.getTypeOfSymbolAtLocation(sym, decl);
    for (const [sigs, isClass] of [[t.getCallSignatures(), false], [t.getConstructSignatures(), true]] as const) {
      for (const sig of sigs) {
        const at = sig.getParameters().findIndex((prm) => hasFd(p.checker.getTypeOfSymbolAtLocation(prm, prm.valueDeclaration ?? decl)));
        if (at >= 0 && !found.some(([n]) => n === e.name)) found.push([e.name, at, isClass]);
      }
    }
  }
  return found;
}

describe("M2-2-BUILTIN-R5-002: the list of fs APIs with an `fd` option is the one in @types/node (both ways)", () => {
  const lists = guard as { FD_OPTION_APIS?: ReadonlyMap<string, number>; FORBIDDEN_FS_CLASSES?: ReadonlySet<string> };
  const found = fdApisOfFs();
  it("every API of @types/node fs with an `fd` option is in FD_OPTION_APIS (a function) or FORBIDDEN_FS_CLASSES (a class)", () => {
    const listed = new Set([...(lists.FD_OPTION_APIS?.keys() ?? []), ...(lists.FORBIDDEN_FS_CLASSES ?? [])]);
    expect(found.map(([n]) => n).filter((n) => !listed.has(n)).sort()).toEqual([]);
  });
  it("every listed API is in @types/node fs with an `fd` option, and the index of the options argument is the one declared", () => {
    const byName = new Map(found.map(([n, at, isClass]) => [n, { at, isClass }]));
    const listedFns = [...(lists.FD_OPTION_APIS ?? new Map<string, number>())];
    expect(listedFns.filter(([n, at]) => byName.get(n)?.at !== at || byName.get(n)?.isClass === true).map(([n]) => n)).toEqual([]);
    expect([...(lists.FORBIDDEN_FS_CLASSES ?? [])].filter((n) => byName.get(n)?.isClass !== true)).toEqual([]);
    expect(lists.FD_OPTION_APIS?.size).toBe(2);
    expect(lists.FORBIDDEN_FS_CLASSES?.size).toBe(1);
  });
});

describe("M2-2-BUILTIN-R5: src/", () => {
  // Item 41 (v0.13.2), time budget T3: max(30 s, 12 × the quiet 12.32 s, up to a multiple of 10 s) = 150 s (docs/ops/ci-and-branch-protection.md)
  it("has no violation of the output guard or the brand guard", () => {
    const real = createProgram();
    const files = filesUnder(real, "src/");
    expect(files.length).toBeGreaterThan(30);
    expect(guard.outputViolations(real, files)).toEqual([]);
    expect(brandGuard(real, files)).toEqual([]);
  }, 150_000);
});

