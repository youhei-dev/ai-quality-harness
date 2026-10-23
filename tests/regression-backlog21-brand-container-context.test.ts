/**
 * Backlog 21 (wave 1): the widened-container rule of tests/structure/brand-guard.ts compared a branded container with its target only
 * in four kinds of place (a declaration with a type annotation, the right side of `=`, an argument, a `return` statement), and looked
 * for a brand only 4 levels deep and in the first 40 properties. A container widened to a type without the brand anywhere else (the
 * expression body of an arrow function, a property of an object literal, an element of an array literal, a branch of a conditional,
 * the default of a parameter, the operand of an assertion) or holding its brand deeper was not reported. v0.5.43 compares with the
 * contextual type of every expression and looks for a brand at any depth and in every property (a walk past a large visit limit gives
 * the fail-closed answer). Three tests of tests/regression-m2-2-builtin-r3-allow-branches.test.ts that fixed the old limit as "not
 * reported" (bd01, bd02, bd04) now expect a report (approved).
 *
 * Each fixture is compiled in memory with the repository's tsconfig and type-checks. Before the fix the forms marked `reported` are not
 * reported (the record of the failure before the fix); the controls pass before and after.
 */
import { describe, expect, it } from "vitest";
import { brandGuard } from "./structure/brand-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/b21";
const CHECKED = `import type { Checked } from "../../../src/review/checked.ts";\n`;

/** A fixture: its source and how many widened-container reports it gives (0: a control). */
interface Case {
  reports: number;
  src: string;
}

const plainProps = (n: number): string => Array.from({ length: n }, (_, i) => `p${i}: number;`).join(" ");

const CASES: Record<string, Case> = {
  // places that are not one of the four kinds. Where the container is part of a new object / array literal, that literal holds the
  // brand too and is reported as well (as an annotated declaration or `return` of it always was). A conditional is reported through
  // its branch: its own type `{ v: Checked } | { v: string }` is reduced by TypeScript to `{ v: string }`
  b21_object_property: { reports: 2, src: `${CHECKED}export const f = (c: Checked[]): { v: string[] } => ({ v: c });\n` },
  b21_shorthand_property: { reports: 2, src: `${CHECKED}export const f = (c: Checked[]): { c: string[] } => ({ c });\n` },
  b21_array_element: { reports: 2, src: `${CHECKED}export const f = (c: { v: Checked }): Array<{ v: string }> => [c];\n` },
  b21_conditional_branch: { reports: 1, src: `${CHECKED}export const f = (b: boolean, c: { v: Checked }, d: { v: string }): { v: string } => (b ? c : d);\n` },
  b21_parameter_default: { reports: 1, src: `${CHECKED}export const f = (c: { v: Checked }): string => {\n  const g = (x: { v: string } = c): string => x.v;\n  return g();\n};\n` },
  b21_assertion_operand: { reports: 1, src: `${CHECKED}export const f = (c: Checked[]): number => (c as string[]).length;\n` },
  // parentheses pass the place's type to their operand: one report, not two
  b21_arrow_body_parenthesized: { reports: 1, src: `${CHECKED}export const f = (c: { v: Checked }): { v: string } => (c);\n` },
  // a spread copies: the new literal is reported (as with a return statement), the spread operand itself is not judged
  b21_spread_copy: { reports: 1, src: `${CHECKED}export const f = (c: { v: Checked }): { v: string } => ({ ...c });\n` },
  // depth and breadth of the brand, in a place of the four kinds (also a property of a mapped type, which has no declaration)
  b21_nested_arrays_6: { reports: 1, src: `${CHECKED}export const f = (c: Checked[][][][][][]): number => {\n  const x: string[][][][][][] = c;\n  return x.length;\n};\n` },
  b21_property_41: { reports: 1, src: `${CHECKED}interface Big { ${plainProps(40)} v: Checked }\ninterface Plain { ${plainProps(40)} v: string }\nexport const f = (c: Big): number => {\n  const x: Plain = c;\n  return x.p0;\n};\n` },
  b21_mapped_type_source: { reports: 1, src: `${CHECKED}export const f = (c: Record<"v", Checked>): string => {\n  const x: { v: string } = c;\n  return x.v;\n};\n` },
  // known limit (not reported): the properties of a mapped type have no declaration, so a target like Record<"v", string> is not seen as writable
  b21_limit_mapped_type_target: { reports: 0, src: `${CHECKED}export const f = (c: { v: Checked }): string => {\n  const x: Record<"v", string> = c;\n  return x.v;\n};\n` },
  // controls (not reported)
  b21_control_target_branded: { reports: 0, src: `${CHECKED}export const f = (c: { v: Checked }): { v: Checked } => c;\n` },
  b21_control_readonly_array: { reports: 0, src: `${CHECKED}export const f = (c: Checked[]): readonly string[] => c;\n` },
  b21_control_unknown: { reports: 0, src: `${CHECKED}export const f = (c: Checked[]): unknown => c;\n` },
  b21_control_no_brand: { reports: 0, src: `export const f = (c: { v: string }): { v: string } => c;\n` },
  b21_control_generic_call: { reports: 0, src: `${CHECKED}export const f = (c: Checked[]): Promise<Checked[]> => Promise.resolve(c);\n` },
  b21_control_spread_into_branded: { reports: 0, src: `${CHECKED}export const f = (c: { v: Checked }, d: { w: number }): { v: Checked; w: number } => ({ ...c, ...d });\n` },
};

const program = createProgram(Object.fromEntries(Object.entries(CASES).map(([id, c]) => [`${P}/${id}.ts`, c.src])));
const reportsOf = (id: string): number => brandGuard(program, filesUnder(program, `${P}/${id}.ts`)).filter((v) => v.rule === "widened-container").length;
const others = (id: string): string[] => brandGuard(program, filesUnder(program, `${P}/${id}.ts`)).filter((v) => v.rule !== "widened-container").map((v) => v.rule);

describe("backlog 21: the fixtures", () => {
  it("type-check", () => {
    expect(typeErrors(program, filesUnder(program, `${P}/`))).toEqual([]);
  });
});

describe("backlog 21: a branded container widened anywhere, at any depth, is reported once; the controls are not", () => {
  for (const [id, c] of Object.entries(CASES)) {
    it(`${id}: ${c.reports === 0 ? "not reported" : `reported ${c.reports} time(s)`}`, () => {
      expect(reportsOf(id)).toBe(c.reports);
      expect(others(id)).toEqual([]);
    });
  }
});

describe("backlog 21: src/ stays clean", () => {
  // Item 41 (v0.13.2), time budget T3: max(30 s, 12 × the quiet 2.76 s, up to a multiple of 10 s) = 40 s (docs/ops/ci-and-branch-protection.md)
  it("the brand guard reports nothing in src/", () => {
    const real = createProgram();
    expect(brandGuard(real, filesUnder(real, "src/"))).toEqual([]);
  }, 40_000);
});
