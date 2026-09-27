/**
 * M2-2-R4-001 (Medium, fixed in v0.5.10): safeJson() copied a value with Object.entries() and passed the copy to
 * JSON.stringify, so a function in the copy could call back into JSON.stringify: an own toJSON function (or an
 * enumerable getter returning one), a function or class carrying toJSON, an Array subclass or a replaced
 * Symbol.species, a Proxy showing one — and its return value came out without the escape notation and the masker
 * (v0.5.9; no command's --json has such a value). Now safeJson accepts JSON data only and refuses anything else before
 * printing (fail closed; the CLI reports it as an unexpected error, exit 2). Each property is read once; getters and
 * toJSON are never called.
 * Forbidden characters and secret shapes are built at run time.
 */
import { describe, expect, it } from "vitest";
import { createOutput, escapeForDisplay, MAX_JSON_DEPTH, safeJson, type LineMode } from "../src/output.ts";
import { maskSecrets } from "../src/security/mask.ts";
import { isForbiddenCodePoint } from "../src/security/raw-chars.ts";
import { fake } from "./helpers.ts";

const RLO = String.fromCodePoint(0x202e);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const PAYLOAD = (): string => `p ${RLO} ${SECRET()}`;
const KEY = "payload-key";
const raw = (s: string): number => [...s].filter((c) => isForbiddenCodePoint(c.codePointAt(0) ?? 0)).length;
const MODES: readonly LineMode[] = ["keep", "escape"];

/** The value is refused: an error naming the kind only, and nothing reaches the writer. */
function expectRefused(make: () => unknown, mode: LineMode = "keep"): void {
  let message = "";
  expect(() => {
    try {
      safeJson(make(), mode);
    } catch (e) {
      message = (e as Error).message;
      throw e;
    }
  }).toThrow(/^JSON output refused: .+ is not JSON data$/);
  expect(message).not.toContain(RLO);
  expect(message).not.toContain(SECRET());
  expect(message).not.toContain(KEY);
  const written: string[] = [];
  expect(() => createOutput({ log: (l) => written.push(l) }, mode).json(make())).toThrow(/is not JSON data/);
  expect(written).toEqual([]);
}

class StaticToJSON {
  static toJSON(): string {
    return PAYLOAD();
  }
}
class ToJSONArray extends Array<unknown> {
  toJSON(): string {
    return PAYLOAD();
  }
}
const fnWithToJSON = (): unknown => Object.assign(() => 1, { toJSON: () => PAYLOAD() });

/** Every form of v0.5.9 in which JSON.stringify called a function of the value (docs/reviews/m2-2/response-r4.md, v0.5.10). */
const CALLBACK_FORMS: Array<[string, () => unknown]> = [
  ["own toJSON (function)", () => ({ toJSON: () => PAYLOAD() })],
  ["own toJSON (enumerable getter returning a function)", () => Object.defineProperty({}, "toJSON", { enumerable: true, get: () => () => PAYLOAD() })],
  ["own toJSON on an object without a prototype", () => Object.assign(Object.create(null) as object, { toJSON: () => PAYLOAD() })],
  ["a function with toJSON", fnWithToJSON],
  ["a class with a static toJSON", () => StaticToJSON],
  ["a getter returning a function with toJSON", () => Object.defineProperty({}, KEY, { enumerable: true, get: fnWithToJSON })],
  ["an Array subclass with toJSON", () => ToJSONArray.from([1])],
  ["an array with a replaced Symbol.species", () => {
    const a: unknown[] = [1];
    const other = { toJSON: () => PAYLOAD() };
    Object.defineProperty(a, "constructor", { value: { [Symbol.species]: function () { return other; } } });
    return a;
  }],
  ["a Proxy showing an own toJSON", () => new Proxy({}, {
    ownKeys: () => ["toJSON"],
    getOwnPropertyDescriptor: () => ({ value: () => PAYLOAD(), enumerable: true, configurable: true, writable: true }),
    get: (_t, k) => (k === "toJSON" ? () => PAYLOAD() : undefined),
  })],
  ["a Proxy of an array whose element has toJSON", () => {
    const element = { toJSON: () => PAYLOAD() };
    return new Proxy([0], {
      getOwnPropertyDescriptor: (t, k) => (k === "0" ? { value: element, enumerable: true, configurable: true, writable: true } : Reflect.getOwnPropertyDescriptor(t, k)),
      get: (t, k) => (k === "0" ? element : Reflect.get(t, k)),
    });
  }],
  ["a callable Proxy with toJSON", () => new Proxy(() => 1, { get: (t, k) => (k === "toJSON" ? () => PAYLOAD() : Reflect.get(t, k)) })],
];

