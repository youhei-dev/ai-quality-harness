/**
 * M2-0-R3-002: v0.3.2 bounded the url-credential scheme to 64 characters in the pattern shared by
 * the masker and the scanner, so the masker stopped redacting credential URLs with a longer scheme
 * (v0.3.1 redacted them). The masker pattern is unbounded again; only the scanner uses a bounded
 * `scanPattern` (the window anchor must be bounded — ADR-0013), and "the scanner does not detect a
 * url-credential whose scheme is longer than 64 characters" is a documented limitation.
 */
import { describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { lineFindings } from "../src/security/scan.ts";
import { fake } from "./helpers.ts";

const credUrl = (schemeLength: number): string => `s${"x".repeat(schemeLength - 1)}://${fake("alice:", "Pw4Rt9zQ")}@host.example`;

describe("M2-0-R3-002: masker coverage of url-credential is not narrowed by the scanner", () => {
  it("scheme of 64 characters is redacted (guard)", () => {
    const out = maskSecrets(`see ${credUrl(64)} end`);
    expect(out).toContain("[REDACTED:url-credential]");
    expect(out).not.toContain("Pw4Rt9zQ");
  });
  it("scheme of 65 and of 5000 characters is redacted as in v0.3.1", () => {
    for (const n of [65, 5000]) {
      const out = maskSecrets(`see ${credUrl(n)} end`);
      expect(out, `scheme ${n}`).toBe(`see s${"x".repeat(n - 1)}://[REDACTED:url-credential]@host.example end`);
    }
  });
  it("masker output for representative inputs is fixed (the shared masker patterns are not changed for the scanner)", () => {
    const D = "-".repeat(5);
    const table: Array<[string, string]> = [
      [`a ${credUrl(3)} b`, "a sxx://[REDACTED:url-credential]@host.example b"],
      [`x ${D}BEGIN ${"L".repeat(300)} PRIVATE KEY${D}\nQk9H\n${D}END ${"L".repeat(300)} PRIVATE KEY${D} y`, "x [REDACTED:private-key] y"],
      [`password = "${fake("Zq7x9", "Lm2Pw4Rt")}"`, 'password = "[REDACTED:key-value]"'],
      [`api_key: '${fake("Zq7x9", "Lm2Pw4Rt")}'`, "api_key: '[REDACTED:key-value]'"],
      [`TOKEN="${fake("Zq7x9", "Lm2 Pw4Rt")}`, 'TOKEN="[REDACTED:key-value]'],
      [`AWS_SESSION_TOKEN=${fake("Zq7x9", "Lm2Pw4Rt")} tail`, "AWS_SESSION_TOKEN=[REDACTED:key-value] tail"],
      ["secret = [REDACTED:anthropic]", "secret = [REDACTED:anthropic]"],
      [`t ${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")} u`, "t [REDACTED:github] u"],
      [`t ${fake("ghr", "_abcdefghijklmnopqrstuvwxyz0123456789")} u`, "t [REDACTED:github] u"],
      [`t ${fake("github_", "pat_abcdefghijklmnopqrstuvwxyz0123456789_AB")} u`, "t [REDACTED:github] u"],
      [`t ${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")}_tail u`, `t ${fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789")}_tail u`],
      [`t ${fake("ghx", "_abcdefghijklmnopqrstuvwxyz0123456789")} u`, `t ${fake("ghx", "_abcdefghijklmnopqrstuvwxyz0123456789")} u`],
    ];
    for (const [input, expected] of table) expect(maskSecrets(input), input.slice(0, 40)).toBe(expected);
  });
});

describe("M2-0-R3-002: which patterns are shared and which are split", () => {
  it("url-credential is the only category whose scanner pattern differs from the masker pattern", () => {
    const split = SECRET_PATTERNS.filter((p) => p.scanPattern !== undefined).map((p) => p.category);
    expect(split).toEqual(["url-credential"]);
  });
  it("documented scanner limitation: a url-credential with a 64-character scheme is detected, one with 65 characters is not", () => {
    expect(lineFindings(credUrl(64))).toContain("url-credential");
    expect(lineFindings(credUrl(65))).not.toContain("url-credential");
  });
});
