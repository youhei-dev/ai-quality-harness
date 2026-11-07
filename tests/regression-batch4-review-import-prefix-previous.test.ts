/**
 * batch4 v0.18.2 (design final docs/reviews/batch4-design/design-final.md §3.2・§3.3, ADR-0026 addendum v0.18.2, B4-D-Q8・B4-D-Q9 = A):
 * two inputs that review-import wrote (exit 0) up to v0.18.1 are now refused before anything is written (exit 2), the fail-closed way.
 *
 * - 1c: `--id-prefix` is the part of the ID before `-R<round>` (for an ID B3-D-R1-001 it is B3-D). A prefix that ends with `-R` and digits is
 *   a usage error (ADR-0021): a review without findings was imported with the wrong prefix, and the mistake showed only at the next round.
 *   `-R` not followed by digits only (M2-2-RI), digits after `R` that go on (B3-D-R1X), and `R1` at the start stay valid.
 * - 1a: round 1 has no round 0, so a non-empty `previous` in the JSON of a round 1 review is a problem of the kind `previous`, listed with
 *   the other problems of the review. It was written, `REVIEW LOOP: unknown`, and review-check refused the file with no way out but deleting
 *   the reviewer's assessments. An absent or empty `previous` passes; round 2 and later are unchanged; the same review imported again
 *   (the same SHA-256, before the review is read) is still exit 0 with nothing written.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewImport, type ReviewImportOptions } from "../src/commands/review-import.ts";
import { makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const NOW = new Date("2026-11-07T00:00:00.000Z");
const PREFIX_MESSAGE = "--id-prefix is the part of the ID before -R<round> (for an ID B3-D-R1-001 it is B3-D); it must not end with -R<n>";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function repo(): string {
  const t = makeTempDir("aiqh-test-b4ri-");
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

function listing(root: string, label = "demo"): string[] | null {
  const dir = path.join(root, "docs", "reviews", label);
  return existsSync(dir) ? readdirSync(dir).sort() : null;
}

interface Shape {
  label?: string;
  round?: number;
  /** The IDs of this round's findings (each a Low finding with its heading). */
  ids?: string[];
  previous?: Array<{ id: string; assessment: string }>;
  /** The JSON summary's low (default: the number of IDs). */
  low?: number;
}

/** A review in the shape review-import reads: the headings, the conclusion's count line and one aiqh-findings block. */
function review(s: Shape = {}): string {
  const label = s.label ?? "demo";
  const round = s.round ?? 1;
  const ids = s.ids ?? [];
  const findings = ids.map((id) => ({ id, severity: "Low", kind: "文書", target: "README.md", content: "内容", evidence: "根拠", fix: "修正案", confidence: "確認済み" }));
  const lines = [`# レビュー — ${label} / R${round}`, "", "## 指摘", ""];
  if (ids.length === 0) lines.push("指摘なし。", "");
  for (const f of findings) lines.push(`### ${f.id}`, "", `- **ID**: ${f.id}`, "- **重要度**: Low", "- **種別**: 文書", "- **対象**: README.md", "- **内容**: 内容", "- **根拠**: 根拠", "- **修正案**: 修正案", "- **確度**: 確認済み", "");
  lines.push("## 全体の結論", "", `件数: High 0 / Medium 0 / Low ${ids.length}`, "", "結論の文", "");
  const doc = { schemaVersion: 1, label, round, summary: { high: 0, medium: 0, low: s.low ?? ids.length }, findings, ...(s.previous !== undefined ? { previous: s.previous } : {}) };
  lines.push("```aiqh-findings", JSON.stringify(doc, null, 2), "```", "");
  return lines.join("\n");
}

function write(root: string, text: string, name = "independent-review-demo-r1-for-claude.md"): string {
  const dir = path.join(root, "in");
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  writeFileSync(p, text);
  return p;
}