const PLACES: Array<[string, (v: unknown) => unknown]> = [
  ["top level", (v) => v],
  ["object property", (v) => ({ a: 1, [KEY]: v })],
  ["array element", (v) => ({ list: [1, v] })],
  ["object in an array in an object", (v) => ({ outer: [{ inner: v }] })],
];

describe("M2-2-R4-001: a value that calls back into JSON.stringify is refused", () => {
  it("every v0.5.9 form, in every place, in both line modes: refused, nothing written", () => {
    for (const [, make] of CALLBACK_FORMS) {
      for (const [, wrap] of PLACES) {
        for (const mode of MODES) expectRefused(() => wrap(make()), mode);
      }
    }
  });

  it("a getter is never called, and toJSON is never called", () => {
    let calls = 0;
    expectRefused(() => Object.defineProperty({}, KEY, { enumerable: true, get: () => ++calls }));
    expectRefused(() => ({ toJSON: () => ++calls }));
    expect(calls).toBe(0);
  });

  it("only property descriptors are read: a Proxy whose get differs from its descriptor prints the descriptor's data", () => {
    const out = safeJson({ x: new Proxy([0], { get: (t, k) => (k === "0" ? { toJSON: () => PAYLOAD() } : Reflect.get(t, k)) }) });
    expect(raw(out)).toBe(0);
    expect(out).not.toContain(SECRET());
    expect(JSON.parse(out)).toEqual({ x: [0] });
  });

  it("a value read differently each time cannot pass the check and then change (one read per property)", () => {
    const flipping = (): object => {
      let reads = 0;
      const val = (): unknown => (reads++ === 0 ? "ok" : fnWithToJSON());
      return new Proxy({}, {
        ownKeys: () => [KEY],
        getOwnPropertyDescriptor: () => ({ value: val(), enumerable: true, configurable: true, writable: true }),
        get: (_t, k) => (k === KEY ? val() : undefined),
      });
    };
    const out = safeJson({ holder: flipping() });
    expect(raw(out)).toBe(0);
    expect(out).not.toContain(SECRET());
    expect(JSON.parse(out)).toEqual({ holder: { [KEY]: "ok" } });
  });
});

