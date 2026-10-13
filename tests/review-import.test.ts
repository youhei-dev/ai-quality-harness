/**
 * `aiqh review-import` v1 (ADR-0026): an independent review in Markdown with one `aiqh-findings` JSON block is imported into
 * docs/reviews/<label>/findings-r<N>.json, every finding `open`. The JSON block is the source; the body (everything outside the block) is
 * checked against it: the `### <ID>` headings, the one count line of `## 全体の結論`, and every mention of an ID of this round. Anything that
 * cannot be read or that does not agree is exit 2 and nothing is written (fail closed): a finding in the body that is not in the JSON must
 * never end as an import that looks complete. The shapes below are the ones the wave 3 SP1 survey found in the 47 recorded reviews
 * (a summary that skips a severity, no summary, a heading that is not a finding, an ID mentioned outside the findings, …).
 * The exit code never depends on the number of open findings (a reviewer's judgment does not become a pass / fail: the non-goal).
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type * as Crypto from "node:crypto";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { runReviewImport, type ReviewImportOptions } from "../src/commands/review-import.ts";
import type { FindingsFile } from "../src/review/import.ts";
import { fake, makeTempDir } from "./helpers.ts";

// randomBytes passes through; one test fixes it to take writeAtomic's temporary name beforehand (v0.6.1, M2-2-RI-R1-002: the name is random)
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const FIXTURES = path.resolve(import.meta.dirname, "fixtures", "review-import");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const NOW = new Date("2026-10-13T01:02:03.000Z");
/** Text that only a reviewer writes: it must never reach the terminal. */
const MARK = "REVIEWER-TEXT-7f3a";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

/** A repository with docs/reviews/ (where review-import writes). */
function repo(): string {
  const t = makeTempDir("aiqh-test-ri-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
  return t.dir;
}

interface Run {
  code: number;
  out: string[];
  err: string[];
}

async function run(root: string, review: string, o: Partial<ReviewImportOptions> = {}): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewImport({
    review,
    label: "demo",
    round: 1,
    idPrefix: "P",
    cwd: root,
    toolVersion: "9.9.9",
    now: () => NOW,
    log: (l) => out.push(l),
    logError: (l) => err.push(l),
    ...o,
  });
  return { code, out, err };
}

/** Every entry under docs/reviews/<label>/ (absent: null). */
function listing(root: string, label = "demo"): string[] | null {
  const dir = path.join(root, "docs", "reviews", label);
  return existsSync(dir) ? readdirSync(dir).sort() : null;
}

