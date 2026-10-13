/**
 * M2-2-RI-R1-001 (Medium, the independent review of review-import R1): an ID of the round written with an HTML named character reference
 * (`M2&hyphen;2&hyphen;RI&hyphen;R1&hyphen;002`) was not found, so a finding in the body could be left out of the JSON and the import was
 * exit 0 (fail open). The human decisions (ADR-0026, the addendum of v0.6.1):
 * - a named character reference other than `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` anywhere in the review (the body, the JSON block's
 *   lines, the JSON's strings after parsing) is exit 2 with nothing written (`[entity]`, the line only); the five are decoded before the IDs
 *   are looked for, as the numeric references are;
 * - a reference without its semicolon is not a reference in Markdown (CommonMark 0.31.2, §2.5), but a browser decodes the legacy names in raw
 *   HTML: the ten legacy names whose character folds into something with an ID character (or into nothing) are refused as well;
 * - HTML comments and tags are removed before the IDs are looked for (the original line is searched too), so an ID split by them is found;
 *   a tag is not refused (`Array<string>` stays a valid review).
 * The details decided with them (ADR-0026, v0.6.1): numeric references are decoded the way a browser does (the semicolon may be missing; 128
 * to 159 are read with the HTML table, `&#150;` is an en dash); HTML is removed twice — in the browser's order (a tag ends at the first `>`
 * outside a quoted attribute value; a comment at `-->` or `--!>`; `<!`, `<?` and `</` + a non-letter at the next `>`) and locally (every
 * `<…>` with no `<` or `>` inside) — and both forms are searched, in the lines and in the JSON's strings.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewImport } from "../src/commands/review-import.ts";
import { makeTempDir } from "./helpers.ts";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures", "review-import");

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function repo(): string {
  const t = makeTempDir("aiqh-test-ri1-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
  return t.dir;
}

async function run(root: string, file: string, o: { label?: string; round?: number; idPrefix?: string } = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewImport({ review: file, label: o.label ?? "demo", round: o.round ?? 1, idPrefix: o.idPrefix ?? "P", cwd: root, toolVersion: "9.9.9", log: (l) => out.push(l), logError: (l) => err.push(l) });
  return { code, out, err };
}

function write(root: string, text: string, name = "review.md"): string {
  const p = path.join(root, name);
  writeFileSync(p, text);
  return p;
}

/** A valid one-finding review; `body` lines go into "## 全体の結論", `evidence` into the finding's evidence (body and JSON). */
function review(body: string[] = [], evidence = "根拠"): string {
  const f = { id: "P-R1-001", severity: "Medium", kind: "バグ", target: "`src/x.ts`", content: "内容", evidence, fix: "修正案", confidence: "確認済み" };
  return [
    "# レビュー",
    "",
    "### P-R1-001",
    "",
    "- **ID**: P-R1-001",
    "- **重要度**: Medium",
    `- **根拠**: ${evidence}`,
    "",
    "## 全体の結論",
    "",
    "件数: High 0 / Medium 1 / Low 0",
    "",
    ...body,
    "",
    "```aiqh-findings",
    JSON.stringify({ schemaVersion: 1, label: "demo", round: 1, summary: { high: 0, medium: 1, low: 0 }, findings: [f] }, null, 2),
    "```",
    "",
  ].join("\n");
}

/** The review with its JSON evidence replaced by `raw` (JSON text written as is, e.g. with escapes) and its body's evidence left plain. */
function withJsonEvidence(raw: string): string {
  return review([], "PLACEHOLDER").replace('"evidence": "PLACEHOLDER"', `"evidence": "${raw}"`).replace("- **根拠**: PLACEHOLDER", "- **根拠**: 根拠");
}

