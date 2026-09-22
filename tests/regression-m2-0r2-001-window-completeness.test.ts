/**
 * M2-0-R2-001: window scanning is complete. Invariant: for any single line, every finding the line
 * scanners produce on the whole line (no windows) is also produced by the windowed scan — same
 * category — or turns into an "oversized-candidate" finding; the windowed scan never ends with
 * nothing. Holds for every valid window setting, line length and secret position. Enforced by
 * bounded anchors (anchorMaxBytes), a minimum overlap (MIN_LINE_OVERLAP_BYTES >= every anchor),
 * carrying from the earliest unresolved anchor, and `partial` regexes that resolve candidates.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, parseConfigText, resolveConfig } from "../src/config/load.ts";
import { MIN_LINE_OVERLAP_BYTES } from "../src/config/window-limits.ts";
import { KEY_VALUE_KEYS, SECRET_PATTERNS } from "../src/security/patterns.ts";
import { DEFAULT_SECURITY, LINE_OVERLAP, MAX_CARRY_BYTES, MAX_LINE_BYTES, lineFindings, scanRepository, scanString } from "../src/security/scan.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';
const CHUNK = 64 * 1024;
/** Where the first window of a newline-free file ends when read in 64 KiB chunks with the default limits. */
const FIRST_WINDOW_END = Math.ceil((MAX_LINE_BYTES + 1) / CHUNK) * CHUNK;

function repo(name: string, content: string): string {
  const t = makeTempDir("aiqh-r2-001-");
  cleanups.push(t.cleanup);
  execFileSync("git", ["init", "-q"], { cwd: t.dir });
  writeFileSync(path.join(t.dir, ".gitignore"), ".env\n.env.*\n");
  writeFileSync(path.join(t.dir, name), content);
  execFileSync("git", ["add", "--", ".gitignore", name], { cwd: t.dir });
  return t.dir;
}
const cats = (findings: Array<{ kind: string; category?: string }>) => findings.filter((f) => f.kind === "secret" || f.kind === "oversized-candidate").map((f) => `${f.kind}:${f.category}`);

/** Synthetic secret of each scanned line category (runtime concatenation only). */
const SAMPLES: Record<string, () => string> = {
  "url-credential": () => `https://${fake("alice:", "hunter2pass")}@host.example`,
  anthropic: () => fake("sk-ant-", "api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef"),
  openai: () => fake("sk-", "proj-abcdefghijklmnopqrstuvwxyz012345"),
  aws: () => fake("AKIA", "ABCDEFGHIJKLMNOP"),
  github: () => fake("ghp", "_abcdefghijklmnopqrstuvwxyz0123456789"),
  slack: () => fake("xoxb", "-1234567890-abcdefghijklmnop"),
  google: () => fake("AIza", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678"),
  gitlab: () => fake("glpat", "-abcdefghijklmnopqrstuvwxyz"),
  jwt: () => fake("eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz"),
  "key-value": () => `password="${fake("Zq7x9", "Lm2Pw4Rt")}"`,
  "private-key": () => `${fake("-----BEGIN RSA ", "PRIVATE KEY-----")}MIIEfakekey${fake("-----END RSA ", "PRIVATE KEY-----")}`,
};

describe("M2-0-R2-001: the reviewer's reproduction (default settings)", () => {
  const user = "u".repeat(10_000);
  const cred = `https://${user}:${fake("Secret", "123!")}@host.example`;
  const line = "-".repeat(322_000) + cred + "-".repeat(500_000 - 322_000 - cred.length);
  it("a URL credential whose anchor straddles the first window boundary is found by the windowed scan", () => {
    const r = scanRepository(repo("long.txt", line));
    expect(cats(r.findings)).toEqual(["secret:url-credential"]);
    expect(JSON.stringify(r)).not.toContain("Secret123");
  });
  it("guard: the same line matches the url-credential pattern without windows", () => {
    expect(lineFindings(line)).toContain("url-credential");
  });
  it("a username longer than maxCarryBytes ends as an oversized-candidate, never as nothing", () => {
    const huge = `https://${"u".repeat(MAX_CARRY_BYTES + 5000)}:${fake("Secret", "123!")}@host.example`;
    const l = "-".repeat(FIRST_WINDOW_END - 2000) + huge + "-".repeat(50_000);
    const found = cats(scanRepository(repo("huge.txt", l)).findings);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((c) => c === "oversized-candidate:url-credential" || c === "secret:url-credential")).toBe(true);
  });
});

