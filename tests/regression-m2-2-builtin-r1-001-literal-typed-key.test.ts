/**
 * M2-2-BUILTIN-R1-001 (Medium; ADR-0019): the output guard (tests/structure/output-guard.ts) read the property an element
 * access takes from the key expression only when the key expression resolves to a declaration, so
 * `const key: "getBuiltinModule" = "getBuiltinModule"; process[key]("node:console")` was not reported by the six-member
 * rule of v0.5.17 (a string literal was; a key whose type names the member was not). Now the property is taken from the type
 * of the key: when that type is one string literal (a const, `as const`, a parameter, a narrowed union, a template, …) and
 * the property is a member of PROCESS_MEMBERS, the access is reported by the member's name (`process.getBuiltinModule`).
 * A key whose type is not one literal is reported as before (`dynamic access to process`). Each fixture below is a string
 * compiled in memory with the repository's tsconfig and type-checks (the enum form is rejected by erasableSyntaxOnly and is
 * listed only to record that). The guard is imported as a namespace so that this file also runs against the v0.5.17 guard,
 * where the forms that expect a member name fail on their own (the record of the failures before the fix).
 */
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import * as guard from "./structure/output-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/literal-typed-key";

interface Named {
  /** the member's name the guard must report */
  what: string;
  src: string;
}

/** The property the key's type names is a member of `process`: the report names it. */
const NAMED: Record<string, Named> = {
  k01_annotated_const: { what: "process.getBuiltinModule", src: `const key: "getBuiltinModule" = "getBuiltinModule";\nexport const f = (): void => {\n  process[key]("node:console").log("x");\n};\n` },
  k02_as_const_report: { what: "process.report", src: `const key = "report" as const;\nexport const f = (): string => process[key].writeReport("stdout");\n` },
  k03_inferred_const: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule";\nexport const f = (): void => {\n  process[key]("node:console").log("x");\n};\n` },
  k04_parameter: { what: "process.getBuiltinModule", src: `export const f = (key: "getBuiltinModule"): void => {\n  process[key]("node:console").log("x");\n};\n` },
  k05_readonly_property: { what: "process.getBuiltinModule", src: `const keys = { g: "getBuiltinModule" } as const;\nexport const f = (): void => {\n  process[keys.g]("node:console").log("x");\n};\n` },
  k06_tuple_element: { what: "process.getBuiltinModule", src: `const keys = ["getBuiltinModule"] as const;\nexport const f = (): void => {\n  process[keys[0]]("node:console").log("x");\n};\n` },
  k07_template_no_subst: { what: "process.getBuiltinModule", src: `export const f = (): void => {\n  process[\`getBuiltinModule\`]("node:console").log("x");\n};\n` },
  k08_template_subst_as_const: { what: "process.getBuiltinModule", src: `const part = "Module" as const;\nconst key = \`getBuiltin\${part}\` as const;\nexport const f = (): void => {\n  process[key]("node:console").log("x");\n};\n` },
  k10_union_narrowed: { what: "process.getBuiltinModule", src: `export const f = (key: "platform" | "getBuiltinModule"): void => {\n  if (key === "getBuiltinModule") process[key]("node:console").log("x");\n};\n` },
  k12_keyof_narrowed_by_assignment: { what: "process.getBuiltinModule", src: `export const f = (): void => {\n  let key: keyof typeof process = "platform";\n  key = "getBuiltinModule";\n  process[key]("node:console").log("x");\n};\n` },
  k15_globalthis_process_key: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  globalThis.process[key]("node:console").log("x");\n};\n` },
  k16_globalthis_two_keys: { what: "process.getBuiltinModule", src: `const p = "process" as const;\nconst key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  globalThis[p][key]("node:console").log("x");\n};\n` },
  k17_globalthis_key_then_name: { what: "process.getBuiltinModule", src: `const p = "process" as const;\nexport const f = (): void => {\n  globalThis[p].getBuiltinModule("node:console").log("x");\n};\n` },
  k18_optional_chaining: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  process?.[key]("node:console").log("x");\n};\n` },
  k19_parenthesized: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  (process)[key]("node:console").log("x");\n};\n` },
  k20_non_null: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  process![key]("node:console").log("x");\n};\n` },
  k21_satisfies_key: { what: "process.getBuiltinModule", src: `const key = "getBuiltinModule";\nexport const f = (): void => {\n  process[key satisfies "getBuiltinModule"]("node:console").log("x");\n};\n` },
  k22_emitwarning: { what: "process.emitWarning", src: `const key = "emitWarning" as const;\nexport const f = (): void => {\n  process[key]("x");\n};\n` },
  k23_dlopen: { what: "process.dlopen", src: `const key = "dlopen" as const;\nexport const f = (): void => {\n  process[key]({ exports: {} }, "./addon.node");\n};\n` },
  k24_execve: { what: "process.execve", src: `const key = "execve" as const;\nexport const f = (): void => {\n  process[key]?.("/bin/echo", ["echo", "x"]);\n};\n` },
  k25_stdin: { what: "process.stdin", src: `const key = "stdin" as const;\nexport const f = (): boolean => process[key].write("x");\n` },
  // reported by other rules as well; the name is what this rule adds
  k26_node_process_default_import: { what: "process.getBuiltinModule", src: `import proc from "node:process";\nconst key = "getBuiltinModule" as const;\nexport const f = (): void => {\n  proc[key]("node:console").log("x");\n};\n` },
};

