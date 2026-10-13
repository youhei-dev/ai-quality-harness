/**
 * `aiqh review-check` (review-import v2, v0.7.0, ADR-0027): reads docs/reviews/<label>/findings-r*.json only, writes nothing, and checks
 * that the rounds are there (1, 2, … without a gap), readable, of this label and round, of one prefix, still of the shape the import gave
 * them (IDs, summary), that each state has its fields (resolved: a fixedIn commit that git knows and a regression test; deferred: a
 * destination; accepted and invalid: a note; the verdict fits the state) and that each round's `previous` names findings of the round
 * before. Any of these is exit 2 (all of them listed). Otherwise exit 0 — whatever the number of open findings (D7, the non-goal) — with
 * the counts per round and state, the open IDs, the previous round's assessments next to its findings, two kinds of warnings that never
 * change the exit code, `REVIEW LOOP: complete` or `REVIEW LOOP: incomplete (open N)`, and `REVIEW CHECK: passed`. The reviewer's text
 * never reaches the terminal (only IDs of the expected shape, states and the first word of an assessment as one of four classes).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewCheck } from "../src/commands/review-check.ts";
import { runReviewImport } from "../src/commands/review-import.ts";
import { makeTempDir } from "./helpers.ts";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
/** Text that only a reviewer or an implementer writes: it must never reach the terminal. */
const MARK = "REVIEWER-TEXT-5c1e";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=aiqh-test", "-c", "user.email=aiqh-test", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** A git repository with docs/reviews/ and one commit; `commit()` adds an empty commit and returns its SHA. */
function repo(withGit = true): { root: string; commit: (message: string) => string } {
  const t = makeTempDir("aiqh-test-rc-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
  if (withGit) {
    git(t.dir, ["init", "-q"]);
    git(t.dir, ["commit", "-q", "--allow-empty", "-m", "start"]);
  }
  return {
    root: t.dir,
    commit: (message) => {
      git(t.dir, ["commit", "-q", "--allow-empty", "-m", message]);
      return git(t.dir, ["rev-parse", "HEAD"]);
    },
  };
}

type Sev = "High" | "Medium" | "Low";
type Finding = Record<string, unknown>;

/** A finding as review-import stores it (open, every implementer field null), with `over` applied. */
function finding(id: string, severity: Sev = "Medium", over: Finding = {}): Finding {
  return {
    id,
    severity,
    kind: "バグ",
    target: "`src/x.ts`",
    content: `内容 ${MARK}`,
    evidence: `根拠 ${MARK}`,
    fix: `修正案 ${MARK}`,
    confidence: "確認済み",
    status: "open",
    verdict: null,
    action: null,
    fixedIn: null,
    regressionTest: null,
    guard: null,
    destination: null,
    note: null,
    ...over,
  };
}

interface RoundShape {
  label?: string;
  round?: number;
  prefix?: string;
  summary?: { high: number; medium: number; low: number };
  previous?: Array<{ id: string; assessment: string }>;
}

function counts(findings: Finding[]): { high: number; medium: number; low: number } {
  const n = (s: Sev): number => findings.filter((f) => f.severity === s).length;
  return { high: n("High"), medium: n("Medium"), low: n("Low") };
}

/** Write docs/reviews/<label>/findings-r<round>.json as review-import writes it (2-space JSON, LF at the end). */
function writeRound(root: string, label: string, round: number, findings: Finding[], s: RoundShape = {}): string {
  const dir = path.join(root, "docs", "reviews", label);
  mkdirSync(dir, { recursive: true });
  const doc = {
    schemaVersion: 1,
    label: s.label ?? label,
    round: s.round ?? round,
    idPrefix: s.prefix ?? "P",
    source: { name: `independent-review-${label}-r${round}-for-claude.md`, bytes: 100, sha256: "0".repeat(64) },
    summary: s.summary ?? counts(findings),
    previous: s.previous ?? [],
    importedAt: "2026-10-13T01:02:03.000Z",
    tool: { name: "aiqh", version: "9.9.9" },
    findings,
  };
  const file = path.join(dir, `findings-r${round}.json`);
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return file;
}

interface Run {
  code: number;
  out: string[];
  err: string[];
}

async function run(root: string, label = "demo"): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewCheck({ label, cwd: root, log: (l) => out.push(l), logError: (l) => err.push(l) });
  return { code, out, err };
}