/** Exit 2, the condition named, nothing written, no temporary file, and no reviewer text on the terminal. */
function expectRefused(r: Run, root: string, kind: string, before: string[] | null = null, label = "demo"): void {
  expect(r.code).toBe(2);
  expect(r.err.join("\n")).toContain(`[${kind}]`);
  expect(r.err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
  expect(listing(root, label)).toEqual(before);
  expect(`${r.out.join("\n")}\n${r.err.join("\n")}`).not.toContain(MARK);
}

type Sev = "High" | "Medium" | "Low";

function finding(id: string, severity: Sev = "Medium"): Record<string, string> {
  return { id, severity, kind: "バグ", target: "`src/x.ts` 1 行目", content: `内容 ${MARK}`, evidence: `根拠 ${MARK}`, fix: `修正案 ${MARK}`, confidence: "確認済み" };
}

interface ReviewShape {
  label?: string;
  round?: number;
  prefix?: string;
  findings?: Array<Record<string, unknown>>;
  /** The JSON summary (default: counted from the findings). */
  summary?: { high: number; medium: number; low: number };
  /** The body's `### <ID>` headings (default: one per finding). */
  headings?: string[];
  /** The count line(s) of `## 全体の結論` (default: counted from the findings); [] for none. */
  countLines?: string[];
  conclusion?: boolean;
  /** Lines added to the body before `## 全体の結論`. */
  extra?: string[];
  /** Lines added after the count line, inside `## 全体の結論`. */
  extraInConclusion?: string[];
  /** The JSON document (default: built from the fields above), or raw text. */
  json?: unknown;
  /** How many aiqh-findings blocks (default 1). */
  blocks?: number;
  fence?: string;
  previous?: Array<Record<string, unknown>>;
}

function counts(findings: Array<Record<string, unknown>>): { high: number; medium: number; low: number } {
  const n = (s: Sev): number => findings.filter((f) => f.severity === s).length;
  return { high: n("High"), medium: n("Medium"), low: n("Low") };
}

function review(s: ReviewShape = {}): string {
  const label = s.label ?? "demo";
  const round = s.round ?? 1;
  const findings = s.findings ?? [finding("P-R1-001", "High")];
  const sum = s.summary ?? counts(findings);
  const lines = [`# 独立レビュー結果 — ${label} / R${round}`, "", "## 指摘", ""];
  const headings = s.headings ?? findings.map((f) => `### ${String(f.id)}`);
  if (headings.length === 0) lines.push("指摘なし。", "");
  for (const h of headings) {
    const f = findings.find((x) => `### ${String(x.id)}` === h);
    lines.push(h, "");
    if (f !== undefined) {
      lines.push(`- **ID**: ${String(f.id)}`, `- **重要度**: ${String(f.severity)}`, `- **種別**: ${String(f.kind)}`, `- **対象**: ${String(f.target)}`);
      lines.push(`- **内容**: ${String(f.content)}`, `- **根拠**: ${String(f.evidence)}`, `- **修正案**: ${String(f.fix)}`, `- **確度**: ${String(f.confidence)}`, "");
    }
  }
  lines.push(...(s.extra ?? []));
  if (s.conclusion !== false) {
    lines.push("## 全体の結論", "");
    lines.push(...(s.countLines ?? [`件数: High ${counts(findings).high} / Medium ${counts(findings).medium} / Low ${counts(findings).low}`]));
    lines.push("", `結論の文 ${MARK}`, ...(s.extraInConclusion ?? []), "");
  }
  const doc = s.json ?? { schemaVersion: 1, label, round, summary: sum, findings, ...(s.previous !== undefined ? { previous: s.previous } : {}) };
  const text = typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
  for (let i = 0; i < (s.blocks ?? 1); i++) lines.push(s.fence ?? "```aiqh-findings", text, "```", "");
  return lines.join("\n");
}

function writeReview(root: string, text: string | Uint8Array, name = "independent-review-demo-r1-for-claude.md"): string {
  const dir = path.join(root, "in");
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  writeFileSync(p, text);
  return p;
}

function stored(root: string, label = "demo", round = 1): FindingsFile {
  return JSON.parse(readFileSync(path.join(root, "docs", "reviews", label, `findings-r${round}.json`), "utf8")) as FindingsFile;
}

describe("review-import: the reviews that the SP1 strict reading could read, rewritten with the count line and the JSON block", () => {
  const CASES: Array<[file: string, label: string, round: number, prefix: string, expected: [number, number, number], ids: string[]]> = [
    ["b16-r1.md", "backlog-16-2-19", 1, "B16", [1, 1, 0], ["B16-R1-001", "B16-R1-002"]],
    ["b21-r1.md", "backlog-21", 1, "B21", [0, 0, 1], ["B21-R1-001"]],
    ["b23-r1.md", "backlog-23", 1, "B23", [0, 0, 1], ["B23-R1-001"]],
    ["b28-r1.md", "backlog-28-5", 1, "B28", [0, 1, 0], ["B28-R1-001"]],
  ];
  it.each(CASES)("%s imports with the counts of the original's summary, every finding open", async (file, label, round, prefix, [h, m, l], ids) => {
    const root = repo();
    const src = path.join(FIXTURES, file);
    const r = await run(root, src, { label, round, idPrefix: prefix });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const doc = stored(root, label, round);
    const bytes = readFileSync(src);
    expect(doc.schemaVersion).toBe(1);
    expect([doc.label, doc.round, doc.idPrefix]).toEqual([label, round, prefix]);
    expect(doc.source).toEqual({ name: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    expect(doc.summary).toEqual({ high: h, medium: m, low: l });
    expect(doc.tool).toEqual({ name: "aiqh", version: "9.9.9" });
    expect(doc.importedAt).toBe(NOW.toISOString());
    expect(doc.findings.map((f) => f.id)).toEqual(ids);
    for (const f of doc.findings) {
      expect(Object.keys(f)).toEqual(["id", "severity", "kind", "target", "content", "evidence", "fix", "confidence", "status", "verdict", "action", "fixedIn", "regressionTest", "guard", "destination", "note"]);
      expect(f.status).toBe("open");
      for (const k of ["verdict", "action", "fixedIn", "regressionTest", "guard", "destination", "note"]) expect((f as Record<string, unknown>)[k]).toBeNull();
    }
    expect(readFileSync(path.join(root, "docs", "reviews", label, `findings-r${round}.json`), "utf8").endsWith("}\n")).toBe(true);
    expect(r.out).toContain(`findings: docs/reviews/${label}/findings-r${round}.json`);
    expect(r.out).toContain(`High ${h} / Medium ${m} / Low ${l}; open ${h + m + l}`);
    expect(r.out.at(-1)).toBe("REVIEW IMPORT: written");
  });

  it("the three rounds of backlog-16-2-19 in order: each round finds the previous one, and `previous` is kept as given", async () => {
    const root = repo();
    for (const [round, file] of [[1, "b16-r1.md"], [2, "b16-r2.md"], [3, "b16-r3.md"]] as const) {
      const r = await run(root, path.join(FIXTURES, file), { label: "backlog-16-2-19", round, idPrefix: "B16" });
      expect([r.code, r.err]).toEqual([0, []]);
    }
    expect(listing(root, "backlog-16-2-19")).toEqual(["findings-r1.json", "findings-r2.json", "findings-r3.json"]);
    expect(stored(root, "backlog-16-2-19", 2).previous).toEqual([{ id: "B16-R1-001", assessment: "本文の前の回の指摘の再判定の節を参照" }]);
    expect(stored(root, "backlog-16-2-19", 3).summary).toEqual({ high: 0, medium: 0, low: 1 });
    expect(stored(root, "backlog-16-2-19", 1).previous).toEqual([]);
  });

  it("a review saved with CRLF line ends imports the same way (the structure is read without the CR)", async () => {
    const root = repo();
    const crlf = readFileSync(path.join(FIXTURES, "b21-r1.md"), "utf8").replace(/\n/g, "\r\n");
    const r = await run(root, writeReview(root, crlf), { label: "backlog-21", idPrefix: "B21" });
    expect([r.code, r.err]).toEqual([0, []]);
    expect(stored(root, "backlog-21").findings).toHaveLength(1);
  });
});

describe("review-import: the exit code does not depend on open findings (D7, the non-goal)", () => {
  it("three open findings and no finding are both exit 0", async () => {
    const a = repo();
    const ra = await run(a, writeReview(a, review({ findings: [finding("P-R1-001", "High"), finding("P-R1-002", "High"), finding("P-R1-003", "Low")] })));
    expect(ra.code).toBe(0);
    expect(ra.out).toContain("High 2 / Medium 0 / Low 1; open 3");
    const b = repo();
    const rb = await run(b, writeReview(b, review({ findings: [] })));
    expect(rb.code).toBe(0);
    expect(rb.out).toContain("High 0 / Medium 0 / Low 0; open 0");
    expect(stored(b).findings).toEqual([]);
  });

  it("the terminal shows no reviewer text on success", async () => {
    const root = repo();
    const r = await run(root, writeReview(root, review({ findings: [finding("P-R1-001")] })));
    expect(r.code).toBe(0);
    expect(`${r.out.join("\n")}\n${r.err.join("\n")}`).not.toContain(MARK);
  });
});

describe("review-import: the count line of `## 全体の結論` (SP1: summaries that skip a severity, no summary)", () => {
  it("a count line that skips a severity is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ countLines: ["件数: High 1 / Medium 0"] }))), root, "count-line");
  });
  it("no count line is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ countLines: [] }))), root, "count-line");
  });
  it("two count lines are refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ countLines: ["件数: High 1 / Medium 0 / Low 0", "件数: High 1 / Medium 0 / Low 0"] }))), root, "count-line");
  });
  it("a count line outside `## 全体の結論` is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ extra: ["件数: High 1 / Medium 0 / Low 0", ""] }))), root, "count-line");
  });
  it("a count line that differs from the JSON is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ countLines: ["件数: High 0 / Medium 0 / Low 0"] }))), root, "count-line");
  });
  it("no `## 全体の結論` section is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ conclusion: false }))), root, "conclusion");
  });
  it("two `## 全体の結論` sections are refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ extra: ["## 全体の結論", "", "件数: High 1 / Medium 0 / Low 0", ""] }))), root, "conclusion");
  });
});