function cli(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("1c: an --id-prefix that ends with -R<n> is a usage error (exit 2, nothing written)", () => {
  it.each(["TRIAL-R1", "B3-D-R12", "B3-D-R2", "M2-R1", "X-R0"])("%s, with a review without findings", async (idPrefix) => {
    const root = repo();
    const r = await run(root, write(root, review()), { idPrefix });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`aiqh review-import: [options] ${PREFIX_MESSAGE}`);
    expect(r.err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
    expect(r.out).toEqual([]);
    expect(listing(root)).toBeNull();
  });

  it("with a review that has findings, it is the same usage error (before the review is read)", async () => {
    const root = repo();
    const r = await run(root, write(root, review({ ids: ["B3-D-R2-R2-001"], round: 2 })), { idPrefix: "B3-D-R2", round: 2, allowMissingPrevious: true });
    expect(r.code).toBe(2);
    expect(r.err.filter((l) => l.startsWith("aiqh review-import: ["))).toEqual([`aiqh review-import: [options] ${PREFIX_MESSAGE}`]);
    expect(listing(root)).toBeNull();
  });

  it.each(["B3-D", "M2-2-RI", "B20", "R1", "B3-D-R1X", "B4-I181", "B3-D-RI2"])("%s is still accepted", async (idPrefix) => {
    const root = repo();
    const r = await run(root, write(root, review()), { idPrefix });
    expect([r.code, r.err]).toEqual([0, []]);
    expect(r.out.at(-1)).toBe("REVIEW IMPORT: written");
    expect(JSON.parse(readFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "utf8")).idPrefix).toBe(idPrefix);
  });

  it("through the real CLI: exit 2 with the message, and --help says the prefix does not include -R<round>", () => {
    const root = repo();
    const p = write(root, review());
    const r = cli(root, ["review-import", p, "--label", "demo", "--round", "1", "--id-prefix", "TRIAL-R1"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`[options] ${PREFIX_MESSAGE}`);
    expect(listing(root)).toBeNull();
    const h = cli(root, ["review-import", "--help"]);
    expect(h.status).toBe(0);
    expect(h.stdout.replace(/\s+/g, " ")).toContain("the prefix of the finding IDs <prefix>-R<round>-<NNN>: the part of the ID before -R<round>, without -R<round> (for an ID B3-D-R1-001 it is B3-D;");
  });
});

describe("1a: round 1 with a non-empty previous is a problem of the kind previous (exit 2, nothing written)", () => {
  it.each([
    ["another label's ID", [{ id: "B3-D-R2-001", assessment: "解消" }]],
    ["two entries", [{ id: "B3-D-R2-001", assessment: "解消" }, { id: "B3-D-R2-002", assessment: "未解消" }]],
  ])("%s", async (_title, previous) => {
    const root = repo();
    const r = await run(root, write(root, review({ previous })));
    expect(r.code).toBe(2);
    expect(r.err).toContain(`aiqh review-import: [previous] round 1 has ${previous.length} previous ${previous.length === 1 ? "entry" : "entries"} in the JSON (there is no round 0); an assessment of another label's findings goes in the body, not in previous`);
    expect(r.err).toContain("aiqh review-import: 1 problem(s); the review is not imported");
    expect(r.err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
    expect(listing(root)).toBeNull();
  });

  it("an ID of this round in previous: the previous problem and the id-mention problems are listed together", async () => {
    const root = repo();
    const r = await run(root, write(root, review({ previous: [{ id: "P-R1-001", assessment: "解消" }] })));
    expect(r.code).toBe(2);
    const kinds = r.err.filter((l) => l.startsWith("aiqh review-import: [")).map((l) => /\[([a-z-]+)\]/.exec(l)?.[1]);
    expect(kinds).toContain("previous");
    expect(kinds).toContain("id-mention");
    expect(listing(root)).toBeNull();
  });

  it("with another problem of the review (the summary), both are listed", async () => {
    const root = repo();
    const r = await run(root, write(root, review({ previous: [{ id: "B3-D-R2-001", assessment: "解消" }], low: 1 })));
    expect(r.code).toBe(2);
    const kinds = r.err.filter((l) => l.startsWith("aiqh review-import: [")).map((l) => /\[([a-z-]+)\]/.exec(l)?.[1]);
    expect(kinds).toEqual(expect.arrayContaining(["previous", "summary"]));
    expect(r.err).toContain("aiqh review-import: 3 problem(s); the review is not imported");
  });

  it.each([["absent", undefined], ["empty", []]] as const)("previous %s still imports (exit 0)", async (_title, previous) => {
    const root = repo();
    const r = await run(root, write(root, review(previous === undefined ? {} : { previous: [...previous] })));
    expect([r.code, r.err]).toEqual([0, []]);
    expect(JSON.parse(readFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "utf8")).previous).toEqual([]);
  });

  it("round 2 with previous (the IDs of round 1) still imports, and previous is kept", async () => {
    const root = repo();
    expect((await run(root, write(root, review({ ids: ["P-R1-001"] }), "r1.md"))).code).toBe(0);
    const previous = [{ id: "P-R1-001", assessment: "解消" }];
    const r = await run(root, write(root, review({ round: 2, previous }), "r2.md"), { round: 2 });
    expect([r.code, r.err]).toEqual([0, []]);
    expect(JSON.parse(readFileSync(path.join(root, "docs", "reviews", "demo", "findings-r2.json"), "utf8")).previous).toEqual(previous);
  });

  it("the same review imported before (a round 1 file with previous, as v0.18.1 wrote it) is still exit 0 with nothing written", async () => {
    const root = repo();
    const text = review({ previous: [{ id: "B3-D-R2-001", assessment: "解消" }] });
    const p = write(root, text);
    const bytes = readFileSync(p);
    const dir = path.join(root, "docs", "reviews", "demo");
    mkdirSync(dir);
    const before = {
      schemaVersion: 1,
      label: "demo",
      round: 1,
      idPrefix: "P",
      source: { name: path.basename(p), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
      summary: { high: 0, medium: 0, low: 0 },
      previous: [{ id: "B3-D-R2-001", assessment: "解消" }],
      importedAt: "2026-11-01T00:00:00.000Z",
      tool: { name: "aiqh", version: "0.18.1" },
      findings: [],
    };
    const file = path.join(dir, "findings-r1.json");
    writeFileSync(file, `${JSON.stringify(before, null, 2)}\n`);
    const kept = readFileSync(file);
    const r = await run(root, p);
    expect([r.code, r.err]).toEqual([0, []]);
    expect(r.out.at(-1)).toBe("REVIEW IMPORT: already imported (same source); nothing written");
    expect(readFileSync(file).equals(kept)).toBe(true);
  });
});
