/**
 * Regression tests for independent review R1 — R-001 / R-002 / R-003
 * (docs/reviews/m0/independent-review-r1.md). Secret masking rules.
 * Test names carry the review ID so the "FAIL before fix / PASS after fix" record can be traced.
 * Dummy secrets are assembled at runtime with fake() (see fake() in tests/helpers.ts).
 */
import { describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { fake } from "./helpers.ts";

describe("R-001 key-value rule: prefixed environment variable names", () => {
  const cases: Array<[string, string]> = [
    [`AWS_SECRET_ACCESS_KEY=${fake("wJalrXUtnFEMI", "K7MDENGbPxRfiCYEXAMPLEKEY")}`, "K7MDENGbPxRfiCYEXAMPLEKEY"],
    [`AWS_SESSION_TOKEN=${fake("FwoGZXIvYXdzE", "Bcd1234567890session")}`, "Bcd1234567890session"],
    [`MY_API_KEY=${fake("myapi", "value123")}`, "myapivalue123"],
    [`FOO_PASSWORD=${fake("hun", "ter2000")}`, "hunter2000"],
    [`XXX_TOKEN=${fake("tok", "en_value_xyz")}`, "token_value_xyz"],
    [`export DATABASE_PASSWORD='${fake("db", "-pass-word")}'`, "db-pass-word"],
  ];
  for (const [input, secret] of cases) {
    it(`masks ${input.split("=")[0]}`, () => {
      const out = maskSecrets(input);
      expect(out).not.toContain(secret);
      expect(out).toContain("[REDACTED:key-value]");
      // the variable name itself stays visible
      expect(out).toContain(input.split("=")[0] ?? "");
    });
  }
});

describe("R-002 bearer rule: case-insensitive scheme and short Basic credentials", () => {
  it("masks lowercase bearer", () => {
    const token = fake("abcdefghijklm", "nopqrstuvwxyz");
    const out = maskSecrets(`Authorization: bearer ${token}`);
    expect(out).not.toContain(token);
    expect(out).toContain("[REDACTED:bearer]");
  });
  it("masks upper-case BEARER", () => {
    const token = fake("ABCDEFGHIJKLM", "NOPQRSTUVWXYZ0123");
    expect(maskSecrets(`authorization: BEARER ${token}`)).not.toContain(token);
  });
  it("masks a short Basic credential (base64 of user:pass)", () => {
    // "dTpw" is base64("u:p"); "dXNlcjpwYXNz" is base64("user:pass")
    const short = fake("dT", "pw");
    const out = maskSecrets(`Authorization: Basic ${short}`);
    expect(out).not.toContain(` ${short}`);
    expect(out).toContain("[REDACTED:basic]");
  });
  it("masks Basic credentials with and without padding, case-insensitively", () => {
    const padded = fake("dXNlcjpw", "YXNzd29yZA=="); // user:password
    const unpadded = fake("dXNlcjpw", "YXNz"); // user:pass
    expect(maskSecrets(`basic ${padded}`)).not.toContain(padded);
    expect(maskSecrets(`BASIC ${unpadded}`)).not.toContain(unpadded);
  });
  it("still leaves the phrase 'Basic auth is used by the dashboard' alone", () => {
    const text = "Basic auth is used by the dashboard";
    expect(maskSecrets(text)).toBe(text);
  });
});

describe("R-003 key-value rule: quoted values containing whitespace", () => {
  const cases: Array<[string, string, string]> = [
    [`password="${fake("abc ", "def ghi")}"`, "def ghi", 'password="[REDACTED:key-value]"'],
    [`password='${fake("one ", "two three")}'`, "two three", "password='[REDACTED:key-value]'"],
    [`{"password": "${fake("abc ", "def")}"}`, "abc def", '{"password": "[REDACTED:key-value]"}'],
    [`SECRET="${fake("x ", "y z")}"`, "y z", 'SECRET="[REDACTED:key-value]"'],
    [`export TOKEN="${fake("a ", "b c")}"`, "b c", 'export TOKEN="[REDACTED:key-value]"'],
    [`api_key: '${fake("k ", "with spaces")}'`, "with spaces", "api_key: '[REDACTED:key-value]'"],
  ];
  for (const [input, tail, expected] of cases) {
    it(`masks the whole quoted value in ${input.slice(0, 14)}…`, () => {
      const out = maskSecrets(input);
      expect(out).not.toContain(tail);
      expect(out).toBe(expected);
      expect(maskSecrets(out)).toBe(out);
    });
  }
  it("keeps masking an unterminated quoted value at least up to the first whitespace", () => {
    const out = maskSecrets(`password="${fake("abc", "123")} trailing`);
    expect(out).not.toContain("abc123");
  });
});