describe("review-import: the headings and the IDs of the body against the JSON", () => {
  it("a `### <ID>` heading that is not in the JSON is refused (a finding left out of the JSON)", async () => {
    const root = repo();
    const r = await run(root, writeReview(root, review({ findings: [finding("P-R1-001")], headings: ["### P-R1-001", "### P-R1-002"] })));
    expectRefused(r, root, "heading");
    expect(r.err.join("\n")).toContain("P-R1-002");
  });
  it("a finding of the JSON without its heading is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding("P-R1-001"), finding("P-R1-002")], headings: ["### P-R1-001"] }))), root, "heading");
  });
  it("a finding heading with text after the ID is refused (the heading must be the ID alone)", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding("P-R1-001")], headings: ["### P-R1-001 — タイトル"] }))), root, "heading");
  });
  it("a finding heading at another level (`## <ID>`) is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding("P-R1-001")], headings: ["## P-R1-001"] }))), root, "heading");
  });
  it("a heading that mentions an ID of the previous round with text is accepted (a judgment of that finding, not a new one)", async () => {
    const root = repo();
    const text = review({ round: 2, findings: [finding("P-R2-001")], extra: ["### P-R1-001 の判定", "", "解消。", ""] });
    const r = await run(root, writeReview(root, text), { round: 2, allowMissingPrevious: true });
    expect([r.code, r.err.filter((l) => l.includes("["))]).toEqual([0, []]);
  });
  it("a heading that is only an ID of another round (`### P-R1-003` in R2) is refused (a finding with the wrong round)", async () => {
    const root = repo();
    const text = review({ round: 2, findings: [finding("P-R2-001")], extra: ["### P-R1-003", "", "- **ID**: P-R1-003", ""] });
    expectRefused(await run(root, writeReview(root, text), { round: 2, allowMissingPrevious: true }), root, "heading");
  });
  it("an ID of this round mentioned outside the findings and not in the JSON is refused, with its line (SP1: \"P-R1-002 以降の ID は発行しない\")", async () => {
    const root = repo();
    const text = review({ findings: [finding("P-R1-001")], extraInConclusion: ["`P-R1-002` 以降の指摘IDを発行する事項はない。"] });
    const r = await run(root, writeReview(root, text));
    expectRefused(r, root, "id-mention");
    expect(r.err.join("\n")).toMatch(/P-R1-002 \(line \d+\)/);
  });
  it.each([
    ["full-width digits", "P-R1-００２"],
    ["lower case", "p-r1-002"],
    ["a non-ASCII hyphen", "P‐R1‐002"],
    ["four digits", "P-R1-0002"],
    ["numeric character references", "P&#45;R1&#x2D;002"],
    ["Markdown backslash escapes", "P\\-R1\\-002"],
    ["a zero-width space inside", "P-R1-0\u200B02"],
    ["emphasis around the number", "P-R1-**002**"],
    ["code marks around a part", "`P-R1`-002"],
  ])("an ID of this round written with %s is still found", async (_label, written) => {
    const root = repo();
    const text = review({ findings: [finding("P-R1-001")], extraInConclusion: [`補足 ${written}`] });
    expectRefused(await run(root, writeReview(root, text)), root, "id-mention");
  });
  it("an ID of this round named only inside a string of the JSON (and not a finding) is refused", async () => {
    const root = repo();
    const f = { ...finding("P-R1-001"), evidence: "P-R1-002 も同じ形で起きる" };
    expectRefused(await run(root, writeReview(root, review({ findings: [f] }))), root, "id-mention");
  });
  it("an ID of this round written with JSON escapes inside a JSON string is found after parsing", async () => {
    const root = repo();
    const f = { ...finding("P-R1-001"), evidence: "P-R1-002 も同じ" };
    const doc = { schemaVersion: 1, label: "demo", round: 1, summary: { high: 0, medium: 1, low: 0 }, findings: [f] };
    const json = JSON.stringify(doc, null, 2).replace("P-R1-002", "P\\u002dR1\\u002d002");
    expect(json).not.toContain("P-R1-002");
    const r = await run(root, writeReview(root, review({ findings: [f], json })));
    expectRefused(r, root, "id-mention");
    expect(r.err.join("\n")).toContain("P-R1-002 is an ID of this round in a string of the JSON");
  });
  it("an ID of the JSON mentioned in the body outside its heading is accepted", async () => {
    const root = repo();
    const text = review({ findings: [finding("P-R1-001", "High")], extraInConclusion: ["P-R1-001 は直すべき。"] });
    expect((await run(root, writeReview(root, text))).code).toBe(0);
  });
  it("an ID of another prefix is not this round's (no refusal)", async () => {
    const root = repo();
    const text = review({ findings: [finding("P-R1-001")], extraInConclusion: ["QP-R1-002 と B20-R1-001 は別のレビュー。"] });
    expect((await run(root, writeReview(root, text))).code).toBe(0);
  });
});

