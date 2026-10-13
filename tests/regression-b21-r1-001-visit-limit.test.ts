/**
 * B21-R1-001 (Low, the independent review of backlog 21 R1; ROADMAP item 37): `hasBrand()` in tests/structure/brand-guard.ts stops a walk
 * that has visited VISIT_LIMIT (50,000) types and gives the caller's fail-closed answer — `cut = true` where a brand makes a report (the
 * source of a container), `cut = false` where its absence does (the target) — and never keeps an answer reached by a cut in its memo
 * (KNOWN, per checker). No test pinned either. This file does, through the exported brandGuard() only (tests/structure/ is not changed and
 * the limit is not replaced): each fixture type reaches the limit through one property whose type is a union of 60,000 string literal
 * types (a template literal type, so the source stays small), and each fixture uses its own literals, so the memo of one fixture's
 * walks cannot answer for another's.
 *
 * It pins the current behaviour (a test of what is there, not of a change): it passes on 3ad0781 as well as after.
 *  - source: a container type with no brand at all, cut, is reported as if it held one (cut = true); with a small union it is not
 *  - target: a target that holds the brand after the cut is reported as if it had none (cut = false); with a small union it is not
 *  - memo: the same type asked first as a source and then as a target, and first as a target and then as a source, gives the cut answer
 *    of each side every time (an answer reached by a cut is not kept)
 */
import { describe, expect, it } from "vitest";
import { brandGuard } from "./structure/brand-guard.ts";
import { createProgram, filesUnder, typeErrors } from "./structure/typescript.ts";

const P = "tests/__fixtures__/b21r1";
const CHECKED = `import type { Checked } from "../../../src/review/checked.ts";\n`;
/** A union of 10 × 10 × 10 × 10 × 6 = 60,000 string literal types, each starting with `tag`: over the limit of 50,000 visits by itself. */
const big = (tag: string): string => `type D = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";\ntype H = "0" | "1" | "2" | "3" | "4" | "5";\nexport type Big = \`${tag}\${D}\${D}\${D}\${D}\${H}\`;\n`;
/** A union of 30 string literal types: far below the limit. */
const small = (tag: string): string => `type D = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";\ntype H = "0" | "1" | "2";\nexport type Big = \`${tag}\${D}\${H}\`;\n`;

interface Case {
  /** widened-container reports in the file */
  reports: number;
  src: string;
}

const CASES: Record<string, Case> = {
  // source side: `{ u: Big }` holds no brand. Cut, it answers true: `w` (the parameter's name and the arrow's body) is a "branded" source;
  // the body's place `{ u: string }` is writable without the brand: one report (the parameter's name has no contextual type)
  source_cut: { reports: 1, src: `${big("s")}interface Wide { u: Big }\nexport const f = (w: Wide): { u: string } => w;\n` },
  source_control: { reports: 0, src: `${small("t")}interface Wide { u: Big }\nexport const f = (w: Wide): { u: string } => w;\n` },
  // target side: `{ v: Checked }` is a branded source; the target holds the brand in `v`, after `u`. Cut, it answers false: one report
  target_cut: { reports: 1, src: `${CHECKED}${big("g")}interface Wide { u?: Big; v: Checked }\nexport const f = (c: { v: Checked }): Wide => c;\n` },
  target_control: { reports: 0, src: `${CHECKED}${small("h")}interface Wide { u?: Big; v: Checked }\nexport const f = (c: { v: Checked }): Wide => c;\n` },
  // the memo, source first: `w` is asked as a source (cut: true; a container with the brand after the cut), then the same type is the
  // target of `c` (cut: false). Had the first answer been kept, the target would hold the brand and `c` would not be reported
  memo_source_then_target: {
    reports: 2,
    src: `${CHECKED}${big("m")}interface Wide { u?: Big; v: Checked }\nexport const f = (w: Wide): { v: string } => w;\nexport const g = (c: { v: Checked }): Wide => c;\n`,
  },
  // the memo, target first: the type is first asked as the target of `c` (cut: false; it holds no brand at all), then `w` of that type is
  // a source (cut: true). Had the first answer been kept, `w` would hold no brand and would not be reported
  memo_target_then_source: {
    reports: 2,
    src: `${CHECKED}${big("n")}interface Wide { u?: Big; v?: string }\nexport const g = (c: { v: Checked }): Wide => c;\nexport const f = (w: Wide): { v?: string } => w;\n`,
  },
};

const program = createProgram(Object.fromEntries(Object.entries(CASES).map(([id, c]) => [`${P}/${id}.ts`, c.src])));
const rulesOf = (id: string): string[] => brandGuard(program, filesUnder(program, `${P}/${id}.ts`)).map((v) => `${v.rule} ${v.where.replace(/^.*\//, "")}`);

describe("B21-R1-001: the fixtures", () => {
  it("type-check", () => {
    expect(typeErrors(program, filesUnder(program, `${P}/`))).toEqual([]);
  });
});

describe("B21-R1-001: a walk cut at the visit limit gives each side's fail-closed answer, and the cut is not remembered", () => {
  for (const [id, c] of Object.entries(CASES)) {
    it(`${id}: ${c.reports} widened-container report(s), nothing else`, () => {
      const rules = rulesOf(id);
      expect(rules.filter((r) => r.startsWith("widened-container ")).length).toBe(c.reports);
      expect(rules.filter((r) => !r.startsWith("widened-container "))).toEqual([]);
    });
  }
  it("the same file asked again with the same checker gives the same answers (a cut is cut again, not answered from the memo)", () => {
    for (const id of ["memo_source_then_target", "memo_target_then_source", "source_cut", "target_cut"]) {
      expect(rulesOf(id).filter((r) => r.startsWith("widened-container ")).length).toBe(CASES[id]?.reports);
    }
  });
});
