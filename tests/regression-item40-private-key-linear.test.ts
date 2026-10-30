/**
 * Item 40 (v0.18.0; ADR-0013 addendum, the batch3 design, final, §4): the masker's private-key regex (a begin marker
 * `<5 hyphens>BEGIN [A-Z0-9 ]*PRIVATE KEY<5 hyphens>`, a lazy `[\s\S]*?` and an end marker, flag g) searched to the end of the text for
 * an end marker after every begin marker that had none, so many begin markers without an end took time quadratic in the input.
 * v0.18.0 finds the same matches with a linear scan (src/security/mask.ts, maskPrivateKeys); the pattern stays as the definition.
 *
 *  (a) Equivalence: the regex is the oracle (built from the pattern's source and flags, which are pinned below). maskSecrets must give
 *      exactly what the masker gives with the oracle in place of its private-key step, for random inputs from a fixed seed, for the
 *      shared private-key inputs of the regex equivalence test and for inputs aimed at the scan. This passes on the code before the
 *      change too: there the oracle is the masker (the record of the change is that the output did not change).
 *  (b) Time (53-F, docs/ops/ci-and-branch-protection.md 8-1): the CPU time of this thread for 256 KiB and 1 MiB, the least of 3 reads,
 *      t(1 MiB) <= 8 x t(256 KiB) + 20 ms, for begin markers without an end (quadratic before the change) and three shapes aimed at the
 *      scan's own loops.
 * Markers exist only at run time (assembled from pieces), so the repository's own security scan sees none.
 */
import { describe, expect, it } from "vitest";
import { maskSecrets } from "../src/security/mask.ts";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { equivalenceInputs } from "./regex-equivalence-inputs.ts";

const D = "-".repeat(5);
const BEGIN_HEAD = `${D}BEGIN `;
const END_HEAD = `${D}END `;
const TAIL = `PRIVATE KEY${D}`;
const BEGIN = (label = "RSA "): string => `${BEGIN_HEAD}${label}${TAIL}`;
const END = (label = "RSA "): string => `${END_HEAD}${label}${TAIL}`;

const RULE = SECRET_PATTERNS.find((r) => r.category === "private-key");
if (RULE === undefined) throw new Error("no private-key pattern");
/** The pattern of src/security/patterns.ts (kept there as the definition) is the oracle; its source is pinned here. */
const ORACLE = new RegExp(RULE.pattern.source, RULE.pattern.flags);

/** The masker as before item 40: every pattern in order, the private-key step by the oracle regex. */
function oracleMask(text: string): string {
  let out = text;
  for (const rule of SECRET_PATTERNS) {
    const pattern = rule.category === "private-key" ? ORACLE : rule.pattern;
    out = typeof rule.replacement === "string" ? out.replace(pattern, rule.replacement) : out.replace(pattern, rule.replacement);
  }
  return out;
}

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

/** The pieces of the random inputs (the batch3 design, final, §4.3): heads, labels, the tail and its halves, hyphens, line ends, words. */
const PIECES = [BEGIN_HEAD, END_HEAD, BEGIN_HEAD, END_HEAD, "RSA ", "EC ", "OPENSSH ", "PRIVATE KEY", "-".repeat(4), D, "-".repeat(6), "PRIVATE", " KEY", "\n", "\r\n", "A", "z", "0", "9", " ", "-", "BEGIN", "END", BEGIN(), END(), BEGIN(""), END("")];

function randomInputs(count: number, seed: number): string[] {
  const rnd = generator(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const parts = 1 + rnd(14);
    let s = "";
    for (let j = 0; j < parts; j += 1) s += PIECES[rnd(PIECES.length)] ?? "";
    out.push(s);
  }
  return out;
}