describe("review-import: the IDs and the summary of the JSON", () => {
  it("a duplicated ID is refused", async () => {
    const root = repo();
    const r = await run(root, writeReview(root, review({ findings: [finding("P-R1-001"), finding("P-R1-001")], headings: ["### P-R1-001"] })));
    expectRefused(r, root, "id");
  });
  it("a gap in the numbers (001, 003) is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding("P-R1-001"), finding("P-R1-003")] }))), root, "id");
  });
  it.each([["another prefix", "Q-R1-001"], ["another round", "P-R2-001"], ["two digits", "P-R1-01"], ["a suffix", "P-R1-001a"]])("an ID with %s is refused", async (_label, id) => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding(id)] }))), root, "id");
  });
  it("a JSON summary that differs from the findings is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ findings: [finding("P-R1-001", "High")], summary: { high: 0, medium: 1, low: 0 }, countLines: ["件数: High 0 / Medium 1 / Low 0"] }))), root, "summary");
  });
  it("a label or a round in the JSON that differs from the options is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review()), { label: "other" }), root, "label-round", null, "other");
    const root2 = repo();
    expectRefused(await run(root2, writeReview(root2, review({ round: 1 })), { round: 2, allowMissingPrevious: true }), root2, "label-round");
  });
});

describe("review-import: the aiqh-findings block", () => {
  it("no block is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ blocks: 0 }))), root, "block");
  });
  it("two blocks are refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ blocks: 2 }))), root, "block");
  });
  it.each([["```aiqh-findings json"], ["```AIQH-FINDINGS"], ["~~~aiqh-findings"], ["``` aiqh-findings"]])("a fence that is almost the block (%s) is refused", async (fence) => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ fence }))), root, "block");
  });
  it("a block without its closing fence is refused", async () => {
    const root = repo();
    const f = finding("P-R1-001", "High");
    const doc = { schemaVersion: 1, label: "demo", round: 1, summary: { high: 1, medium: 0, low: 0 }, findings: [f] };
    const text = `${review({ findings: [f], blocks: 0 })}\n\`\`\`aiqh-findings\n${JSON.stringify(doc, null, 2)}\n`;
    expectRefused(await run(root, writeReview(root, text)), root, "block");
  });
  it("a block that is not JSON is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review({ json: `{ "schemaVersion": 1, ${MARK} }` }))), root, "json");
  });
  it.each([
    ["an unknown field at the top", { extra: 1 }, null],
    ["an unknown field in a finding", null, { note: "x" }],
    ["severity Critical", null, { severity: "Critical" }],
    ["kind in English", null, { kind: "bug" }],
    ["two kinds", null, { kind: "バグ / 文書" }],
    ["confidence with a note", null, { confidence: "確認済み（一部）" }],
    ["empty content", null, { content: "" }],
    ["blank evidence", null, { evidence: "   " }],
    ["content over the limit", null, { content: "あ".repeat(20_001) }],
  ] as Array<[string, Record<string, unknown> | null, Record<string, unknown> | null]>)("a schema violation (%s) is refused", async (_label, top, inFinding) => {
    const root = repo();
    const f = { ...finding("P-R1-001", "High"), ...(inFinding ?? {}) };
    const doc = { schemaVersion: 1, label: "demo", round: 1, summary: { high: 1, medium: 0, low: 0 }, findings: [f], ...(top ?? {}) };
    const r = await run(root, writeReview(root, review({ findings: [f], json: doc, countLines: ["件数: High 1 / Medium 0 / Low 0"] })));
    expectRefused(r, root, "schema");
    // an unknown key is the reviewer's text: it is not printed
    expect(r.err.join("\n")).not.toMatch(/"extra"|"note"/);
  });
  it("schemaVersion 2 is refused", async () => {
    const root = repo();
    const f = finding("P-R1-001", "High");
    expectRefused(await run(root, writeReview(root, review({ findings: [f], json: { schemaVersion: 2, label: "demo", round: 1, summary: { high: 1, medium: 0, low: 0 }, findings: [f] } }))), root, "schema");
  });
});