function refused(r: { code: number; err: string[] }, root: string, kind: string): void {
  expect(r.code).toBe(2);
  expect(r.err.join("\n")).toContain(`[${kind}]`);
  expect(r.err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
  expect(readdirSync(path.join(root, "docs", "reviews"))).toEqual([]);
}

describe("M2-2-RI-R1-001: named character references", () => {
  it.each([
    ["&hyphen; (the review's example)", "追加の指摘 P&hyphen;R1&hyphen;002"],
    ["&dash;", "P&dash;R1&dash;002"],
    ["&minus;", "P&minus;R1&minus;002"],
    ["a reference that is not an ID", "見る &rarr; 次"],
    ["an upper-case form of an allowed name", "AT&AMP;T"],
  ])("%s in the body is refused, with its line and without its name", async (_label, line) => {
    const root = repo();
    const r = await run(root, write(root, review([line])));
    refused(r, root, "entity");
    expect(r.err.join("\n")).toMatch(/\(line \d+\)/);
    expect(r.err.join("\n")).not.toMatch(/hyphen|dash|minus|rarr|AMP/);
  });
  it("a named reference in a string of the JSON (written with JSON escapes, invisible in the lines) is refused", async () => {
    const root = repo();
    const text = withJsonEvidence("P\\u0026hyphen;R1");
    expect(text).not.toContain("&hyphen;");
    refused(await run(root, write(root, text)), root, "entity");
  });
  it("the five allowed references (&amp; &lt; &gt; &quot; &apos;) and numeric references pass", async () => {
    const root = repo();
    const r = await run(root, write(root, review(["A &amp; B、a &lt; b &gt; c、&quot;引用&quot; と &apos;x&apos;、&#45; と &#x2D;"], "x &lt; y")));
    expect([r.code, r.err]).toEqual([0, []]);
  });
  it("a numeric reference is still decoded before the IDs are looked for (control: as in v0.6.0)", async () => {
    const root = repo();
    refused(await run(root, write(root, review(["P-R1-00&#50; を見る"]))), root, "id-mention");
  });
});

describe("M2-2-RI-R1-001: numeric references are decoded the way a browser decodes them", () => {
  it.each([
    ["without the semicolon (decimal)", "P&#45R1-002"],
    ["without the semicolon (hexadecimal)", "P&#x2DR1-002"],
    ["128 to 159 by the HTML table (150 is an en dash, 151 an em dash)", "P&#150;R1&#151;002"],
    ["the same in hexadecimal", "P&#x96;R1&#X97;002"],
  ])("an ID of the round written with numeric references %s is found (exit 2)", async (_label, line) => {
    const root = repo();
    refused(await run(root, write(root, review([line]))), root, "id-mention");
  });
});

describe("M2-2-RI-R1-001: references without the semicolon (legacy names)", () => {
  it.each(["sup2", "sup1", "sup3", "frac12", "ordf", "ordm", "shy", "szlig", "frac14", "frac34"])("&%s (a legacy name that folds into an ID character or nothing) is refused", async (name) => {
    const root = repo();
    refused(await run(root, write(root, review([`P-R1-00&${name} を見る`]))), root, "entity");
  });
  it("&copy and other legacy names whose character cannot become an ID character pass (CommonMark shows them as written)", async () => {
    const root = repo();
    const r = await run(root, write(root, review(["&copy 2026、&para と &not"])));
    expect([r.code, r.err]).toEqual([0, []]);
  });
});

describe("M2-2-RI-R1-001: HTML comments and tags are removed before the IDs are looked for", () => {
  it.each([
    ["an empty element inside the ID", "P-<b></b>R1-002"],
    ["a comment inside the ID", "P-R1<!-- -->-002"],
    ["a comment across two lines", "P-R1<!--\n-->-002"],
    ["a tag with attributes", 'P-R1-<span class="x">002</span>'],
    ["an ID only inside a comment", "<!-- P-R1-002 は下書き -->"],
    ["a quoted attribute value with > in it", 'P-R1-<span title=">">002</span>'],
    ["a tag across two lines", 'P-R1-<span\nclass="x">002</span>'],
    ["the empty comment <!-->", "P-R1<!-->-002"],
    ["a comment with > in it, ended by --!>", "P-R1<!-- a > b --!>-002"],
    ["a processing instruction (to the next >)", "P-R1-<?x>002"],
    ["a declaration", "P-R1-<!x>002"],
    ["</> (dropped by a browser)", "P-R1-</>002"],
    ["an end tag with a non-letter (a bogus comment)", "P-R1-</ x>002"],
    ['an attribute that begins with = (the browser ends the tag at the first >)', 'P-R1-<b ="x>002">'],
  ])("an ID of the round written with %s is found (exit 2)", async (_label, line) => {
    const root = repo();
    refused(await run(root, write(root, review([line]))), root, "id-mention");
  });
  it("an ID split by a tag in a string of the JSON (written with JSON escapes, invisible in the lines) is found", async () => {
    const root = repo();
    const text = withJsonEvidence("P-R1-\\u003cb\\u003e\\u003c/b\\u003e002");
    expect(text).not.toContain("<b>");
    const r = await run(root, write(root, text));
    refused(r, root, "id-mention");
    expect(r.err.join("\n")).toContain("P-R1-002 is an ID of this round in a string of the JSON");
  });
  it("a valid review with type-like tags (Array<string>, Map<K, V>, <root>), comparisons and an autolink passes", async () => {
    const root = repo();
    const r = await run(root, write(root, review(["戻り値は `Array<string>` と Map<K, V>。<root> の下。<https://example.com/x> を見る", "a < b と x <= y、`<!-- -->` の書き方", "`a<b` のまま閉じない < も P-R1-001 の説明"])));
    expect([r.code, r.err]).toEqual([0, []]);
  });
  it("the headings and the count line are read as before (a tag in the count line does not hide it from the structure rules)", async () => {
    const root = repo();
    const text = review().replace("件数: High 0 / Medium 1 / Low 0", "件数: High 0 / Medium <b>1</b> / Low 0");
    refused(await run(root, write(root, text)), root, "count-line");
  });
});

describe("M2-2-RI-R1-001: the reviews that are already recorded", () => {
  it("the R1 original (it uses &hyphen; to explain the finding) is refused by the fixed version: [entity]", async () => {
    const root = repo();
    const r = await run(root, path.join(FIXTURES, "m2-2-ri-r1.md"), { label: "m2-2-review-import", idPrefix: "M2-2-RI" });
    refused(r, root, "entity");
    expect(r.err.join("\n")).toMatch(/\(line 12\)/);
  });
  it.each([
    ["b21-r1.md", "backlog-21", "B21"],
    ["b23-r1.md", "backlog-23", "B23"],
    ["b28-r1.md", "backlog-28-5", "B28"],
  ])("the normal fixture %s still imports", async (file, label, prefix) => {
    const root = repo();
    const r = await run(root, path.join(FIXTURES, file), { label, idPrefix: prefix });
    expect([r.code, r.err]).toEqual([0, []]);
  });
  it("the normal fixtures b16-r1.md, b16-r2.md and b16-r3.md still import, in order", async () => {
    const root = repo();
    for (const round of [1, 2, 3]) {
      const r = await run(root, path.join(FIXTURES, `b16-r${round}.md`), { label: "backlog-16-2-19", round, idPrefix: "B16" });
      expect([round, r.code, r.err]).toEqual([round, 0, []]);
    }
  });
});