describe("item 40 (a): maskSecrets redacts exactly what the private-key regex redacted", () => {
  it("the oracle is the pattern of patterns.ts, unchanged: the source and the flags", () => {
    expect(RULE.pattern.source).toBe(`${D}BEGIN [A-Z0-9 ]*PRIVATE KEY${D}[\\s\\S]*?${D}END [A-Z0-9 ]*PRIVATE KEY${D}`);
    expect(RULE.pattern.flags).toBe("g");
  });

  it("random inputs from a fixed seed (1 to 14 pieces): identical output, and the oracle redacts in many of them", () => {
    const inputs = randomInputs(100_000, 20261030);
    const differ = inputs.filter((s) => maskSecrets(s) !== oracleMask(s));
    const redacted = inputs.filter((s) => oracleMask(s) !== s).length;
    const twoOrMore = inputs.filter((s) => (s.match(ORACLE) ?? []).length >= 2).length;
    expect(differ.slice(0, 3).map((s) => JSON.stringify(s))).toEqual([]);
    expect(redacted, "the inputs must exercise the redaction").toBeGreaterThan(5_000);
    expect(twoOrMore, "and matches one after another").toBeGreaterThan(200);
  });

  it("the shared private-key inputs of the regex equivalence test: identical output", () => {
    const inputs = equivalenceInputs()["private-key"];
    const differ = inputs.filter((s) => maskSecrets(s) !== oracleMask(s));
    expect(inputs.length).toBeGreaterThan(500);
    expect(differ.slice(0, 3).map((s) => JSON.stringify(s.slice(0, 80)))).toEqual([]);
  });

  it("aimed inputs: nesting, END first, labels, hyphens, CRLF, repeats, matches in a row, other secrets next to it", () => {
    const body = "\nMIIEab\ncd\n";
    const examples = [
      `${BEGIN()}${BEGIN()}${body}${END()}`,
      `${END()}${BEGIN()}${body}${END()}`,
      `${BEGIN("")}${body}${END("")}`,
      `${BEGIN("PRIVATE KEY ")}${body}${END()}`,
      `${BEGIN_HEAD}PRIVATE KEY PRIVATE KEY${D}${body}${END()}`,
      `${"-".repeat(4)}BEGIN RSA ${TAIL}${body}${END()}`,
      `${"-".repeat(6)}BEGIN RSA ${TAIL}${body}${END()}`,
      `${BEGIN()}${body}${"-".repeat(4)}END RSA ${TAIL}`,
      `${BEGIN()}${body}${END_HEAD}RSA PRIVATE KEY${"-".repeat(4)}`,
      `${BEGIN()}${body}${END_HEAD}RSA PRIVATE KEY${"-".repeat(6)}tail`,
      `${BEGIN()}\r\nab\r\n${END()}\r\n`,
      `${BEGIN()}${BEGIN()}${BEGIN()}`,
      `${END()}${END()}${END()}`,
      `${BEGIN()}${body}${END()}${BEGIN()}${body}${END()}`,
      `${BEGIN()}${body}${END()} and ${BEGIN()}`,
      `${BEGIN()}${body}${END()}${END()}`,
      `${BEGIN("rsa ")}${body}${END()}`,
      `${BEGIN("RSA 2048 ")}${body}${END("EC ")}`,
      `${BEGIN_HEAD}R-SA ${TAIL}${body}${END()}`,
      `${BEGIN_HEAD}RSA PRIVATE${D}${body}${END()}`,
      `${BEGIN()}${body}${END_HEAD}${END()}`,
      `${BEGIN()}${END_HEAD}${END_HEAD}${END_HEAD}x`,
      `x${":"}//u${":"}p@h ${BEGIN()}${body}${END()}`,
      `${BEGIN_HEAD}${"A".repeat(300)}${TAIL}${body}${END()}`,
      // found by the mutations of v0.18.0: the last hyphen of an end marker and 4 hyphens after it look like a begin head; the regex goes
      // on from the end of the match and does not see it (a scan that went back one character would)
      `${BEGIN()}${body}${END()}${"-".repeat(4)}BEGIN RSA ${TAIL}${body}${END()}`,
    ];
    for (const s of examples) expect(maskSecrets(s), JSON.stringify(s)).toBe(oracleMask(s));
    expect(examples.filter((s) => oracleMask(s) !== s).length, "most of them are redacted").toBe(16);
  });
});

describe("item 40 (b): the time grows linearly (CPU time, 256 KiB and 1 MiB, least of 3)", () => {
  const KIB = 1024;
  const fill = (unit: string, size: number): string => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  const shapes: Record<string, (n: number) => string> = {
    "begin markers without an end (quadratic before the change)": (n) => fill(`${BEGIN()}\n`, n),
    "end markers only": (n) => fill(`${END()}\n`, n),
    "long runs of label characters that do not end in PRIVATE KEY": (n) => `${BEGIN_HEAD}${fill("AB CD 12 ", n - BEGIN_HEAD.length)}`,
    "a begin marker, then end heads again and again": (n) => `${BEGIN()}${fill(END_HEAD, n - BEGIN().length)}`,
  };
  const cpuMs = (fn: () => void): number => {
    const start = process.threadCpuUsage();
    fn();
    const used = process.threadCpuUsage(start);
    return (used.user + used.system) / 1000;
  };
  const least = (s: string): number => Math.min(...Array.from({ length: 3 }, () => cpuMs(() => maskSecrets(s))));
  // T3 (docs/ops/ci-and-branch-protection.md 8-1): max(30 s, 12 x the quiet time); every shape takes well under a second after the change
  it.each(Object.keys(shapes))("%s", (name) => {
    const make = shapes[name];
    if (make === undefined) throw new Error(name);
    const small = make(256 * KIB);
    const big = make(1024 * KIB);
    expect(small.length).toBe(256 * KIB);
    expect(big.length).toBe(1024 * KIB);
    const t256 = least(small);
    const t1024 = least(big);
    expect(t1024 <= 8 * t256 + 20, `256 KiB ${t256.toFixed(1)} ms, 1 MiB ${t1024.toFixed(1)} ms of CPU`).toBe(true);
  }, 30_000);
});