describe("review-import: the input file", () => {
  it("a file that does not exist is refused", async () => {
    const root = repo();
    expectRefused(await run(root, path.join(root, "nope.md")), root, "input");
  });
  it("a directory is refused", async () => {
    const root = repo();
    mkdirSync(path.join(root, "dir.md"));
    expectRefused(await run(root, path.join(root, "dir.md")), root, "input");
  });
  it("invalid UTF-8 is refused, with the line", async () => {
    const root = repo();
    const bytes = Buffer.concat([Buffer.from(review(), "utf8"), Buffer.from([0x0a, 0xc3, 0x28, 0x0a])]);
    const r = await run(root, writeReview(root, bytes));
    expectRefused(r, root, "input");
    expect(r.err.join("\n")).toMatch(/not valid UTF-8 \(line \d+\)/);
  });
  it("a file over 1 MiB is refused", async () => {
    const root = repo();
    const text = review({ extra: ["x".repeat(1_048_577), ""] });
    expectRefused(await run(root, writeReview(root, text)), root, "input");
  });
});

describe("review-import: forbidden characters and secret shapes in the review (D9)", () => {
  it("a forbidden character is imported and written as notation; the file holds no raw one", async () => {
    const root = repo();
    const f = { ...finding("P-R1-001"), content: "行の区切り \u2028 と制御 \u0012 を含む" };
    const r = await run(root, writeReview(root, review({ findings: [f] })));
    expect(r.code).toBe(0);
    const raw = readFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "utf8");
    expect([raw.includes("\u2028"), raw.includes("\u0012")]).toEqual([false, false]);
    expect(raw).toContain("\\u2028");
    expect(stored(root).findings[0]?.content).toBe("行の区切り \u2028 と制御 \u0012 を含む");
    // the body's line holds both characters; the JSON block holds U+2028 raw as well (JSON.stringify escapes U+0012 but not U+2028)
    expect(r.out.join("\n")).toMatch(/forbidden characters in the review: 3 \(written as notation; lines \d+, \d+\)/);
  });
  it("a secret shape is masked in the file, never printed, and counted on the terminal with its line", async () => {
    const root = repo();
    const secret = fake("ghp_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8");
    const f = { ...finding("P-R1-001"), evidence: `例: ${secret}` };
    const r = await run(root, writeReview(root, review({ findings: [f] })));
    expect(r.code).toBe(0);
    const raw = readFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "utf8");
    expect(raw).not.toContain(secret);
    expect(raw).toContain("[REDACTED");
    const all = `${r.out.join("\n")}\n${r.err.join("\n")}`;
    expect(all).not.toContain(secret);
    expect(all).toMatch(/secret-shaped strings in the review: \d+ \(.*line \d+/);
  });
});

