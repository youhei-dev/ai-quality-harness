/**
 * Backlog 35 (backlog-rest SP1, rest2 SP1): the masker's url-credential regex `(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@`
 * (flags gi) took time quadratic in a run of scheme characters with many word boundaries: at every boundary it read the run to its
 * end, found no "://" and backed off ("a.a.a.…", 64 KiB: about 3.5 s). v0.5.41 finds the same matches by a linear scan that starts
 * from each "://" (src/security/mask.ts); the scheme stays unbounded (ADR-0013, R3-002). The scanner's own pattern is not changed.
 *
 *  (a) Equivalence: the regex is kept in this file as the oracle. maskSecrets must give exactly what the masker gives with the oracle
 *      in place of its url-credential step, for random inputs from a fixed seed (\b, upper case, white space, ":", "/", "@", matches
 *      one after another) and for inputs aimed at the loops of the scan itself. This passes on the code before the fix as well: there
 *      the oracle *is* the masker. It fixes that the fix did not change what is redacted.
 *  (b) Time: 64 KiB inputs stay well under 1,000 ms; the code before the fix needs several times that for the three quadratic shapes
 *      (the record of the failure before the fix). The six shapes aimed at the linear scan are fast on both.
 * Credential-shaped strings exist only at run time (assembled from pieces), so the repository's own security scan sees none.
 */
import { describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { equivalenceInputs } from "./regex-equivalence-inputs.ts";

/** The masker's url-credential regex before v0.5.41 (src/security/patterns.ts, unchanged there). Do not edit: it is the oracle. */
const ORACLE = /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi;

/** The masker as it was: every pattern in order, the url-credential step by the oracle regex. */
function oracleMask(text: string): string {
  let out = text;
  for (const rule of SECRET_PATTERNS) {
    const pattern = rule.category === "url-credential" ? ORACLE : rule.pattern;
    out = typeof rule.replacement === "string" ? out.replace(pattern, rule.replacement) : out.replace(pattern, rule.replacement);
  }
  return out;
}

const KIB = 1024;
const SEP = ":" + "//";
const CRED = "u" + ":" + "p" + "@" + "h";
const repeat = (unit: string, n: number): string => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

/** The shapes that made the regex quadratic (rest2 SP1, time35.ts). */
const QUADRATIC: Record<string, (n: number) => string> = {
  "a. repeated": (n) => repeat("a.", n),
  "ab-cd- repeated": (n) => repeat("ab-cd-", n),
  "a. repeated, then ://": (n) => repeat("a.", n - 3) + SEP,
};

/** The shapes aimed at the loops of the linear scan (rest2 SP1, time35-adversarial.ts). */
const ADVERSARIAL: Record<string, (n: number) => string> = {
  "a:// repeated": (n) => repeat("a" + SEP, n),
  "a run of digits and dots, then ://": (n) => repeat("1.", n - 3) + SEP,
  "a:// and a long user without ':'": (n) => "a" + SEP + "u".repeat(n - 4),
  "a://u: and a long password without '@'": (n) => "a" + SEP + "u:" + "p".repeat(n - 6),
  "a://u:p (no '@') repeated": (n) => repeat("a" + SEP + "u:p ", n),
  "credentials repeated": (n) => repeat("x" + SEP + CRED + " ", n),
};

/** A fixed-seed generator (mulberry32). */
function generator(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const chr = (cp: number): string => String.fromCharCode(cp);
/** Single characters: scheme characters of both cases, a word character that is not one ("_"), the separators, white space (also U+00A0 and U+2028), and letters that only look like ASCII under the i flag (U+017F, U+212A, U+0130). */
const CHARS = ["a", "b", "x", "z", "A", "X", "Z", "0", "1", "9", "+", ".", "-", "_", ":", "/", "@", " ", "\n", "\t", "#", "?", "%", "=", chr(0xa0), chr(0x2028), chr(0x17f), chr(0x212a), chr(0x130), chr(0xe9)];
/** Pieces that make or almost make a credential URL. */
const PIECES = [SEP, ":/", "//", "@", "x" + SEP, "X" + SEP, "a.b-c+d" + SEP, "1a" + SEP, "_a" + SEP, "+a" + SEP, "-" + SEP, "a" + SEP + SEP, CRED, "U:P@H", ":@", "u:", ":p@", "u:p:q@", "u@", SEP + ":@", SEP + "u:@", SEP + ":p@"];

/** Scheme characters, and characters of the user and password parts (with a non-ASCII letter). */
const SCHEME = ["a", "b", "x", "Z", "1", "+", ".", "-"];
const PART = ["u", "p", "X", "0", "_", ".", "-", "+", "%", "=", chr(0xe9)];
/** A run of 0–`max` characters drawn from `chars`. */
const runOf = (rnd: (n: number) => number, chars: readonly string[], max: number): string => Array.from({ length: rnd(max + 1) }, () => chars[rnd(chars.length)]!).join("");
/** Mostly the given characters, one time in four all of them (a near miss). */
const mix = (rnd: (n: number) => number, main: readonly string[]): readonly string[] => (rnd(4) === 0 ? CHARS : main);

/** Something shaped like `<scheme>://<user>:<password>@<host>`; a part drawn from all the characters is often a near miss. */
function urlLike(rnd: (n: number) => number): string {
  return runOf(rnd, mix(rnd, SCHEME), 5) + SEP + runOf(rnd, mix(rnd, PART), 4) + ":" + runOf(rnd, mix(rnd, PART), 4) + "@" + runOf(rnd, CHARS, 3);
}

function randomInputs(count: number, seed: number): string[] {
  const rnd = generator(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const long = rnd(20) === 0;
    const parts = long ? 20 + rnd(80) : 1 + rnd(16);
    let s = "";
    for (let j = 0; j < parts; j++) {
      const k = rnd(6);
      s += k === 0 ? urlLike(rnd) : k === 1 ? PIECES[rnd(PIECES.length)]! : CHARS[rnd(CHARS.length)]!;
    }
    out.push(s);
  }
  return out;
}

describe("backlog 35 (a): maskSecrets redacts exactly what the url-credential regex redacted", () => {
  it("random inputs from a fixed seed: identical output, and the oracle redacts in many of them", () => {
    const inputs = randomInputs(40_000, 20261011);
    const differ = inputs.filter((s) => maskSecrets(s) !== oracleMask(s));
    const redacted = inputs.filter((s) => oracleMask(s) !== s).length;
    const twoOrMore = inputs.filter((s) => (s.match(ORACLE) ?? []).length >= 2).length;
    expect(differ.slice(0, 3).map((s) => JSON.stringify(s))).toEqual([]);
    expect(redacted, "the inputs must exercise the redaction").toBeGreaterThan(10_000);
    expect(twoOrMore, "and matches one after another").toBeGreaterThan(2_000);
  });

  it("the shared url-credential inputs of the regex equivalence test (schemes around 64 characters and longer): identical output", () => {
    const inputs = equivalenceInputs()["url-credential"];
    const differ = inputs.filter((s) => maskSecrets(s) !== oracleMask(s));
    expect(inputs.length).toBeGreaterThan(100);
    expect(differ.slice(0, 3).map((s) => JSON.stringify(s.slice(0, 80)))).toEqual([]);
  });

  it.each(Object.entries(ADVERSARIAL))("aimed at the scan: %s (16 KiB): identical output", (_name, gen) => {
    const s = gen(16 * KIB);
    expect(maskSecrets(s) === oracleMask(s)).toBe(true);
  });

  it.each(Object.entries(QUADRATIC))("the quadratic shape %s (2 KiB, also with credentials after it): identical output", (_name, gen) => {
    for (const s of [gen(2 * KIB), gen(2 * KIB) + SEP + CRED, gen(2 * KIB) + "x" + SEP + CRED]) expect(maskSecrets(s) === oracleMask(s)).toBe(true);
  });

  it("matches one after another, white space and case: identical output (fixed examples)", () => {
    const examples = [
      "x" + SEP + CRED + "x" + SEP + CRED,
      "x" + SEP + CRED + SEP + CRED,
      "X" + SEP + "U:P@H" + " " + "a.b" + SEP + CRED,
      "_a" + SEP + CRED + " a" + SEP + CRED,
      "1a" + SEP + CRED,
      "a" + chr(0xa0) + "b" + SEP + CRED,
      "a" + SEP + "u" + chr(0x2028) + ":p@h",
      chr(0x17f) + "a" + SEP + CRED,
      "a" + SEP + "u:p:q@h",
      "a" + SEP + "u:p@q@h",
      "a" + SEP + "u:p/q@h",
    ];
    for (const s of examples) expect(maskSecrets(s), JSON.stringify(s)).toBe(oracleMask(s));
  });
});

describe("backlog 35 (b): 64 KiB stays far under 1,000 ms", () => {
  const LIMIT_MS = 1_000;
  const time = (s: string): number => {
    const t0 = performance.now();
    maskSecrets(s);
    return performance.now() - t0;
  };
  it.each(Object.entries(QUADRATIC))("%s", (_name, gen) => {
    const s = gen(64 * KIB);
    expect(s.length).toBe(64 * KIB);
    expect(time(s)).toBeLessThan(LIMIT_MS);
  });
  it.each(Object.entries(ADVERSARIAL))("%s", (_name, gen) => {
    const s = gen(64 * KIB);
    expect(time(s)).toBeLessThan(LIMIT_MS);
  });
});