/** Exit 2, every condition named, the last line, no loop line, and no reviewer text. */
function expectFailed(r: Run, ...kinds: string[]): void {
  expect(r.code).toBe(2);
  for (const k of kinds) expect(r.err.join("\n")).toContain(`aiqh review-check: [${k}] `);
  expect(r.err.at(-1)).toBe("REVIEW CHECK: failed (error)");
  expect(`${r.out.join("\n")}\n${r.err.join("\n")}`).not.toContain("REVIEW LOOP:");
  expect(`${r.out.join("\n")}\n${r.err.join("\n")}`).not.toContain(MARK);
}

function expectPassed(r: Run): void {
  expect(r.err).toEqual([]);
  expect(r.code).toBe(0);
  expect(r.out.at(-1)).toBe("REVIEW CHECK: passed");
  expect(r.out.join("\n")).not.toContain(MARK);
}

describe("review-check: the recorded m2-2-review-import rounds (a copy; only the fixedIn SHAs are commits of a temporary repository)", () => {
  it("R1 (three resolved) and R2 (no finding, previous of the three): exit 0, complete, no warning", async () => {
    const { root, commit } = repo();
    const dir = path.join(root, "docs", "reviews", "m2-2-review-import");
    mkdirSync(dir, { recursive: true });
    let r1 = readFileSync(path.join(FIXTURES, "review-check", "m2-2-review-import", "findings-r1.json"), "utf8");
    for (const sha of ["a5468391d443c2ff53b7134e58488958d28e44aa", "76af3d92617b575e96cdb7c3cc6eaff2aa14700d", "259e09379037c1b4b6ea0824dfcc84d215882e88"]) {
      expect(r1).toContain(`"fixedIn": "${sha}"`);
      r1 = r1.replace(sha, commit(`stands for ${sha.slice(0, 7)}`));
    }
    writeFileSync(path.join(dir, "findings-r1.json"), r1);
    writeFileSync(path.join(dir, "findings-r2.json"), readFileSync(path.join(FIXTURES, "review-check", "m2-2-review-import", "findings-r2.json")));
    const r = await run(root, "m2-2-review-import");
    expectPassed(r);
    expect(r.out).toEqual([
      "aiqh review-check — m2-2-review-import (M2-2-RI), R1 to R2",
      "R1: High 0 / Medium 3 / Low 0; open 0, resolved 3, deferred 0, accepted 0, invalid 0",
      "R2: High 0 / Medium 0 / Low 0; open 0, resolved 0, deferred 0, accepted 0, invalid 0",
      "previous: M2-2-RI-R1-001 (R1, resolved) — R2: 解消",
      "previous: M2-2-RI-R1-002 (R1, resolved) — R2: 解消",
      "previous: M2-2-RI-R1-003 (R1, resolved) — R2: 解消",
      "open: none",
      "warnings: 0",
      "REVIEW LOOP: complete",
      "REVIEW CHECK: passed",
    ]);
  });
});

