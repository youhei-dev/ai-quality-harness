/**
 * Regression tests for independent review R2 — R2-001 / R2-004
 * (docs/reviews/m0/independent-review-r2.md). Secret masking rules.
 * Dummy secrets are assembled at runtime with fake() (see CLAUDE.md).
 */
import { describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { fake } from "./helpers.ts";

const R = "[REDACTED:key-value]";

describe("R2-001 key-value rule: quotes of the other kind and escaped quotes inside a quoted value", () => {
  const cases: Array<[string, string, string]> = [
    [`password="${fake("pa'ss", " word")}"`, "ss word", `password="${R}"`],
    [`password='${fake('pa"ss', " word")}'`, "ss word", `password='${R}'`],
    [`password="${fake("'secret", " value'")}"`, "secret value", `password="${R}"`],
    [`password="${fake('abc\\"def', " ghi")}"`, "def ghi", `password="${R}"`],
    [`password='${fake("abc\\'def", " ghi")}'`, "def ghi", `password='${R}'`],
    [`{"token": "${fake("a'b", " c")}", "next": 1}`, "b c", `{"token": "${R}", "next": 1}`],
  ];
  for (const [input, tail, expected] of cases) {
    it(`masks the whole value in ${input.slice(0, 16)}…`, () => {
      const out = maskSecrets(input);
      expect(out).not.toContain(tail);
      expect(out).toBe(expected);
      expect(maskSecrets(out)).toBe(out);
    });
  }

  it("fail-safe: an unterminated quoted value is masked to the end of the line", () => {
    const out = maskSecrets(`password="${fake("abc", " def ghi")} trailing\nnext line stays`);
    expect(out).toBe(`password="${R}\nnext line stays`);
  });

  it("keeps the R-003 forms working", () => {
    expect(maskSecrets(`password="${fake("abc ", "def ghi")}"`)).toBe(`password="${R}"`);
    expect(maskSecrets(`export TOKEN="${fake("a ", "b c")}"`)).toBe(`export TOKEN="${R}"`);
    expect(maskSecrets('"api_key": "abc123"')).toBe(`"api_key": "${R}"`);
    expect(maskSecrets("password=abc123")).toBe(`password=${R}`);
  });
});

describe("R2-004 Authorization header context vs prose", () => {
  it("masks a short Bearer token inside an Authorization header", () => {
    const token = fake("abc", "123");
    const out = maskSecrets(`Authorization: Bearer ${token}`);
    expect(out).not.toContain(token);
    expect(out).toContain("[REDACTED:bearer]");
  });

  it("masks a short Basic credential inside an Authorization header", () => {
    const out = maskSecrets(`Authorization: Basic ${fake("dT", "pw")}`);
    expect(out).toBe("Authorization: Basic [REDACTED:basic]");
  });

  it("masks a Basic payload that is not valid UTF-8 when it is in an Authorization header", () => {
    // base64("user:" + 0xFF) — decodes to bytes that are not valid UTF-8
    const payload = fake("dXNl", "cjr/");
    const out = maskSecrets(`authorization: basic ${payload}`);
    expect(out).not.toContain(payload);
    expect(out).toContain("[REDACTED:basic]");
  });

  it("also covers Proxy-Authorization and lower-case header names", () => {
    const out = maskSecrets(`proxy-authorization: bearer ${fake("x", "y1")}`);
    expect(out).toContain("[REDACTED:bearer]");
  });

  it("keeps prose untouched: 'Basic auth' and 'bearer authentication'", () => {
    const text = "Basic auth is used by the dashboard; bearer authentication is optional";
    expect(maskSecrets(text)).toBe(text);
  });

  it("is idempotent on header lines", () => {
    const once = maskSecrets(`Authorization: Bearer ${fake("abc", "123")}`);
    expect(maskSecrets(once)).toBe(once);
  });
});