describe("M2-0-R2-001: minimum overlap", () => {
  const resolve = (security: string) => resolveConfig(parseConfigText(`{ ${BASE}, "security": { ${security} } }`), "/tmp/aiqh.config.jsonc");
  it("lineOverlapBytes = 1 is rejected (ConfigError); the minimum itself is accepted", () => {
    expect(() => resolve('"lineOverlapBytes": 1')).toThrow(ConfigError);
    expect(() => resolve(`"lineOverlapBytes": ${MIN_LINE_OVERLAP_BYTES - 1}`)).toThrow(ConfigError);
    expect(resolve(`"lineOverlapBytes": ${MIN_LINE_OVERLAP_BYTES}`).security.lineOverlapBytes).toBe(MIN_LINE_OVERLAP_BYTES);
    expect(LINE_OVERLAP).toBeGreaterThanOrEqual(MIN_LINE_OVERLAP_BYTES);
  });
  it("every scanned pattern declares a bounded anchor no longer than the minimum overlap; anchor regexes have no unbounded quantifier", () => {
    for (const p of SECRET_PATTERNS.filter((q) => q.scan && q.anchor)) {
      const a = p.anchor!;
      expect(a.anchorMaxBytes, p.category).toBeGreaterThan(0);
      expect(a.anchorMaxBytes, p.category).toBeLessThanOrEqual(MIN_LINE_OVERLAP_BYTES);
      const outsideClasses = a.start.source.replace(/\[(?:\\.|[^\]\\])+\]/g, "[]");
      expect(outsideClasses, `${p.category} anchor must not use * + or {n,}`).not.toMatch(/(?<!\\)[*+]|\{\d+,\}/);
      // the longest thing the anchor can match: feed a long run of every character class it accepts
      const probe = `${"a".repeat(300)}://${"b".repeat(300)}:${"c".repeat(300)}`;
      const re = new RegExp(a.start.source, a.start.flags.includes("g") ? a.start.flags : `${a.start.flags}g`);
      let m: RegExpExecArray | null;
      while ((m = re.exec(probe)) !== null) {
        expect(m[0].length, `${p.category} anchor match`).toBeLessThanOrEqual(a.anchorMaxBytes);
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
  });
  it("partial: every prefix of each sample secret (from its anchor) is still an unresolved candidate", () => {
    for (const p of SECRET_PATTERNS.filter((q) => q.scan && q.anchor)) {
      const sample = SAMPLES[p.category]?.();
      expect(sample, `sample for ${p.category}`).toBeDefined();
      if (!sample) continue;
      const startRe = new RegExp(p.anchor!.start.source, p.anchor!.start.flags.replace("g", ""));
      const at = startRe.exec(sample);
      expect(at, `${p.category} anchor in sample`).not.toBeNull();
      const from = at?.index ?? 0;
      const main = new RegExp(p.pattern.source, p.pattern.flags.replace("g", ""));
      const whole = main.exec(sample);
      expect(whole, `${p.category} sample must match its pattern`).not.toBeNull();
      const end = (whole?.index ?? 0) + (whole?.[0].length ?? 0); // prefixes of the match, not of the trailing context
      for (let len = from + 1; len <= end; len += 1) {
        const prefix = sample.slice(from, len);
        expect(p.anchor!.partial.test(prefix), `${p.category}: partial should match prefix of length ${len - from}`).toBe(true);
      }
    }
  });
});

describe("M2-0-R2-001: fixed anchors cut by the window boundary with the minimum overlap", () => {
  const settings = { ...DEFAULT_SECURITY, maxLineBytes: 4096, lineOverlapBytes: MIN_LINE_OVERLAP_BYTES, maxCarryBytes: 2048 };
  const chunk = 512;
  const firstEnd = Math.ceil((settings.maxLineBytes + 1) / chunk) * chunk;
  for (const category of ["anthropic", "openai", "aws", "github", "slack", "google", "gitlab", "jwt"]) {
    it(`${category}: every cut inside the anchor still yields the finding`, () => {
      const sample = SAMPLES[category]!();
      const anchorLen = new RegExp(SECRET_PATTERNS.find((p) => p.category === category)!.anchor!.start.source, "i").exec(sample)![0].length;
      for (let cut = 1; cut <= anchorLen; cut += 1) {
        const line = "-".repeat(firstEnd - cut) + sample + "-".repeat(3000);
        expect(cats(scanString(line, settings, chunk)), `${category} cut ${cut}`).toContain(`secret:${category}`);
      }
    });
  }
});

describe("M2-0-R2-001: key-value across the boundary", () => {
  const settings = { ...DEFAULT_SECURITY, maxLineBytes: 4096, lineOverlapBytes: MIN_LINE_OVERLAP_BYTES, maxCarryBytes: 2048 };
  const chunk = 512;
  const firstEnd = Math.ceil((settings.maxLineBytes + 1) / chunk) * chunk;
  it("long whitespace after the key name straddles the boundary → still found", () => {
    const line = "-".repeat(firstEnd - 20) + `password${" ".repeat(600)}= "${fake("Zq7x9", "Lm2Pw4Rt")}"` + "-".repeat(3000);
    expect(cats(scanString(line, settings, chunk))).toContain("secret:key-value");
  });
  it("the quoted value straddles the boundary → still found", () => {
    const line = "-".repeat(firstEnd - 30) + `password = "${"x".repeat(200)}${fake("Zq7x9", "Lm2Pw4Rt")}"` + "-".repeat(3000);
    expect(cats(scanString(line, settings, chunk))).toContain("secret:key-value");
  });
});

describe("M2-0-R2-001: property test (fixed seed) — whole-line findings ⊆ windowed findings ∪ oversized", () => {
  it("200 random cases", () => {
    let s = 20260920;
    const rnd = (n: number): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return Math.floor((s / 4294967296) * n);
    };
    const categories = Object.keys(SAMPLES);
    const failures: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const maxLineBytes = 4096;
      const lineOverlapBytes = MIN_LINE_OVERLAP_BYTES + rnd(1024);
      const maxCarryBytes = lineOverlapBytes + rnd(maxLineBytes - lineOverlapBytes + 1);
      const settings = { ...DEFAULT_SECURITY, maxLineBytes, lineOverlapBytes, maxCarryBytes };
      const chunk = 512;
      const category = categories[rnd(categories.length)]!;
      let secret = SAMPLES[category]!();
      if (category === "url-credential") secret = `https://${"u".repeat(rnd(3000))}:${fake("hunter2", "pass")}@host.example`;
      if (category === "key-value") secret = `password${" ".repeat(rnd(600))}="${fake("Zq7x9", "Lm2Pw4Rt")}"`;
      const length = maxLineBytes * (1 + rnd(5));
      const boundary = Math.ceil((maxLineBytes + 1) / chunk) * chunk;
      const pos = rnd(2) === 0 ? Math.max(0, boundary - rnd(secret.length + 64)) : rnd(Math.max(1, length - secret.length));
      const line = "-".repeat(pos) + secret + "-".repeat(Math.max(0, length - pos - secret.length));
      const whole = new Set(lineFindings(line));
      const windowed = new Set(cats(scanString(line, settings, chunk)));
      for (const c of whole) {
        if (!windowed.has(`secret:${c}`) && !windowed.has(`oversized-candidate:${c}`)) failures.push(`case ${i}: ${c} lost (overlap ${lineOverlapBytes}, carry ${maxCarryBytes}, pos ${pos}, len ${line.length}, secret ${secret.length} chars)`);
      }
    }
    expect(failures, failures.slice(0, 5).join("\n")).toEqual([]);
  });
});