describe("review-check: passed (exit 0) whatever the number of open findings", () => {
  it("an open finding left: exit 0, incomplete, its ID listed", async () => {
    const { root, commit } = repo();
    const sha = commit("fix");
    writeRound(root, "demo", 1, [
      finding("P-R1-001", "High"),
      finding("P-R1-002", "Low", { status: "resolved", verdict: "VALID", fixedIn: sha, regressionTest: `tests/x.test.ts ${MARK}` }),
    ]);
    const r = await run(root);
    expectPassed(r);
    expect(r.out).toEqual([
      "aiqh review-check — demo (P), R1 to R1",
      "R1: High 1 / Medium 0 / Low 1; open 1, resolved 1, deferred 0, accepted 0, invalid 0",
      "open: P-R1-001",
      "warnings: 0",
      "REVIEW LOOP: incomplete (open 1)",
      "REVIEW CHECK: passed",
    ]);
  });
  it("every state with its fields: exit 0, complete", async () => {
    const { root, commit } = repo();
    const sha = commit("fix");
    writeRound(root, "demo", 1, [
      finding("P-R1-001", "High", { status: "resolved", verdict: "PARTIAL", fixedIn: sha, regressionTest: "t" }),
      finding("P-R1-002", "Medium", { status: "deferred", verdict: "VALID", destination: "v9" }),
      finding("P-R1-003", "Low", { status: "accepted", verdict: "VALID", note: "ADR-9999" }),
      finding("P-R1-004", "Low", { status: "invalid", verdict: "INVALID", note: "理由" }),
    ]);
    const r = await run(root);
    expectPassed(r);
    expect(r.out).toContain("R1: High 1 / Medium 1 / Low 2; open 0, resolved 1, deferred 1, accepted 1, invalid 1");
    expect(r.out).toContain("REVIEW LOOP: complete");
  });
  it("many open findings in several rounds: still exit 0 (D7: the open count never changes the exit code)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001"), finding("P-R1-002")]);
    writeRound(root, "demo", 2, [finding("P-R2-001")], { previous: [{ id: "P-R1-001", assessment: "未解消" }, { id: "P-R1-002", assessment: "未解消" }] });
    const r = await run(root);
    expectPassed(r);
    expect(r.out).toContain("open: P-R1-001, P-R1-002, P-R2-001");
    expect(r.out).toContain("REVIEW LOOP: incomplete (open 3)");
  });
  it("no resolved finding: git is not asked (a directory that is not a repository passes)", async () => {
    const { root } = repo(false);
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    expectPassed(await run(root));
  });
  it("files of the label that are not findings files are left alone (review-r1.md, response-r1.md)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeFileSync(path.join(root, "docs", "reviews", "demo", "review-r1.md"), `# ${MARK}\n`);
    writeFileSync(path.join(root, "docs", "reviews", "demo", "response-r1.md"), `# ${MARK}\n`);
    expectPassed(await run(root));
  });
});

describe("review-check: the assessments of the previous round (warnings: the exit code stays 0)", () => {
  it("each finding of the round before is shown with the next round's assessment, classified by its first word", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001"), finding("P-R1-002"), finding("P-R1-003"), finding("P-R1-004")]);
    writeRound(root, "demo", 2, [], {
      previous: [
        { id: "P-R1-001", assessment: `未解消。${MARK}` },
        { id: "P-R1-002", assessment: `部分的に解消。${MARK}` },
        { id: "P-R1-003", assessment: `見ていない ${MARK}` },
        { id: "P-R1-004", assessment: "未解消" },
      ],
    });
    const r = await run(root);
    expectPassed(r);
    expect(r.out.filter((l) => l.startsWith("previous: "))).toEqual([
      "previous: P-R1-001 (R1, open) — R2: 未解消",
      "previous: P-R1-002 (R1, open) — R2: 部分的に解消",
      "previous: P-R1-003 (R1, open) — R2: その他",
      "previous: P-R1-004 (R1, open) — R2: 未解消",
    ]);
  });
  it("a disagreement — resolved but 未解消 or 部分的に解消, open but 解消 — is a warning; exit 0", async () => {
    const { root, commit } = repo();
    const sha = commit("fix");
    const resolved = { status: "resolved", verdict: "VALID", fixedIn: sha, regressionTest: "t" };
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", resolved), finding("P-R1-002", "Medium", resolved), finding("P-R1-003"), finding("P-R1-004", "Medium", resolved)]);
    writeRound(root, "demo", 2, [], {
      previous: [
        { id: "P-R1-001", assessment: "未解消" },
        { id: "P-R1-002", assessment: "部分的に解消" },
        { id: "P-R1-003", assessment: "解消" },
        { id: "P-R1-004", assessment: "解消" },
      ],
    });
    const r = await run(root);
    expectPassed(r);
    expect(r.out.filter((l) => l.startsWith("warning"))).toEqual([
      "warning: P-R1-001 (R1) is resolved, but R2 assesses it 未解消",
      "warning: P-R1-002 (R1) is resolved, but R2 assesses it 部分的に解消",
      "warning: P-R1-003 (R1) is open, but R2 assesses it 解消",
      "warnings: 3",
    ]);
    expect(r.out).toContain("REVIEW LOOP: incomplete (open 1)");
  });
  it("a finding of a round before the last without an assessment in the next round is a warning (invalid ones are not); exit 0", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001"), finding("P-R1-002"), finding("P-R1-003", "Low", { status: "invalid", verdict: "INVALID", note: "理由" })]);
    writeRound(root, "demo", 2, [finding("P-R2-001")], { previous: [{ id: "P-R1-001", assessment: "未解消" }] });
    const r = await run(root);
    expectPassed(r);
    expect(r.out).toContain("previous: P-R1-002 (R1, open) — R2: (no assessment)");
    expect(r.out.filter((l) => l.startsWith("warning"))).toEqual(["warning: P-R1-002 (R1, open) has no assessment in the previous of R2", "warnings: 1"]);
  });
});