describe("review-import: the previous round (D8, ADR-0022)", () => {
  const r2 = (): string => review({ round: 2, findings: [finding("P-R2-001")] });
  it("round 2 without findings-r1.json is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, r2()), { round: 2 }), root, "previous");
  });
  it("round 2 without findings-r1.json is accepted with --allow-missing-previous", async () => {
    const root = repo();
    const r = await run(root, writeReview(root, r2()), { round: 2, allowMissingPrevious: true });
    expect([r.code, r.err]).toEqual([0, []]);
    expect(listing(root)).toEqual(["findings-r2.json"]);
  });
  it.each([
    ["not JSON", "{ not json"],
    ["a schema violation", JSON.stringify({ schemaVersion: 1, label: "demo" })],
  ])("a previous file that is %s is refused even with --allow-missing-previous", async (_label, content) => {
    const root = repo();
    mkdirSync(path.join(root, "docs", "reviews", "demo"));
    writeFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), content);
    expectRefused(await run(root, writeReview(root, r2()), { round: 2, allowMissingPrevious: true }), root, "previous", ["findings-r1.json"]);
  });
  it("a previous file of another label or round is refused", async () => {
    const root = repo();
    await run(root, writeReview(root, review()), {});
    const p = path.join(root, "docs", "reviews", "demo", "findings-r1.json");
    writeFileSync(p, readFileSync(p, "utf8").replace('"round": 1', '"round": 5'));
    expectRefused(await run(root, writeReview(root, r2(), "r2.md"), { round: 2 }), root, "previous", ["findings-r1.json"]);
  });
  it("a previous path that is a directory is refused even with --allow-missing-previous", async () => {
    const root = repo();
    mkdirSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), { recursive: true });
    expectRefused(await run(root, writeReview(root, r2()), { round: 2, allowMissingPrevious: true }), root, "previous", ["findings-r1.json"]);
  });
  it.skipIf(isRoot)("a previous file that cannot be read (mode 000) is refused even with --allow-missing-previous, not taken as absent", async () => {
    const root = repo();
    await run(root, writeReview(root, review()), {});
    const p = path.join(root, "docs", "reviews", "demo", "findings-r1.json");
    chmodSync(p, 0o000);
    cleanups.unshift(() => chmodSync(p, 0o644));
    const r = await run(root, writeReview(root, r2(), "r2.md"), { round: 2, allowMissingPrevious: true });
    expectRefused(r, root, "previous", ["findings-r1.json"]);
    expect(r.err.join("\n")).toContain("EACCES");
  });
});

