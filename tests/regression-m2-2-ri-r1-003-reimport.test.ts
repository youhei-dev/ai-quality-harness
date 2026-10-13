/**
 * M2-2-RI-R1-003 (Medium, the independent review of review-import R1): the same review imported again returned exit 0 ("already imported")
 * as soon as the existing findings file had the same source.sha256, without checking the existing file's own label, round and idPrefix
 * against the options, and without the checks of the previous round (ENOENT unless --allow-missing-previous, unreadable, schema, label /
 * round / prefix). v0.6.1: those are checked by the same rules as a normal import before the exit 0; a disagreement is exit 2 and nothing is
 * written.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewImport } from "../src/commands/review-import.ts";
import { makeTempDir } from "./helpers.ts";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures", "review-import");
const LABEL = "backlog-16-2-19";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

async function run(root: string, round: number, allowMissingPrevious = false): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewImport({
    review: path.join(FIXTURES, `b16-r${round}.md`),
    label: LABEL,
    round,
    idPrefix: "B16",
    allowMissingPrevious,
    cwd: root,
    toolVersion: "9.9.9",
    log: (l) => out.push(l),
    logError: (l) => err.push(l),
  });
  return { code, out, err };
}

/** A repository with rounds 1 and 2 of backlog-16-2-19 imported. */
async function imported(): Promise<{ root: string; r1: string; r2: string }> {
  const t = makeTempDir("aiqh-test-ri3-");
  cleanups.push(t.cleanup);
  mkdirSync(path.join(t.dir, "docs", "reviews"), { recursive: true });
  expect((await run(t.dir, 1)).code).toBe(0);
  expect((await run(t.dir, 2)).code).toBe(0);
  const d = path.join(t.dir, "docs", "reviews", LABEL);
  return { root: t.dir, r1: path.join(d, "findings-r1.json"), r2: path.join(d, "findings-r2.json") };
}

function refused(r: { code: number; err: string[] }, kind: string, r2: string, before: Buffer): void {
  expect(r.code).toBe(2);
  expect(r.err.join("\n")).toContain(`[${kind}]`);
  expect(r.err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
  expect(readFileSync(r2)).toEqual(before);
}

describe("M2-2-RI-R1-003: the same review again checks the previous round", () => {
  it("control: nothing changed: exit 0, already imported", async () => {
    const { root } = await imported();
    const r = await run(root, 2);
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe("REVIEW IMPORT: already imported (same source); nothing written");
  });
  it("findings-r1.json removed: exit 2 (round 2 needs it)", async () => {
    const { root, r1, r2 } = await imported();
    const before = readFileSync(r2);
    rmSync(r1);
    refused(await run(root, 2), "previous", r2, before);
  });
  it("findings-r1.json removed, with --allow-missing-previous: exit 0 (the same rule as a normal import)", async () => {
    const { root, r1 } = await imported();
    rmSync(r1);
    expect((await run(root, 2, true)).code).toBe(0);
  });
  it("findings-r1.json broken: exit 2, even with --allow-missing-previous", async () => {
    const { root, r1, r2 } = await imported();
    const before = readFileSync(r2);
    writeFileSync(r1, "{ not json");
    refused(await run(root, 2, true), "previous", r2, before);
  });
  it("findings-r1.json of another label: exit 2", async () => {
    const { root, r1, r2 } = await imported();
    const before = readFileSync(r2);
    writeFileSync(r1, readFileSync(r1, "utf8").replace(`"label": "${LABEL}"`, '"label": "other"'));
    refused(await run(root, 2), "previous", r2, before);
  });
});

describe("M2-2-RI-R1-003: the same review again checks the existing file's own identifiers", () => {
  it.each([
    ["idPrefix", '"idPrefix": "B16"', '"idPrefix": "B99"'],
    ["round", '"round": 2', '"round": 3'],
    ["label", `"label": "${LABEL}"`, '"label": "backlog-16"'],
  ])("an existing findings-r2.json whose %s is not the option's: exit 2, the file unchanged", async (_label, from, to) => {
    const { root, r2 } = await imported();
    writeFileSync(r2, readFileSync(r2, "utf8").replace(from, to));
    const before = readFileSync(r2);
    refused(await run(root, 2), "existing", r2, before);
  });
});
