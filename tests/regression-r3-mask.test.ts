/**
 * Regression tests for independent review R3 — R3-001
 * (docs/reviews/m0/independent-review-r3.md). A value starting with "[REDACTED:" must not bypass
 * the key-value rule; only aiqh's own canonical marker "[REDACTED:<category>]" as the whole value
 * is left alone. Dummy secrets are assembled at runtime with fake() (see fake() in tests/helpers.ts).
 */
import { describe, expect, it } from "vitest";
import { MASK_CATEGORIES, maskSecrets } from "../src/security/mask.ts";
import { fake } from "./helpers.ts";

const R = "[REDACTED:key-value]";

describe("R3-001 key-value rule: '[REDACTED:' prefix is not a bypass", () => {
  const cases: Array<[string, string, string]> = [
    [`password="[REDACTED:fake] ${fake("real ", "secret tail")}"`, "secret tail", `password="${R}"`],
    [`password=[REDACTED:fake]${fake("real_", "secret")}`, "real_secret", `password=${R}`],
    [`password="[REDACTED:key-value]${fake("suf", "fix")}"`, "suffix", `password="${R}"`],
    [`token=[REDACTED:github]${fake("sec", "ret")}`, "secret", `token=${R}`],
    [`api_key='[REDACTED:aws] ${fake("more ", "stuff")}'`, "more stuff", `api_key='${R}'`],
    [`password=[REDACTED:fake]`, "REDACTED:fake", `password=${R}`],
  ];
  for (const [input, tail, expected] of cases) {
    it(`masks ${input.slice(0, 30)}…`, () => {
      const out = maskSecrets(input);
      expect(out).not.toContain(tail);
      expect(out).toBe(expected);
      expect(maskSecrets(out)).toBe(out);
    });
  }

  it("leaves a canonical marker alone for every category, quoted and unquoted (idempotence)", () => {
    expect(MASK_CATEGORIES.length).toBeGreaterThan(5);
    for (const category of MASK_CATEGORIES) {
      for (const input of [
        `password="[REDACTED:${category}]"`,
        `password='[REDACTED:${category}]'`,
        `password=[REDACTED:${category}]`,
        `"token": "[REDACTED:${category}]"`,
      ]) {
        const once = maskSecrets(input);
        expect(once).toBe(input);
        expect(maskSecrets(once)).toBe(input);
      }
    }
  });

  it("keeps the R1 cross-category case: a github token behind --token= stays [REDACTED:github]", () => {
    const out = maskSecrets(`--token=${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")}`);
    expect(out).toBe("--token=[REDACTED:github]");
    expect(maskSecrets(out)).toBe(out);
  });
});