describe("review-import: an existing findings file", () => {
  it("the same review again: exit 0, nothing written, the file unchanged", async () => {
    const root = repo();
    const src = writeReview(root, review());
    expect((await run(root, src)).code).toBe(0);
    const p = path.join(root, "docs", "reviews", "demo", "findings-r1.json");
    const before = readFileSync(p);
    const mtime = statSync(p).mtimeMs;
    const again = await run(root, src, { now: () => new Date("2027-01-01T00:00:00.000Z") });
    expect(again.code).toBe(0);
    expect(again.out.at(-1)).toBe("REVIEW IMPORT: already imported (same source); nothing written");
    expect(readFileSync(p)).toEqual(before);
    expect(statSync(p).mtimeMs).toBe(mtime);
  });
  it("another review for the same round is refused and the file is unchanged", async () => {
    const root = repo();
    expect((await run(root, writeReview(root, review()))).code).toBe(0);
    const p = path.join(root, "docs", "reviews", "demo", "findings-r1.json");
    const before = readFileSync(p);
    const r = await run(root, writeReview(root, review({ findings: [finding("P-R1-001", "Low")] }), "other.md"));
    expectRefused(r, root, "existing", ["findings-r1.json"]);
    expect(readFileSync(p)).toEqual(before);
  });
  it("an existing file that is not a findings file is refused and left as it is", async () => {
    const root = repo();
    mkdirSync(path.join(root, "docs", "reviews", "demo"));
    writeFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "{}");
    expectRefused(await run(root, writeReview(root, review())), root, "existing", ["findings-r1.json"]);
  });
});

