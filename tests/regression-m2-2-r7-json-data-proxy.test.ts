/**
 * M2-2-R7-001〜003 (Medium, fixed in v0.5.12): safeJson() on a Proxy (v0.5.10 / v0.5.11).
 * - R7-001: an array's length was read with value.length, so a Proxy array's get trap ran.
 * - R7-002: an array's own keys were only counted, so a Proxy array that showed a symbol or a non-index key through
 *   ownKeys and an index through its descriptor trap was accepted.
 * - R7-003: an exception from a reflective operation (a trap, or the engine checking a trap's answer and quoting a key)
 *   left safeJson unchanged, so the message could carry user text; a thrown value whose inspection throws broke the CLI's
 *   last handler (Node printed it raw, exit 1).
 * Now the length is read from its descriptor, the key set is matched exactly, and every reflective operation's exception
 * becomes the fixed refusal without the thrown value being read.
 * Forbidden characters and secret shapes are built at run time.
 */
import { describe, expect, it } from "vitest";
import { createOutput, safeJson } from "../src/output.ts";
import { fake } from "./helpers.ts";

const RLO = String.fromCodePoint(0x202e);
const LF = String.fromCodePoint(0x0a);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const MARK = (): string => `marker-r7 ${RLO}${LF} ${SECRET()}`;
const KEY = (): string => `k${RLO}${SECRET()}`;
const desc = (value: unknown, extra: object = {}): PropertyDescriptor => ({ value, enumerable: true, configurable: true, writable: true, ...extra });