describe("review-check: the files (exit 2)", () => {
  it("no directory for the label", async () => {
    const { root } = repo();
    expectFailed(await run(root), "files");
  });
  it("a directory without findings-r<N>.json", async () => {
    const { root } = repo();
    mkdirSync(path.join(root, "docs", "reviews", "demo"));
    writeFileSync(path.join(root, "docs", "reviews", "demo", "review-r1.md"), "x\n");
    expectFailed(await run(root), "files");
  });
  it.each(["findings-r01.json", "findings-r1.json.bak", "findings-x.json", "findings-r0.json", "findings-R2.json"])("a name that starts with findings- but is not findings-r<N>.json: %s", async (name) => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeFileSync(path.join(root, "docs", "reviews", "demo", name), "{}\n");
    const r = await run(root);
    expectFailed(r, "files");
    expect(r.err.join("\n")).toContain(JSON.stringify(name));
  });
  it("a gap in the rounds (R1 and R3)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeRound(root, "demo", 3, [finding("P-R3-001")]);
    const r = await run(root);
    expectFailed(r, "files");
    expect(r.err.join("\n")).toContain("findings-r2.json is missing");
  });
  it("only R2 (R1 is missing)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 2, [finding("P-R2-001")]);
    expectFailed(await run(root), "files");
  });
  it("not valid JSON", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeFileSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), "{ not json");
    expectFailed(await run(root), "read");
  });
  it("a schema violation (an unknown field)", async () => {
    const { root } = repo();
    const file = writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { extra: MARK })]);
    expect(readFileSync(file, "utf8")).toContain("extra");
    expectFailed(await run(root), "read");
  });
  it("a directory where a findings file should be", async () => {
    const { root } = repo();
    mkdirSync(path.join(root, "docs", "reviews", "demo", "findings-r1.json"), { recursive: true });
    expectFailed(await run(root), "read");
  });
  it("a symbolic link (to a valid findings file) is not read", async () => {
    const { root } = repo();
    const real = writeRound(root, "other", 1, [finding("P-R1-001")], { label: "demo" });
    mkdirSync(path.join(root, "docs", "reviews", "demo"));
    symlinkSync(real, path.join(root, "docs", "reviews", "demo", "findings-r1.json"));
    expectFailed(await run(root), "read");
  });
  it.skipIf(isRoot)("a file that cannot be read (EACCES) is not absent (ADR-0022)", async () => {
    const { root } = repo();
    const file = writeRound(root, "demo", 1, [finding("P-R1-001")]);
    chmodSync(file, 0o000);
    cleanups.unshift(() => chmodSync(file, 0o644));
    const r = await run(root);
    expectFailed(r, "read");
    expect(r.err.join("\n")).toContain("EACCES");
  });
  it.skipIf(isRoot)("a label directory that cannot be listed (EACCES) is not empty", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    const dir = path.join(root, "docs", "reviews", "demo");
    chmodSync(dir, 0o000);
    cleanups.unshift(() => chmodSync(dir, 0o755));
    expectFailed(await run(root), "files");
  });
  it("the label and the round inside must be the file's", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")], { label: "other" });
    writeRound(root, "demo", 2, [finding("P-R2-001")], { round: 3, previous: [{ id: "P-R1-001", assessment: "未解消" }] });
    const r = await run(root);
    expectFailed(r, "label-round");
    expect(r.err.filter((l) => l.includes("[label-round]")).length).toBe(2);
  });
  it("every round must have the prefix of R1", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeRound(root, "demo", 2, [finding("Q-R2-001")], { prefix: "Q", previous: [{ id: "P-R1-001", assessment: "未解消" }] });
    expectFailed(await run(root), "prefix");
  });
});

describe("review-check: the shape the import gave (exit 2)", () => {
  it.each([
    ["an ID of another form", [finding("P-R1-1")]],
    ["an ID of another round", [finding("P-R2-001")]],
    ["a duplicate ID", [finding("P-R1-001"), finding("P-R1-001")]],
    ["a gap (001, 003)", [finding("P-R1-001"), finding("P-R1-003")]],
  ])("%s", async (_label, findings) => {
    const { root } = repo();
    writeRound(root, "demo", 1, findings);
    expectFailed(await run(root), "id");
  });
  it("a summary that is not the number of findings of each severity", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001", "High")], { summary: { high: 0, medium: 1, low: 0 } });
    expectFailed(await run(root), "summary");
  });
});