describe("review-import: options, the repository and the write", () => {
  it.each([["a path separator", "a/b"], ["..", ".."], ["upper case", "Demo"], ["a dot pair inside", "a..b"], ["empty", ""]])("--label with %s is refused", async (_label, label) => {
    const root = repo();
    const r = await run(root, writeReview(root, review()), { label });
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toContain("[options]");
    expect(readdirSync(path.join(root, "docs", "reviews"))).toEqual([]);
  });
  it.each([["lower case", "p"], ["a trailing hyphen", "P-"], ["a space", "P Q"]])("--id-prefix with %s is refused", async (_label, idPrefix) => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review()), { idPrefix }), root, "options");
  });
  it("--round over 999 is refused", async () => {
    const root = repo();
    expectRefused(await run(root, writeReview(root, review()), { round: 1000 }), root, "options");
  });
  it("a directory without docs/reviews/ is refused (run at the repository root)", async () => {
    const t = makeTempDir("aiqh-test-ri-");
    cleanups.push(t.cleanup);
    const r = await run(t.dir, writeReview(t.dir, review()));
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toContain("[repository]");
    expect(existsSync(path.join(t.dir, "docs"))).toBe(false);
  });
  it.skipIf(isRoot)("a write that fails leaves no findings file and no temporary file", async () => {
    const root = repo();
    const dir = path.join(root, "docs", "reviews", "demo");
    mkdirSync(dir);
    chmodSync(dir, 0o555);
    cleanups.unshift(() => chmodSync(dir, 0o755));
    const r = await run(root, writeReview(root, review()));
    expectRefused(r, root, "write", []);
  });
  it("a write that fails (the temporary name is taken by a directory) adds nothing and leaves what was there", async () => {
    const root = repo();
    const fixed = Buffer.from("0123456789abcdef", "hex");
    const random = vi.mocked(randomBytes) as unknown as Mock<(size: number) => Buffer>;
    random.mockImplementation(() => fixed);
    cleanups.push(() => random.mockReset()); // back to the real randomBytes (the function given to vi.fn)
    const taken = `.findings-r1.json.tmp-${fixed.toString("hex")}`;
    mkdirSync(path.join(root, "docs", "reviews", "demo", taken), { recursive: true });
    expectRefused(await run(root, writeReview(root, review())), root, "write", [taken]);
  });
});
