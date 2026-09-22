/**
 * M2-0-R3-001 / 追加1–2: the regexes rewritten as anchor + rest match the same language as before.
 * Frozen references (regex sources copied from `git show v0.3.2:src/security/patterns.ts`,
 * v0.3.2 = commit cfadf18):
 * for every generated input the old and the new regex give the same match positions and match
 * strings (key-value: also the value groups 2–6).
 */
import { describe, expect, it } from "vitest";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { equivalenceInputs } from "./regex-equivalence-inputs.ts";

// Frozen references — regex sources, not secrets. Do not edit (they are the baseline of the comparison).
const V032_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const V032_PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;
const V032_GITHUB = /\b(?:gh[poust]_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;
const V032_KEY_VALUE =
  /(?<![A-Za-z0-9])((?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|token|password|passwd|pwd)\b["']?\s*[:=]\s*)(?:"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|(["'])([^\r\n]+)|([^\s"',;]+))/gi;

const byCat = (category: string) => SECRET_PATTERNS.find((p) => p.category === category)!;
/** All matches as "index:text" (plus the given groups), so two regexes can be compared exactly. */
function matches(re: RegExp, text: string, groups: number[] = []): string[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return [...text.matchAll(g)].map((m) => JSON.stringify([m.index, m[0], ...groups.map((i) => m[i] ?? null)]));
}
const INPUTS = equivalenceInputs();

describe("M2-0-R3-001 / 追加1–2: rewritten regexes match the same language as the frozen v0.3.2 references", () => {
  it("the frozen references are the v0.3.2 regexes (sanity: they still match typical values)", () => {
    expect(INPUTS.github.some((t) => V032_GITHUB.test(t))).toBe(true);
    expect(INPUTS["key-value"].length).toBe(3000);
  });
  it("private-key: body and block begin — identical match positions and strings", () => {
    const pk = byCat("private-key");
    const diffs = INPUTS["private-key"].filter((t) => JSON.stringify(matches(V032_PRIVATE_KEY, t)) !== JSON.stringify(matches(pk.pattern, t)) || JSON.stringify(matches(V032_PRIVATE_KEY_BEGIN, t)) !== JSON.stringify(matches(pk.block!.begin, t)));
    expect(INPUTS["private-key"].length).toBeGreaterThan(500);
    expect(diffs.slice(0, 3)).toEqual([]);
  });
  it("github (incl. gh?_ next to / overlapping github_pat_, word characters before and after) — identical", () => {
    const diffs = INPUTS.github.filter((t) => JSON.stringify(matches(V032_GITHUB, t)) !== JSON.stringify(matches(byCat("github").pattern, t)));
    expect(INPUTS.github.length).toBeGreaterThan(400);
    expect(diffs.slice(0, 3)).toEqual([]);
  });
  it("key-value — identical match positions, strings and value groups 2–6", () => {
    const groups = [2, 3, 4, 5, 6];
    const diffs = INPUTS["key-value"].filter((t) => JSON.stringify(matches(V032_KEY_VALUE, t, groups)) !== JSON.stringify(matches(byCat("key-value").pattern, t, groups)));
    expect(diffs.slice(0, 3)).toEqual([]);
  });
});