describe("M2-2-R4-001: every other value that is not JSON data is refused", () => {
  const cycle = (): object => {
    const o: Record<string, unknown> = { a: 1 };
    o[KEY] = o;
    return o;
  };
  const nested = (depth: number): unknown => {
    let v: unknown = "leaf";
    for (let i = 0; i < depth; i++) v = i % 2 === 0 ? [v] : { [KEY]: v };
    return v;
  };
  const cases: Array<[string, () => unknown]> = [
    ["function", () => ({ [KEY]: () => PAYLOAD() })],
    ["symbol", () => ({ [KEY]: Symbol(PAYLOAD()) })],
    ["bigint", () => ({ [KEY]: 10n })],
    ["undefined (property)", () => ({ [KEY]: undefined })],
    ["undefined (array element)", () => [undefined]],
    ["undefined (top level)", () => undefined],
    ["NaN", () => ({ [KEY]: Number.NaN })],
    ["Infinity", () => ({ [KEY]: Number.POSITIVE_INFINITY })],
    ["-Infinity", () => [Number.NEGATIVE_INFINITY]],
    ["Date", () => ({ [KEY]: new Date(0) })],
    ["Map", () => ({ [KEY]: new Map([[PAYLOAD(), PAYLOAD()]]) })],
    ["Set", () => ({ [KEY]: new Set([PAYLOAD()]) })],
    ["RegExp", () => ({ [KEY]: /x/ })],
    ["Error", () => ({ [KEY]: Object.assign(new Error(PAYLOAD()), { code: PAYLOAD() }) })],
    ["Buffer", () => ({ [KEY]: Buffer.from(SECRET()) })],
    ["Uint8Array", () => ({ [KEY]: new Uint8Array(Buffer.from(SECRET())) })],
    ["Promise", () => ({ [KEY]: Promise.resolve(PAYLOAD()) })],
    ["class instance", () => ({ [KEY]: new (class { own = PAYLOAD(); })() })],
    ["String object", () => ({ [KEY]: new String(PAYLOAD()) })],
    ["Number object", () => [new Number(1)]],
    ["Boolean object", () => [new Boolean(true)]],
    ["an object with another prototype", () => Object.assign(Object.create({ inherited: PAYLOAD() }) as object, { [KEY]: 1 })],
    ["accessor property", () => Object.defineProperty({}, KEY, { enumerable: true, get: () => PAYLOAD() })],
    ["non-enumerable property", () => Object.defineProperty({ a: 1 }, KEY, { value: PAYLOAD(), enumerable: false })],
    ["symbol key", () => ({ [Symbol(KEY)]: PAYLOAD(), a: 1 })],
    ["array with a hole", () => {
      const a: number[] = [];
      a[0] = 1;
      a[2] = 3;
      return a;
    }],
    ["array with a key that is not an index", () => Object.assign([1], { [KEY]: PAYLOAD() })],
    ["circular reference", cycle],
    [`nesting deeper than ${MAX_JSON_DEPTH}`, () => nested(MAX_JSON_DEPTH + 1)],
  ];
  for (const [name, make] of cases) {
    it(name, () => {
      for (const mode of MODES) expectRefused(make, mode);
    });
  }
});

describe("M2-2-R4-001 controls: JSON data keeps its v0.5.9 output", () => {
  // v0.5.9's safeJson, rebuilt here: every string and key escaped, then masked; a copy without prototypes
  const v059 = (v: unknown, mode: LineMode): string => {
    const copy = (x: unknown): unknown => {
      if (typeof x === "string") return maskSecrets(escapeForDisplay(x, mode));
      if (Array.isArray(x)) return x.map(copy);
      if (x !== null && typeof x === "object") {
        const out = Object.create(null) as Record<string, unknown>;
        for (const [k, y] of Object.entries(x)) out[maskSecrets(escapeForDisplay(k, mode))] = copy(y);
        return out;
      }
      return x;
    };
    return JSON.stringify(copy(v), null, 2);
  };
  it("strings, numbers (-0 prints 0), booleans, null, arrays and objects of either prototype; keys such as __proto__ and toJSON", () => {
    const shared = { s: PAYLOAD() };
    const value = {
      root: `/tmp/作業/dir${RLO}x`,
      findings: [{ file: "a.ts", line: 1, endLine: 1, message: `x ${SECRET()}` }],
      numbers: [0, -0, 1.5, -2, 1e21, Number.MAX_SAFE_INTEGER],
      flags: [true, false, null],
      empty: [[], {}],
      bare: Object.assign(Object.create(null) as object, { a: PAYLOAD() }),
      parsed: JSON.parse('{"__proto__": {"a": 1}, "constructor": "c", "prototype": "p", "toJSON": "not a function"}') as unknown,
      shared: [shared, shared],
      deep: nestedOk(),
    };
    function nestedOk(): unknown {
      let v: unknown = "leaf";
      for (let i = 0; i < MAX_JSON_DEPTH - 1; i++) v = [v];
      return v;
    }
    for (const mode of MODES) {
      const out = safeJson(value, mode);
      expect(out).toBe(v059(value, mode));
      expect(raw(out)).toBe(0);
      expect(out).not.toContain(SECRET());
    }
    expect(safeJson(-0)).toBe("0");
    expect(safeJson({ n: -0 })).toBe(JSON.stringify({ n: 0 }, null, 2));
  });
});
