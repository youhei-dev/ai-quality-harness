/**
 * M2-0-R3-001: the private-key anchor was not a prefix of the private-key pattern (anchor label
 * `{0,32}`, pattern / block begin label `*`), so a BEGIN marker longer than the overlap that
 * straddled a window boundary was lost (0 findings). The anchor is now the literal "-----BEGIN ".
 * Recurrence guards: (1) a structural test — every scanned pattern (and block begin) is built as
 * anchor source + rest, so the anchor is a textual prefix of the body with identical quantifier
 * bounds; (2) a property test whose generator lengths always include 0, 1, anchorMaxBytes ±1,
 * lineOverlapBytes ±1, maxCarryBytes ±1 and, for unbounded parts, more than maxCarryBytes.
 * PEM markers are assembled at run time from pieces so no source line matches the scanner.
 */
import { describe, expect, it } from "vitest";
import { SECRET_PATTERNS } from "../src/security/patterns.ts";
import { DEFAULT_SECURITY, MAX_CARRY_BYTES, MAX_LINE_BYTES, lineFindings, scanString } from "../src/security/scan.ts";

const DASHES = "-".repeat(5);
const beginMarker = (label: string): string => `${DASHES}BEGIN ${label}PRIVATE KEY${DASHES}`;
const endMarker = (label: string): string => `${DASHES}END ${label}PRIVATE KEY${DASHES}`;
const pem = (label: string): string => `${beginMarker(label)}MIIEfakekeyQk9HVVM${endMarker("RSA ")}`;
const cats = (findings: Array<{ kind: string; category?: string }>) => findings.filter((f) => f.kind === "secret" || f.kind === "oversized-candidate").map((f) => `${f.kind}:${f.category}`);
const MIN_SETTINGS = { ...DEFAULT_SECURITY, maxLineBytes: 4096, lineOverlapBytes: 256, maxCarryBytes: 2048 };
const firstWindowEnd = (maxLineBytes: number, chunk: number): number => Math.ceil((maxLineBytes + 1) / chunk) * chunk;

describe("M2-0-R3-001: long BEGIN labels across the window boundary", () => {
  const chunk = 512;
  const boundary = firstWindowEnd(MIN_SETTINGS.maxLineBytes, chunk);
  const everyCut = (label: string): string[] => {
    const secret = pem(label);
    const marker = beginMarker(label).length;
    const lost: string[] = [];
    for (let cut = 1; cut < marker; cut += 1) {
      const line = ",".repeat(boundary - cut) + secret + ",".repeat(MIN_SETTINGS.maxLineBytes * 2);
      const found = cats(scanString(line, MIN_SETTINGS, chunk));
      if (!found.includes("secret:private-key")) lost.push(`cut ${cut}: ${JSON.stringify(found)}`);
    }
    return lost;
  };
  it("label of 33 characters (anchor bound + 1), minimum overlap: every cut inside the marker yields private-key", () => {
    expect(everyCut("A".repeat(33))).toEqual([]);
  });
  it("label of 260 characters (marker longer than the overlap), lineOverlapBytes = 256: every cut yields private-key", () => {
    const lost = everyCut("A".repeat(260));
    expect(lost, lost.slice(0, 3).join("\n")).toEqual([]);
  });
  it("label over 4 KiB, default settings: private-key (the candidate fits in maxCarryBytes)", () => {
    const label = "B".repeat(5000);
    const secret = pem(label);
    const boundaryDefault = firstWindowEnd(MAX_LINE_BYTES, 64 * 1024);
    const marker = beginMarker(label).length;
    for (const cut of [1, 11, 12, 256, 4095, 4096, 4097, 4200, marker - 17, marker - 1]) {
      const line = ",".repeat(boundaryDefault - cut) + secret + ",".repeat(20_000);
      expect(cats(scanString(line)), `cut ${cut}`).toContain("secret:private-key");
    }
  });
  it("label longer than maxCarryBytes, default settings: cut inside the overlap → private-key; cut beyond maxCarryBytes → oversized-candidate (fail closed), never nothing", () => {
    const label = "C".repeat(MAX_CARRY_BYTES + 3000);
    const at = (cut: number): string[] => cats(scanString(",".repeat(firstWindowEnd(MAX_LINE_BYTES, 64 * 1024) - cut) + pem(label) + ",".repeat(20_000)));
    expect(at(100)).toContain("secret:private-key");
    const far = at(MAX_CARRY_BYTES + 1000);
    expect(far.length, "cut beyond maxCarryBytes").toBeGreaterThan(0);
    expect(far.every((c) => c === "oversized-candidate:private-key" || c === "secret:private-key"), JSON.stringify(far)).toBe(true);
  });
  it("guard: every one of these lines matches private-key without windows", () => {
    for (const n of [33, 260, 5000, MAX_CARRY_BYTES + 3000]) expect(lineFindings(`,,${pem("A".repeat(n))},,`), `label ${n}`).toContain("private-key");
  });
});