/**
 * 追加1: the three properties behind the invariant, checked with generated secrets whose character
 * classes come from the main pattern's own bracket expressions (not re-typed) and always include the
 * delimiters the class allows. 追加2: the URL scheme bound and the shared key list. 追加3: with a
 * neutral filler the windowed scan must produce the real category (not oversized) whenever the
 * secret fits in maxCarryBytes. 追加4: a PEM BEGIN inside a 300 KiB line yields exactly one finding.
 */
describe("M2-0-R2-001 / 追加1–4: properties behind the invariant", () => {
  let seed = 424242;
  const rnd = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
  const DELIMS = ["/", ":", "@", "?", "#", "%", "=", ".", "-", "+", '"', "'"];
  const ALPHABET = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_", ...DELIMS, " ", ",", ";"];
  /** Bracket expressions of a pattern's source, in order (the generator draws its characters from these). */
  const classesOf = (p: (typeof SECRET_PATTERNS)[number]): string[] => [...p.pattern.source.matchAll(/\[(?:\\.|[^\]\\])+\]/g)].map((m) => m[0]);
  const charsOf = (cls: string): string[] => ALPHABET.filter((c) => new RegExp(`^${cls}$`).test(c));
  /** Random run of `n` characters of the class that always contains every allowed delimiter (when n allows). */
  const run = (cls: string, n: number): string => {
    const chars = charsOf(cls);
    const allowedDelims = DELIMS.filter((d) => chars.includes(d));
    const body = Array.from({ length: Math.max(0, n - allowedDelims.length) }, () => chars[rnd(chars.length)]!);
    const out = [...allowedDelims, ...body];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out.slice(0, n).join("");
  };
  const byCat = Object.fromEntries(SECRET_PATTERNS.filter((p) => p.scan && p.anchor).map((p) => [p.category, p])) as Record<string, (typeof SECRET_PATTERNS)[number]>;
  /** Generators: literal skeleton from the pattern, character classes from the pattern source by index. */
  const GEN: Record<string, () => string> = {
    "url-credential": () => {
      const [scheme0, scheme, user, pass] = classesOf(byCat["url-credential"]!) as [string, string, string, string];
      return `${run(scheme0, 1)}${run(scheme, rnd(64))}://${run(user, 1 + rnd(40))}:${run(pass, 1 + rnd(40))}@`;
    },
    anthropic: () => `sk-ant-${run(classesOf(byCat.anthropic!)[0]!, 8 + rnd(40))}`,
    openai: () => `sk-${run(classesOf(byCat.openai!)[0]!, 16 + rnd(40)).replace(/^ant-/, "xnt-")}`,
    aws: () => `${rnd(2) ? "AKIA" : "ASIA"}${run(classesOf(byCat.aws!)[0]!, 16)}`,
    github: () => {
      const [p1, c1, c2, c3] = classesOf(byCat.github!) as [string, string, string, string];
      const k = rnd(3);
      return k === 0 ? `gh${run(p1, 1)}_${run(c1, 20 + rnd(20))}` : k === 1 ? `ghr_${run(c2, 20 + rnd(20))}` : `github_pat_${run(c3, 20 + rnd(20))}`;
    },
    slack: () => {
      const [k, c] = classesOf(byCat.slack!) as [string, string];
      return `xox${run(k, 1)}-${run(c, 10 + rnd(30))}`;
    },
    google: () => `AIza${run(classesOf(byCat.google!)[0]!, 35)}`,
    gitlab: () => `glpat-${run(classesOf(byCat.gitlab!)[0]!, 16 + rnd(30))}`,
    jwt: () => {
      const [a, b, c] = classesOf(byCat.jwt!) as [string, string, string];
      return `eyJ${run(a, 8 + rnd(30))}.${run(b, 8 + rnd(30))}.${run(c, 8 + rnd(30))}`;
    },
    "key-value": () => {
      const key = KEY_VALUE_KEYS.split("|")[rnd(15)]!.replace(/\[_-\]\?/g, () => (rnd(3) === 0 ? "" : rnd(2) ? "_" : "-"));
      const cls = classesOf(byCat["key-value"]!);
      const dq = cls.find((c) => c.startsWith('[^"'))!;
      const sq = cls.find((c) => c.startsWith("[^'"))!;
      const bare = cls.find((c) => c.startsWith("[^\\s"))!;
      const value = fake("Zq7", `x9${run(rnd(3) === 0 ? bare : rnd(2) ? dq : sq, 6 + rnd(30)).replace(/\\/g, "")}`);
      const form = rnd(3);
      // a bare value must not look like code (looksLikeSecretValue rejects . : / -> :: ( ) [ ] { }), quoted values may contain anything printable
      const v = form === 0 ? `"${value.replace(/"/g, "")}"` : form === 1 ? `'${value.replace(/'/g, "")}'` : value.replace(/[\s"',;.:/()[\]{}-]/g, "");
      return `${key}${" ".repeat(rnd(4))}${rnd(2) ? "=" : ":"}${" ".repeat(rnd(4))}${v}`;
    },
    "private-key": () => `${fake("-----BEGIN ", `${run("[A-Z0-9 ]", rnd(20)).trim()} PRIVATE KEY-----`)}${run("[A-Za-z0-9+/=]", 20 + rnd(60))}${fake("-----END ", "PRIVATE KEY-----")}`,
  };
  const CASES = 30;
  /** Patterns ending in \b need the secret to end in a word character, otherwise the sample would not be a match at all. */
  const endsWordChar = (category: string, secret: string): string => (byCat[category]!.pattern.source.endsWith("\\b") && !/[A-Za-z0-9_]$/.test(secret) ? `${secret.slice(0, -1)}Z` : secret);
  for (const [category, gen] of Object.entries(GEN)) GEN[category] = () => endsWordChar(category, gen());

  it("property 1 — the anchor is a prefix of every match: anchor.start matches at the start of each generated secret", () => {
    for (const [category, gen] of Object.entries(GEN)) {
      const p = byCat[category]!;
      const main = new RegExp(p.pattern.source, p.pattern.flags.replace("g", ""));
      const sticky = new RegExp(p.anchor!.start.source, `${p.anchor!.start.flags.replace(/[gy]/g, "")}y`);
      for (let i = 0; i < CASES; i += 1) {
        const secret = gen();
        const text = `, ${secret} ,`;
        const m = main.exec(text);
        expect(m, `${category} sample ${i} must match its own pattern: ${JSON.stringify(secret.slice(0, 20))}…`).not.toBeNull();
        sticky.lastIndex = m!.index;
        expect(sticky.test(text), `${category} sample ${i}: anchor must match at the match start`).toBe(true);
      }
    }
  });
  it("property 2 — partial is closed under prefixes: every prefix of each generated match (from its start) matches partial", () => {
    for (const [category, gen] of Object.entries(GEN)) {
      const p = byCat[category]!;
      const main = new RegExp(p.pattern.source, p.pattern.flags.replace("g", ""));
      for (let i = 0; i < CASES; i += 1) {
        const secret = gen();
        const text = `, ${secret} ,`;
        const m = main.exec(text)!;
        const whole = text.slice(m.index, m.index + m[0].length);
        for (let len = 1; len <= whole.length; len += 1) {
          expect(p.anchor!.partial.test(whole.slice(0, len)), `${category} sample ${i}: prefix ${len}/${whole.length} of ${JSON.stringify(whole.slice(0, 12))}…`).toBe(true);
        }
      }
    }
  });
  it("property 3 — every anchor fits in the minimum overlap", () => {
    for (const p of SECRET_PATTERNS.filter((q) => q.scan && q.anchor)) expect(p.anchor!.anchorMaxBytes, p.category).toBeLessThanOrEqual(MIN_LINE_OVERLAP_BYTES);
    expect(LINE_OVERLAP).toBeGreaterThanOrEqual(MIN_LINE_OVERLAP_BYTES);
  });
  it("追加2 — the URL scheme is bounded in the scanner pattern too (65+ chars never match); key-value main / anchor / partial share KEY_VALUE_KEYS", () => {
    // M2-0-R3-002: the bound applies to the scanner's scanPattern only; the masker's pattern is unbounded again.
    const url = byCat["url-credential"]!;
    const scanner = url.scanPattern ?? url.pattern;
    const main = new RegExp(scanner.source, scanner.flags.replace("g", ""));
    expect(main.test(`${"a".repeat(64)}://${fake("u:", "p")}@h`)).toBe(true);
    expect(main.test(`${"a".repeat(65)}://${fake("u:", "p")}@h`)).toBe(false);
    const kv = byCat["key-value"]!;
    expect(kv.pattern.source).toContain(KEY_VALUE_KEYS);
    expect(kv.anchor!.start.source).toContain(KEY_VALUE_KEYS);
    expect(kv.anchor!.partial.source).toContain(KEY_VALUE_KEYS);
  });
  it("追加3 — neutral filler: a secret no longer than maxCarryBytes yields its own category, a longer one an oversized-candidate", () => {
    // Filler "," is not a word character (so \b holds at both ends of every sample), matches no anchor,
    // and terminates a bare key-value value ([^\s"',;] excludes it).
    const settings = { ...DEFAULT_SECURITY, maxLineBytes: 4096, lineOverlapBytes: 256, maxCarryBytes: 1024 };
    const chunk = 512;
    const boundary = Math.ceil((settings.maxLineBytes + 1) / chunk) * chunk;
    let short = 0;
    let long = 0;
    for (let i = 0; i < 120; i += 1) {
      const category = Object.keys(GEN)[rnd(Object.keys(GEN).length)]!;
      let secret = GEN[category]!();
      if (category === "url-credential") {
        const [s0, s1, u, pw] = classesOf(byCat["url-credential"]!) as [string, string, string, string];
        secret = `${run(s0, 1)}${run(s1, 4)}://${run(u, rnd(2) ? 100 + rnd(600) : 1200 + rnd(400))}:${run(pw, 5)}@`;
      }
      const length = settings.maxLineBytes * (2 + rnd(3));
      const pos = Math.max(0, boundary - rnd(secret.length + 64));
      const line = ",".repeat(pos) + secret + ",".repeat(Math.max(0, length - pos - secret.length));
      const whole = new Set(lineFindings(line));
      expect(whole.has(category), `${category} sample ${i} must be found without windows`).toBe(true);
      const windowed = new Set(cats(scanString(line, settings, chunk)));
      const key = `secret:${category}`;
      if (secret.length <= settings.maxCarryBytes) {
        short += 1;
        expect(windowed.has(key), `${category} sample ${i} (${secret.length} chars <= carry ${settings.maxCarryBytes}, pos ${pos}) must be a real finding`).toBe(true);
      } else {
        long += 1;
        expect(windowed.has(key) || windowed.has(`oversized-candidate:${category}`), `${category} sample ${i} (${secret.length} chars > carry) must be found or oversized`).toBe(true);
      }
    }
    expect(short).toBeGreaterThan(50);
    expect(long).toBeGreaterThan(5);
  });
  it("追加4 — a PEM BEGIN inside a 300 KiB single line gives exactly one private-key finding (with and without END)", () => {
    const begin = fake("-----BEGIN RSA ", "PRIVATE KEY-----");
    const end = fake("-----END RSA ", "PRIVATE KEY-----");
    for (const withEnd of [true, false]) {
      const line = "-".repeat(100_000) + begin + "k".repeat(200_000) + (withEnd ? end : "") + "-".repeat(10_000);
      const found = cats(scanString(line));
      expect(found, `withEnd=${withEnd}`).toEqual(["secret:private-key"]);
    }
  });
});
