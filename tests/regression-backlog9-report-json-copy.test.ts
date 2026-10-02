/**
 * Backlog 9, the second sentence (ADR-0020, ADR-0018): the report was copied by `maskDeep()`, which walks a value with
 * `Object.entries()` into an ordinary object. A function in the report was copied as it was and `JSON.stringify()` called its `toJSON`
 * (the answer came out unmasked, M2-2-R4-001 was the same for `safeJson`), and a key named `__proto__` vanished (assigning it to an
 * ordinary object sets the prototype). `buildReport()` now copies the report as JSON data, with the same function as `safeJson()`
 * (src/output.ts `copyJson`): data is accepted, anything else is refused, the copy has no prototype, and every string and key is masked.
 * No report value or key comes from a user as a function or as such a key today (ROADMAP): this is a hardening, and a normal report is
 * written as before. The secret shapes are built at run time.
 */
import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.ts";
import * as out from "../src/output.ts";
import { maskDeep, maskSecrets } from "../src/security/mask.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult, VerificationReport } from "../src/types.ts";
import { checkResult, fake } from "./helpers.ts";

function report(results: CheckResult[]): VerificationReport {
  return buildReport({
    config: {
      projectRoot: "/proj",
      configPath: "/proj/aiqh.config.jsonc",
      project: { name: "demo" },
      outputDir: "/proj/artifacts/verification",
      security: DEFAULT_SECURITY,
      checks: [],
    },
    results,
    git: { commit: "0123456789abcdef", branch: "main", dirty: false },
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: new Date("2026-01-01T00:00:01.000Z"),
    toolVersion: "0.5.24",
  });
}

/** A check result with an own property that the type does not have (what a bug or a hostile value would add). */
function withOwn(name: string, value: unknown): CheckResult {
  const r = checkResult({ name: "unit", kind: "unit" });
  Object.defineProperty(r, name, { value, enumerable: true, configurable: true, writable: true });
  return r;
}

describe("backlog 9: buildReport copies the report as JSON data", () => {
  it("a key named __proto__ stays a key (maskDeep lost it)", () => {
    const r = report([withOwn("__proto__", "kept")]);
    expect(JSON.stringify(r)).toContain('"__proto__":"kept"');
    expect(Object.getPrototypeOf(r.checks[0])).toBe(null);
  });
  it("a value with toJSON is data when it is data (the key stays; nothing calls a function)", () => {
    const r = report([withOwn("toJSON", "just a string")]);
    expect(JSON.parse(JSON.stringify(r)).checks[0].toJSON).toBe("just a string");
  });
  it("a function in the report is refused before anything is written (maskDeep copied it and JSON.stringify called it)", () => {
    expect(() => report([withOwn("toJSON", () => ({ leak: "unmasked" }))])).toThrow(/not JSON data/);
    expect(() => report([withOwn("extra", () => 1)])).toThrow(/not JSON data/);
  });
  it("undefined, a non-finite number and a getter are refused (the report is JSON data or nothing)", () => {
    expect(() => report([withOwn("extra", undefined)])).toThrow(/not JSON data/);
    expect(() => report([withOwn("extra", Number.NaN)])).toThrow(/not JSON data/);
    const r = checkResult({ name: "unit", kind: "unit" });
    Object.defineProperty(r, "extra", { get: () => "x", enumerable: true, configurable: true });
    expect(() => report([r])).toThrow(/not JSON data/);
  });
  it("secret shapes are still masked in values and in keys", () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const r = report([checkResult({ name: "unit", kind: "unit", stdoutTail: `key ${secret} end` }), withOwn(`k-${secret}`, "v")]);
    const text = JSON.stringify(r);
    expect(text).not.toContain(secret);
    expect(text).toContain("[REDACTED:");
  });
  it("a normal report has the same keys in the same order and the same values as the copy of maskDeep", () => {
    const results = [checkResult({ name: "lint", kind: "lint" }), checkResult({ name: "unit", kind: "unit", status: "FAIL", exitCode: 1, errorSummary: "exit code 1: x", stdoutTail: "line 1\nline 2", stderrTail: "e" })];
    const r = report(results);
    expect(JSON.stringify(r)).toBe(JSON.stringify(maskDeep(JSON.parse(JSON.stringify(r)))));
    expect(Object.keys(r)).toEqual(["schemaVersion", "tool", "project", "configPath", "startedAt", "finishedAt", "durationMs", "git", "verdict", "exitCode", "interruptedBy", "summary", "categories", "checks"]);
  });
});

describe("backlog 9: copyJson is the copy that safeJson makes, with the strings left to the caller", () => {
  type CopyJson = <T>(value: T, mapString: (s: string) => string) => T;
  const copyJson: CopyJson = (value, mapString) => {
    const f = (out as { copyJson?: CopyJson }).copyJson;
    if (f === undefined) throw new Error("copyJson does not exist");
    return f(value, mapString);
  };
  it("maps every string and key, keeps numbers, booleans and null, and copies arrays and objects", () => {
    const copy = copyJson({ a: "x", n: 1, t: true, z: null, l: ["y", { b: "z" }] }, (s) => s.toUpperCase());
    expect(JSON.stringify(copy)).toBe('{"A":"X","N":1,"T":true,"Z":null,"L":["Y",{"B":"Z"}]}');
  });
  it("refuses what is not JSON data, with the fixed message", () => {
    for (const bad of [() => 1, undefined, Symbol("s"), 1n, Number.POSITIVE_INFINITY, new Date(0).constructor]) expect(() => copyJson({ v: bad }, (s) => s)).toThrow(/JSON output refused: .* is not JSON data/);
  });
  it("is what safeJson uses: the same refusals, the same output for a normal value", () => {
    expect(out.safeJson({ a: ["b", 1, null], c: { d: "e" } })).toBe(JSON.stringify({ a: ["b", 1, null], c: { d: "e" } }, null, 2));
    expect(() => out.safeJson({ f: () => 1 })).toThrow(/not JSON data/);
  });
  it("maskSecrets as the mapping masks like maskDeep does", () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    expect(JSON.stringify(copyJson({ s: `a ${secret} b` }, maskSecrets))).toBe(JSON.stringify(maskDeep({ s: `a ${secret} b` })));
  });
});