/** Index of the first top-level "|" in a regex source (outside groups and classes), or -1. */
function topLevelAlternation(source: string): number {
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "|" && depth === 0) return i;
  }
  return -1;
}

describe("M2-0-R3-001: structure — every scanned body is anchor source + rest", () => {
  /** Patterns that cannot be written as anchor + rest, with the reason. Must stay empty. */
  const EXCEPTIONS: Array<{ category: string; reason: string }> = [];
  it("the exception list is empty", () => {
    expect(EXCEPTIONS).toEqual([]);
  });
  it("for every scanned pattern the scanner body (and the block begin) starts with the anchor source, with the same flags, and the anchor is a complete sub-expression", () => {
    const problems: string[] = [];
    for (const p of SECRET_PATTERNS.filter((q) => q.scan)) {
      if (EXCEPTIONS.some((e) => e.category === p.category)) continue;
      const anchor = p.anchor;
      if (!anchor) {
        problems.push(`${p.category}: no anchor`);
        continue;
      }
      const a = anchor.start;
      const bodies: Array<[string, RegExp]> = [["scanner body", p.scanPattern ?? p.pattern]];
      if (p.scanMode === "block" && p.block) bodies.push(["block begin", p.block.begin]);
      if (topLevelAlternation(a.source) !== -1) problems.push(`${p.category}: anchor has a top-level alternation`);
      for (const [what, body] of bodies) {
        if (!body.source.startsWith(a.source)) {
          problems.push(`${p.category}: ${what} does not start with the anchor source`);
          continue;
        }
        // the character after the anchor must not quantify or extend the anchor's last atom (same bounds)
        const next = body.source.slice(a.source.length, a.source.length + 1);
        if (/^[*+?{]$/.test(next)) problems.push(`${p.category}: ${what} quantifies the anchor's last atom`);
        if (topLevelAlternation(body.source) !== -1) problems.push(`${p.category}: ${what} has a top-level alternation`);
        const flags = (r: RegExp): string => r.flags.replace(/[gy]/g, "");
        if (what === "scanner body" && flags(body) !== flags(a)) problems.push(`${p.category}: flags differ (${flags(body)} / ${flags(a)})`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});

/**
 * Property test with lengths chosen from the limits (fixed seed 20260923). For each scanned
 * category, every variable part takes each length of {0, 1, anchorMaxBytes ± 1, lineOverlapBytes ± 1,
 * maxCarryBytes ± 1} inside its own bounds, plus maxCarryBytes + 300 for unbounded parts; the other
 * parts stay at their minimum. The secret is placed across the first window boundary at offsets
 * chosen from the same limits. Neutral filler ",": a secret no longer than maxCarryBytes must give
 * its own category; a longer one its category or an oversized-candidate.
 */
describe("M2-0-R3-001: property test with limit-derived lengths", () => {
  let seed = 20260923;
  const rnd = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
  const ALPHABET = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_/:@?#%=.-+\"' "];
  const run = (cls: string, n: number): string => {
    const chars = ALPHABET.filter((c) => new RegExp(`^${cls}$`).test(c));
    return Array.from({ length: n }, () => chars[rnd(chars.length)]!).join("");
  };
  // Patterns ending in \b: the last character of each generated secret is a fixed word character ("Z"), counted in the part length.
  type Part = { name: string; min: number; max: number };
  type Spec = { category: string; parts: Part[]; build: (len: Record<string, number>) => string };
  const INF = Number.POSITIVE_INFINITY;
  const SPECS: Spec[] = [
    {
      category: "private-key",
      parts: [
        { name: "label", min: 0, max: INF },
        { name: "key", min: 0, max: INF },
        { name: "endLabel", min: 0, max: INF },
      ],
      build: (l) => `${beginMarker(run("[A-Z0-9 ]", l.label!))}${run("[A-Za-z0-9+/=]", l.key!)}${endMarker(run("[A-Z0-9 ]", l.endLabel!))}`,
    },
    {
      category: "url-credential",
      parts: [
        { name: "scheme", min: 0, max: 63 },
        { name: "user", min: 1, max: INF },
        { name: "pass", min: 1, max: INF },
      ],
      build: (l) => `h${run("[a-z0-9+.-]", l.scheme!)}://${run("[^\\s/:@,]", l.user!)}:${run("[^\\s/@,]", l.pass!)}@`,
    },
    { category: "anthropic", parts: [{ name: "tail", min: 8, max: INF }], build: (l) => `sk-ant-${run("[A-Za-z0-9_-]", l.tail! - 1)}Z` },
    { category: "openai", parts: [{ name: "tail", min: 16, max: INF }], build: (l) => `sk-x${run("[A-Za-z0-9_-]", l.tail! - 2)}Z` },
    { category: "aws", parts: [{ name: "tail", min: 16, max: 16 }], build: (l) => `AKIA${run("[A-Z0-9]", l.tail!)}` },
    { category: "github", parts: [{ name: "tail", min: 20, max: INF }], build: (l) => `ghp_${run("[A-Za-z0-9]", l.tail!)}` },
    { category: "github", parts: [{ name: "patTail", min: 20, max: INF }], build: (l) => `github_pat_${run("[A-Za-z0-9_]", l.patTail! - 1)}Z` },
    { category: "slack", parts: [{ name: "tail", min: 10, max: INF }], build: (l) => `xoxb-${run("[A-Za-z0-9-]", l.tail!)}` },
    { category: "google", parts: [{ name: "tail", min: 35, max: 35 }], build: (l) => `AIza${run("[0-9A-Za-z_-]", l.tail! - 1)}Z` },
    { category: "gitlab", parts: [{ name: "tail", min: 16, max: INF }], build: (l) => `glpat-${run("[A-Za-z0-9_-]", l.tail! - 1)}Z` },
    {
      category: "jwt",
      parts: [
        { name: "a", min: 8, max: INF },
        { name: "b", min: 8, max: INF },
        { name: "c", min: 8, max: INF },
      ],
      build: (l) => `eyJ${run("[A-Za-z0-9_-]", l.a!)}.${run("[A-Za-z0-9_-]", l.b!)}.${run("[A-Za-z0-9_-]", l.c! - 1)}Z`,
    },
    {
      category: "key-value",
      parts: [
        { name: "before", min: 0, max: INF },
        { name: "after", min: 0, max: INF },
        { name: "value", min: 8, max: INF },
      ],
      build: (l) => `password${" ".repeat(l.before!)}=${" ".repeat(l.after!)}"Zq7x9${run("[A-Za-z0-9_]", l.value! - 5)}"`,
    },
  ];
  const settings = MIN_SETTINGS;
  const chunk = 512;
  const boundary = firstWindowEnd(settings.maxLineBytes, chunk);
  const O = settings.lineOverlapBytes;
  const C = settings.maxCarryBytes;
  const anchorMax = (category: string): number => SECRET_PATTERNS.find((p) => p.category === category)!.anchor!.anchorMaxBytes;
  const lengthsFor = (part: Part, category: string): number[] => {
    const A = anchorMax(category);
    const raw = [0, 1, A - 1, A, A + 1, O - 1, O, O + 1, C - 1, C, C + 1, ...(part.max === INF ? [C + 300] : [part.max]), part.min];
    return [...new Set(raw.filter((n) => n >= part.min && n <= part.max))].sort((x, y) => x - y);
  };

  it("whole-line findings are never lost; a secret within maxCarryBytes keeps its category", () => {
    const failures: string[] = [];
    let cases = 0;
    for (const spec of SPECS) {
      const A = anchorMax(spec.category);
      for (const part of spec.parts) {
        for (const n of lengthsFor(part, spec.category)) {
          const lens = Object.fromEntries(spec.parts.map((p) => [p.name, p === part ? n : p.min === 0 ? 1 : p.min]));
          const secret = spec.build(lens);
          const offsets = [...new Set([1, A - 1, A, A + 1, O - 1, O, O + 1, secret.length - 1, 1 + rnd(Math.max(1, secret.length - 1))])].filter((k) => k >= 1 && k < secret.length);
          for (const k of offsets) {
            cases += 1;
            const line = ",".repeat(boundary - k) + secret + ",".repeat(settings.maxLineBytes * 2);
            if (!lineFindings(line).includes(spec.category)) {
              failures.push(`${spec.category} ${part.name}=${n} offset ${k}: generated secret does not match without windows (generator bug)`);
              continue;
            }
            const found = new Set(cats(scanString(line, settings, chunk)));
            const ok = secret.length <= C ? found.has(`secret:${spec.category}`) : found.has(`secret:${spec.category}`) || found.has(`oversized-candidate:${spec.category}`);
            if (!ok) failures.push(`${spec.category} ${part.name}=${n} offset ${k} (secret ${secret.length} chars): ${JSON.stringify([...found])}`);
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(500);
    expect(failures, `${failures.length} failures\n${failures.slice(0, 8).join("\n")}`).toEqual([]);
  });
});
