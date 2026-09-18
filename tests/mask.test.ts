import { describe, expect, it } from "vitest";
import { MASK_CATEGORIES, maskDeep, maskSecrets } from "../src/security/mask.ts";
import { fake } from "./helpers.ts";

// Every "secret" below is synthetic filler. The values are assembled at runtime with
// `fake(prefix, body)` so that no secret-shaped literal exists in the repository
// (the pre-push guard would otherwise flag these fixtures as leaked credentials).
const CASES: Array<{ category: string; input: string; mustNotContain: string }> = [
  {
    category: "anthropic",
    input: `key ${fake("sk-", "ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef")} end`,
    mustNotContain: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef",
  },
  {
    category: "openai",
    input: `OPENAI ${fake("sk-", "proj-abcdefghijklmnopqrstuvwxyz012345")} tail`,
    mustNotContain: "abcdefghijklmnopqrstuvwxyz012345",
  },
  { category: "aws", input: `id ${fake("AKIA", "ABCDEFGHIJKLMNOP")} x`, mustNotContain: "ABCDEFGHIJKLMNOP" },
  {
    category: "github",
    input: `gh ${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")} done`,
    mustNotContain: "abcdefghijklmnopqrstuvwxyz0123456789",
  },
  {
    category: "github",
    input: `pat ${fake("github_", "pat_abcdefghijklmnopqrstuvwxyz0123456789_ABC")}`,
    mustNotContain: "abcdefghijklmnopqrstuvwxyz0123456789_ABC",
  },
  {
    category: "slack",
    input: fake("xoxb", "-1234567890-abcdefghijklmnop"),
    mustNotContain: "1234567890-abcdefghijklmnop",
  },
  {
    category: "google",
    // Google API keys are exactly "AIza" + 35 characters.
    input: `key ${fake("AIza", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678")} end`,
    mustNotContain: "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678",
  },
  {
    category: "gitlab",
    input: fake("glpat", "-abcdefghijklmnopqrstuvwxyz"),
    mustNotContain: "abcdefghijklmnopqrstuvwxyz",
  },
  {
    category: "jwt",
    input: `jwt ${fake("eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz")}`,
    mustNotContain: "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  },
  {
    category: "bearer",
    input: `Authorization: Bearer ${fake("abcdefghijklm", "nopqrstuvwxyz0123")}`,
    mustNotContain: "abcdefghijklmnopqrstuvwxyz0123",
  },
  {
    category: "url-credential",
    input: `clone https://${fake("alice:", "hunter2pass")}@example.invalid/repo.git`,
    mustNotContain: "hunter2pass",
  },
  { category: "key-value", input: `password=${fake("Super", "SecretValue1")}`, mustNotContain: "SuperSecretValue1" },
  { category: "key-value", input: `API_KEY = "${fake("abc-", "DEF-123")}"`, mustNotContain: "abc-DEF-123" },
  { category: "key-value", input: `"client_secret": "${fake("zzz-", "yyy-xxx")}"`, mustNotContain: "zzz-yyy-xxx" },
  { category: "key-value", input: `export TOKEN=${fake("tok_", "1234567890")}`, mustNotContain: "tok_1234567890" },
  {
    category: "private-key",
    input: `${fake("-----BEGIN RSA ", "PRIVATE KEY-----")}\nMIIEfake\nline2\n${fake("-----END RSA ", "PRIVATE KEY-----")}`,
    mustNotContain: "MIIEfake",
  },
];

const GITHUB_TOKEN = fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789");
const AWS_KEY = fake("AKIA", "ABCDEFGHIJKLMNOP");

describe("maskSecrets", () => {
  for (const c of CASES) {
    it(`masks ${c.category}: ${c.input.slice(0, 12)}…`, () => {
      const out = maskSecrets(c.input);
      expect(out).not.toContain(c.mustNotContain);
      expect(out).toContain(`[REDACTED:${c.category}]`);
    });
  }

  it("does not re-mask an already redacted value under a different category", () => {
    expect(maskSecrets(`--token=${GITHUB_TOKEN}`)).toBe("--token=[REDACTED:github]");
  });

  it("keeps the key name in key/value pairs", () => {
    expect(maskSecrets("password=abc123")).toBe("password=[REDACTED:key-value]");
    expect(maskSecrets('"api_key": "abc123"')).toBe('"api_key": "[REDACTED:key-value]"');
  });

  it("keeps the scheme and host for URL credentials", () => {
    // the credential part is assembled at runtime so the source holds no URL-credential literal
    expect(maskSecrets(`https://${fake("user:", "pw")}@example.invalid/x`)).toBe(
      "https://[REDACTED:url-credential]@example.invalid/x",
    );
  });

  it("is idempotent", () => {
    for (const c of CASES) {
      const once = maskSecrets(c.input);
      expect(maskSecrets(once)).toBe(once);
    }
  });

  it("leaves ordinary text, git hashes and paths alone", () => {
    const text =
      "commit 3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39 on main\n" +
      "src/runner/execute.ts:12 error TS2322\n" +
      "Basic auth is used by the dashboard\n" +
      "npm run lint";
    expect(maskSecrets(text)).toBe(text);
  });

  it("does not require a leading word boundary for prefixed tokens inside quotes", () => {
    expect(maskSecrets(`{"k":"${fake("sk-", "ant-abcdefghijklmnop")}"}`)).toBe(
      '{"k":"[REDACTED:anthropic]"}',
    );
  });

  it("exposes its category list", () => {
    expect(MASK_CATEGORIES).toContain("key-value");
    expect(MASK_CATEGORIES).toContain("private-key");
  });
});

describe("maskDeep", () => {
  it("masks every string value at any depth and keeps structure", () => {
    const input = {
      a: "password=topsecret",
      n: 42,
      b: true,
      z: null,
      nested: { list: [GITHUB_TOKEN, { deep: AWS_KEY }] },
    };
    const out = maskDeep(input);
    expect(out.n).toBe(42);
    expect(out.b).toBe(true);
    expect(out.z).toBeNull();
    expect(out.a).toBe("password=[REDACTED:key-value]");
    expect(out.nested.list[0]).toBe("[REDACTED:github]");
    expect((out.nested.list[1] as { deep: string }).deep).toBe("[REDACTED:aws]");
    expect(JSON.stringify(out)).not.toContain("topsecret");
  });

  it("produces valid JSON after masking JSON-like content", () => {
    const report = { checks: [{ stderrTail: '{"password": "abc", "token": "xyz"}' }] };
    const out = maskDeep(report);
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
    expect(out.checks[0]?.stderrTail).not.toContain("abc");
    expect(out.checks[0]?.stderrTail).not.toContain("xyz");
  });
});