describe("review-check: the fields each state needs (exit 2)", () => {
  const SHA = "f".repeat(40);
  it.each([
    ["resolved without fixedIn", { status: "resolved", verdict: "VALID", regressionTest: "t" }],
    ["resolved with a short fixedIn", { status: "resolved", verdict: "VALID", fixedIn: "abc1234", regressionTest: "t" }],
    ["resolved with an upper-case fixedIn", { status: "resolved", verdict: "VALID", fixedIn: SHA.toUpperCase(), regressionTest: "t" }],
    ["resolved without regressionTest", { status: "resolved", verdict: "VALID", fixedIn: "COMMIT", regressionTest: null }],
    ["resolved with a blank regressionTest", { status: "resolved", verdict: "VALID", fixedIn: "COMMIT", regressionTest: "  " }],
    ["deferred without destination", { status: "deferred", verdict: "VALID" }],
    ["deferred with a blank destination", { status: "deferred", verdict: "VALID", destination: " " }],
    ["accepted without note", { status: "accepted", verdict: "VALID" }],
    ["invalid without note", { status: "invalid", verdict: "INVALID" }],
    ["a verdict outside VALID / PARTIAL / INVALID / null", { verdict: "valid" }],
    ["invalid with a verdict other than INVALID", { status: "invalid", verdict: "VALID", note: "n" }],
    ["resolved with a null verdict", { status: "resolved", verdict: null, fixedIn: "COMMIT", regressionTest: "t" }],
    ["deferred with the verdict INVALID", { status: "deferred", verdict: "INVALID", destination: "v9" }],
    ["accepted with the verdict INVALID", { status: "accepted", verdict: "INVALID", note: "n" }],
  ])("%s", async (_label, over) => {
    const { root, commit } = repo();
    const sha = commit("fix");
    const o: Finding = { ...over };
    if (o.fixedIn === "COMMIT") o.fixedIn = sha;
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", o)]);
    expectFailed(await run(root), "state");
  });
  it("resolved with a fixedIn that is not a commit of the repository", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { status: "resolved", verdict: "VALID", fixedIn: SHA, regressionTest: "t" })]);
    const r = await run(root);
    expectFailed(r, "state");
    expect(r.err.join("\n")).toContain("P-R1-001");
  });
  it("resolved with the SHA of an annotated tag (a tag object, not the commit itself)", async () => {
    const { root, commit } = repo();
    commit("fix");
    git(root, ["tag", "-a", "v9", "-m", "tag"]);
    const tagObject = git(root, ["rev-parse", "v9"]);
    expect(git(root, ["cat-file", "-t", tagObject])).toBe("tag");
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { status: "resolved", verdict: "VALID", fixedIn: tagObject, regressionTest: "t" })]);
    expectFailed(await run(root), "state");
  });
  it("resolved in a directory that is not a git work tree: git cannot answer, exit 2 (fail closed)", async () => {
    const { root } = repo(false);
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { status: "resolved", verdict: "VALID", fixedIn: SHA, regressionTest: "t" })]);
    const r = await run(root);
    expectFailed(r, "git");
    expect(r.err.filter((l) => l.includes("[git]")).length).toBe(1);
  });
  it("several problems in several files are all listed", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { status: "deferred", verdict: "VALID" }), finding("P-R1-003")]);
    writeRound(root, "demo", 2, [finding("P-R2-001", "Low")], { summary: { high: 1, medium: 0, low: 0 }, previous: [{ id: "P-R1-009", assessment: "解消" }] });
    expectFailed(await run(root), "state", "id", "summary", "previous");
  });
});