/** The key's type is not one literal, or another rule reports the form: reported, by whatever rule. */
const REPORTED: Record<string, string> = {
  k09_union_key: `export const f = (key: "platform" | "getBuiltinModule"): unknown => process[key];\n`,
  k11_keyof_parameter: `export const f = (key: keyof typeof process): unknown => process[key];\n`,
  k14_computed_destructuring: `const key = "getBuiltinModule" as const;\nconst { [key]: g } = process;\nexport const f = (): void => {\n  g("node:console").log("x");\n};\n`,
  // destructuring assignment (not a declaration): reported as a use of process as a value, before and after this fix
  k33_assign_destructuring: `const key = "getBuiltinModule" as const;\nlet g: NodeJS.Process["getBuiltinModule"];\nexport const f = (): void => {\n  ({ [key]: g } = process);\n  g("node:console").log("x");\n};\n`,
  k27_generic_key: `export const f = <K extends keyof NodeJS.Process>(key: K): NodeJS.Process[K] => process[key];\n`,
  k28_reflect_get: `const key = "getBuiltinModule" as const;\nexport const f = (): unknown => Reflect.get(process, key);\n`,
  k29_descriptor: `const key = "getBuiltinModule" as const;\nexport const f = (): unknown => Object.getOwnPropertyDescriptor(process, key)?.value;\n`,
  k30_object_entries: `export const f = (): unknown => Object.entries(process).find(([k]) => k === "getBuiltinModule")?.[1];\n`,
  // the terminal members, by the rule that was there before
  k31_terminal_stdout: `const key: "stdout" = "stdout";\nexport const f = (): boolean => process[key].write("x");\n`,
  k32_terminal_globalthis_stderr: `const key = "stderr" as const;\nexport const f = (): boolean => globalThis.process[key].write("x");\n`,
};

/** Not violations: the key names a member that is not one of the six, a plain object, a type position, an assignment. */
const CONTROLS: Record<string, string> = {
  c01_platform: `const key = "platform" as const;\nexport const f = (): string => process[key];\n`,
  c02_plain_object_same_name: `const obj = { getBuiltinModule: (): number => 0, report: { writeReport: (): string => "" } };\nconst key = "getBuiltinModule" as const;\nconst r = "report" as const;\nexport const f = (): string => \`\${obj[key]()} \${obj[r].writeReport()}\`;\n`,
  c03_type_positions: `const key = "getBuiltinModule" as const;\nexport type G = (typeof process)["getBuiltinModule"];\nexport type H = (typeof process)[typeof key];\nexport type I = NodeJS.Process["report"];\n`,
  c04_exitcode_assignment: `const key = "exitCode" as const;\nexport const f = (): void => {\n  process[key] = 1;\n};\n`,
  c05_globalthis_process_platform: `const p = "process" as const;\nexport const f = (): string => globalThis[p].platform;\n`,
};

/** An enum member as the key: tsc rejects the syntax (erasableSyntaxOnly), so it cannot be in src/. */
const ENUM_KEY = `enum K {\n  G = "getBuiltinModule",\n}\nexport const f = (): void => {\n  process[K.G]("node:console").log("x");\n};\n`;

const sources: Record<string, string> = { k13_enum_member: ENUM_KEY, ...REPORTED, ...CONTROLS };
for (const [id, f] of Object.entries(NAMED)) sources[id] = f.src;
const program = createProgram(Object.fromEntries(Object.entries(sources).map(([id, src]) => [`${P}/${id}.ts`, src])));
const fileOf = (id: string): ts.SourceFile[] => filesUnder(program, `${P}/${id}.ts`);
const reported = (id: string): string[] => guard.outputViolations(program, fileOf(id)).map((v) => v.what);

describe("M2-2-BUILTIN-R1-001: the fixtures", () => {
  it("every fixture type-checks, except the enum (erasableSyntaxOnly)", () => {
    expect(Object.keys(sources).filter((id) => typeErrors(program, fileOf(id)).length > 0)).toEqual(["k13_enum_member"]);
  });
});

describe("M2-2-BUILTIN-R1-001: a key whose type names a member of process is reported by the member's name", () => {
  for (const [id, f] of Object.entries(NAMED)) {
    it(id, () => {
      expect(reported(id)).toContain(f.what);
    });
  }
});

describe("M2-2-BUILTIN-R1-001: the other forms are reported", () => {
  for (const id of Object.keys(REPORTED)) {
    it(id, () => {
      expect(reported(id)).not.toEqual([]);
    });
  }
});

describe("M2-2-BUILTIN-R1-001: controls are not reported", () => {
  for (const id of Object.keys(CONTROLS)) {
    it(id, () => {
      expect(reported(id)).toEqual([]);
    });
  }
});

describe("M2-2-BUILTIN-R1-001: src/", () => {
  it("src/ has no violation", () => {
    const real = createProgram();
    expect(guard.outputViolations(real, filesUnder(real, "src/"))).toEqual([]);
  });
});