/** Refused with a fixed kind, no marker / key / secret in the message, nothing written. */
function expectRefused(make: () => unknown): string {
  let message = "";
  try {
    safeJson(make());
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toMatch(/^JSON output refused: .+ is not JSON data$/);
  expect(message).not.toContain("marker-r7");
  expect(message).not.toContain(RLO);
  expect(message).not.toContain(SECRET());
  const written: string[] = [];
  expect(() => createOutput({ log: (l) => written.push(l) }).json(make())).toThrow(/is not JSON data/);
  expect(written).toEqual([]);
  return message;
}

describe("M2-2-R7-001: an array's length is read from its descriptor, never through get", () => {
  it("a Proxy array's get trap is not called (a get that throws is never reached)", () => {
    let gets = 0;
    const p = new Proxy([1, "a"], { get: () => { gets += 1; throw new Error(MARK()); } });
    expect(JSON.parse(safeJson(p))).toEqual([1, "a"]);
    expect(gets).toBe(0);
  });

  it("a length descriptor that is not a valid array length is refused", () => {
    const withLength = (d: PropertyDescriptor): unknown => new Proxy([1], { getOwnPropertyDescriptor: (t, k) => (k === "length" ? d : Reflect.getOwnPropertyDescriptor(t, k)) });
    for (const value of [1.5, -1, 2 ** 32, Number.NaN]) {
      expect(expectRefused(() => withLength({ value, writable: true, enumerable: false, configurable: false }))).toMatch(/length|could not be inspected/);
    }
  });
});

describe("M2-2-R7-002: an array's own keys are exactly 0..length-1 and length", () => {
  const cases: Array<[string, () => unknown]> = [
    ["ownKeys [length, symbol], descriptor shows 0", () => new Proxy([1], { ownKeys: () => ["length", Symbol("s")], getOwnPropertyDescriptor: (t, k) => (k === "0" ? desc(1) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["ownKeys [length, extra], descriptor shows 0", () => new Proxy([1], { ownKeys: () => ["length", "extra"], getOwnPropertyDescriptor: (t, k) => (k === "0" ? desc(1) : k === "extra" ? desc(MARK()) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["ownKeys lacks index 1, padded with extra; descriptor shows 1 later", () => new Proxy([1, 2], { ownKeys: () => ["0", "length", "extra"], getOwnPropertyDescriptor: (t, k) => (k === "extra" ? desc(MARK()) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["index 1 shown as \"01\"", () => new Proxy([1, 2], { ownKeys: () => ["0", "01", "length"], getOwnPropertyDescriptor: (t, k) => (k === "01" ? desc(2) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["index 1 shown as \"1.0\"", () => new Proxy([1, 2], { ownKeys: () => ["0", "1.0", "length"], getOwnPropertyDescriptor: (t, k) => (k === "1.0" ? desc(2) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["index 0 shown as \"-0\"", () => new Proxy([1], { ownKeys: () => ["-0", "length"], getOwnPropertyDescriptor: (t, k) => (k === "-0" ? desc(1) : Reflect.getOwnPropertyDescriptor(t, k)) })],
    ["an index at or above length", () => new Proxy([1], { ownKeys: () => ["1", "length"], getOwnPropertyDescriptor: (t, k) => (k === "1" ? desc(2) : Reflect.getOwnPropertyDescriptor(t, k)) })],
  ];
  for (const [name, make] of cases) it(name, () => expectRefused(make));
});

describe("M2-2-R7-003: an exception from a reflective operation becomes the fixed refusal, the thrown value unread", () => {
  const throwing = (thrown: () => unknown): Array<[string, () => unknown]> => [
    ["getPrototypeOf", () => new Proxy({ a: 1 }, { getPrototypeOf: () => { throw thrown(); } })],
    ["ownKeys", () => new Proxy({ a: 1 }, { ownKeys: () => { throw thrown(); } })],
    ["getOwnPropertyDescriptor", () => new Proxy({ a: 1 }, { getOwnPropertyDescriptor: () => { throw thrown(); } })],
    ["an array's length descriptor", () => new Proxy([1], { getOwnPropertyDescriptor: (t, k) => { if (k === "length") throw thrown(); return Reflect.getOwnPropertyDescriptor(t, k); } })],
    ["an array element's descriptor", () => new Proxy([1], { getOwnPropertyDescriptor: (t, k) => { if (k === "0") throw thrown(); return Reflect.getOwnPropertyDescriptor(t, k); } })],
    ["nested in an object", () => ({ ok: 1, inner: new Proxy({}, { getPrototypeOf: () => { throw thrown(); } }) })],
  ];

  it("a trap that throws an Error with user text: refused with the fixed kind", () => {
    for (const [, make] of throwing(() => new Error(MARK()))) expect(expectRefused(make)).toBe("JSON output refused: a value whose structure could not be inspected is not JSON data");
  });

  it("a trap that throws a string or an object with toString: refused with the fixed kind", () => {
    for (const thrown of [() => MARK(), () => ({ toString: () => MARK() })]) for (const [, make] of throwing(thrown)) expectRefused(make);
  });

  it("the thrown value is never read: a hostile Proxy or an Error whose message getter throws is not touched", () => {
    let touched = 0;
    const hostile = (): unknown => new Proxy({}, { getPrototypeOf: () => { touched += 1; throw new Error(MARK()); }, get: () => { touched += 1; throw new Error(MARK()); } });
    const badMessage = (): unknown => Object.defineProperty(new Error("x"), "message", { get: () => { touched += 1; throw new Error(MARK()); } });
    for (const thrown of [hostile, badMessage]) for (const [, make] of throwing(thrown)) expectRefused(make);
    expect(touched).toBe(0);
  });

  it("user code inside a reflective operation: the handler's trap lookup, ownKeys' array-like, a descriptor object's getter", () => {
    const handler = new Proxy({}, { get: () => { throw new Error(MARK()); } });
    expectRefused(() => new Proxy({}, handler));
    const keys = new Proxy(["a"], { get: (t, k, r) => { if (k === "length") throw new Error(MARK()); return Reflect.get(t, k, r); } });
    expectRefused(() => new Proxy({ a: 1 }, { ownKeys: () => keys as unknown as string[] }));
    expectRefused(() => new Proxy({ a: 1 }, { getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, get value(): unknown { throw new Error(MARK()); } }) as PropertyDescriptor }));
  });

  it("the engine's own errors about a trap's answer, which quote a user key, are refused with the fixed kind", () => {
    const nonConfig = (): object => Object.defineProperty({}, KEY(), { value: 1, enumerable: true, configurable: false });
    expectRefused(() => new Proxy(nonConfig(), { ownKeys: () => [] }));
    expectRefused(() => new Proxy(nonConfig(), { getOwnPropertyDescriptor: () => undefined }));
    expectRefused(() => new Proxy({}, { ownKeys: () => [KEY()], getOwnPropertyDescriptor: () => desc(1, { configurable: false }) }));
    expectRefused(() => new Proxy({}, { ownKeys: () => [KEY(), KEY()] }));
  });

  it("revoked proxies, at the top, nested, or revoked while being read", () => {
    const revoked = (): object => {
      const r = Proxy.revocable({ a: 1 }, {});
      r.revoke();
      return r.proxy;
    };
    expectRefused(revoked);
    expectRefused(() => ({ x: revoked() }));
    expectRefused(() => [revoked()]);
    expectRefused(() => {
      const r = Proxy.revocable([1], { ownKeys: (t) => { const k = Reflect.ownKeys(t); r.revoke(); return k; } });
      return r.proxy;
    });
  });
});

describe("M2-2-R7 controls: a Proxy that shows plain data prints like the data", () => {
  it("objects and arrays behind a Proxy without traps, and with traps that forward", () => {
    const value = { a: [1, "x", { b: null }], c: true };
    const forward: ProxyHandler<object> = { getPrototypeOf: (t) => Reflect.getPrototypeOf(t), ownKeys: (t) => Reflect.ownKeys(t), getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k) };
    expect(safeJson(new Proxy(value, {}))).toBe(safeJson(value));
    expect(safeJson(new Proxy(value, forward))).toBe(safeJson(value));
    expect(safeJson({ a: new Proxy([1, "x", { b: null }], forward), c: true })).toBe(safeJson(value));
    expect(safeJson(new Proxy([], {}))).toBe("[]");
  });

  it("an array Proxy whose ownKeys lacks an index without padding was already refused by the count (v0.5.11 too)", () => {
    expectRefused(() => new Proxy([1, 2], { ownKeys: () => ["0", "length"] }));
  });
});