describe("review-check: the previous round's assessments (exit 2)", () => {
  it("R1 with previous entries (there is no round 0)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")], { previous: [{ id: "P-R0-001", assessment: "解消" }] });
    expectFailed(await run(root), "previous");
  });
  it("an ID that is not a finding of the round before", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeRound(root, "demo", 2, [], { previous: [{ id: "P-R1-002", assessment: "解消" }] });
    const r = await run(root);
    expectFailed(r, "previous");
    expect(r.err.join("\n")).toContain("P-R1-002");
  });
  it("an ID of another shape is not shown (reviewer's text)", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeRound(root, "demo", 2, [], { previous: [{ id: MARK, assessment: "解消" }] });
    expectFailed(await run(root), "previous");
  });
  it("the same ID twice", async () => {
    const { root } = repo();
    writeRound(root, "demo", 1, [finding("P-R1-001")]);
    writeRound(root, "demo", 2, [], { previous: [{ id: "P-R1-001", assessment: "解消" }, { id: "P-R1-001", assessment: "未解消" }] });
    expectFailed(await run(root), "previous");
  });
});

describe("review-check: options and the repository (exit 2)", () => {
  it.each(["Demo", "../x", "a/b", "-x", ""])("the label %j is a usage error", async (label) => {
    const { root } = repo();
    const r = await run(root, label);
    expectFailed(r, "options");
  });
  it("a directory without docs/reviews/", async () => {
    const t = makeTempDir("aiqh-test-rc-");
    cleanups.push(t.cleanup);
    expectFailed(await run(t.dir), "repository");
  });
  it("a label directory that is a symbolic link out of the repository", async () => {
    const { root } = repo();
    const outside = makeTempDir("aiqh-test-rc-out-");
    cleanups.push(outside.cleanup);
    writeRound(outside.dir, "demo", 1, [finding("P-R1-001")]);
    symlinkSync(path.join(outside.dir, "docs", "reviews", "demo"), path.join(root, "docs", "reviews", "demo"));
    expectFailed(await run(root), "path");
  });
});

/** Every path under `dir` with its kind, bytes and modification time. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = lstatSync(p);
      out.push(`${path.relative(dir, p)} ${st.isDirectory() ? "dir" : st.size} ${st.mtimeMs}`);
      if (st.isDirectory() && name !== ".git") walk(p);
    }
  };
  walk(dir);
  return out;
}

describe("review-check: it only reads", () => {
  it("a passing check, a failing check and a check with warnings leave every file and directory as they were", async () => {
    const { root, commit } = repo();
    const sha = commit("fix");
    writeRound(root, "demo", 1, [finding("P-R1-001", "Medium", { status: "resolved", verdict: "VALID", fixedIn: sha, regressionTest: "t" }), finding("P-R1-002")]);
    writeRound(root, "demo", 2, [finding("P-R2-001")], { previous: [{ id: "P-R1-001", assessment: "未解消" }] });
    writeRound(root, "broken", 1, [finding("P-R1-001", "Medium", { status: "deferred", verdict: "VALID" })]);
    const before = snapshot(root);
    const ok = await run(root);
    expectPassed(ok);
    expect(ok.out.filter((l) => l.startsWith("warning:")).length).toBe(2);
    expectFailed(await run(root, "broken"), "state");
    expectFailed(await run(root, "absent"), "files");
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(path.join(root, "docs", "reviews", "absent"))).toBe(false);
  });
});

describe("review-import shows the review loop of the label after a write (the exit code does not change)", () => {
  const REVIEW = path.join(FIXTURES, "review-import", "b21-r1.md");
  async function imported(root: string): Promise<Run> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runReviewImport({ review: REVIEW, label: "backlog-21", round: 1, idPrefix: "B21", cwd: root, toolVersion: "9.9.9", log: (l) => out.push(l), logError: (l) => err.push(l) });
    return { code, out, err };
  }
  it("an open finding imported: REVIEW LOOP: incomplete (open 1), before the last line", async () => {
    const { root } = repo();
    const r = await imported(root);
    expect([r.code, r.err]).toEqual([0, []]);
    expect(r.out.slice(-2)).toEqual(["REVIEW LOOP: incomplete (open 1)", "REVIEW IMPORT: written"]);
  });
  it("a label whose rounds do not pass review-check: REVIEW LOOP: unknown, still exit 0", async () => {
    const { root } = repo();
    writeRound(root, "backlog-21", 3, [finding("B21-R3-001")], { prefix: "B21" });
    const r = await imported(root);
    expect([r.code, r.err]).toEqual([0, []]);
    expect(r.out.slice(-2)).toEqual(["REVIEW LOOP: unknown (aiqh review-check --label backlog-21 shows why)", "REVIEW IMPORT: written"]);
  });
});
