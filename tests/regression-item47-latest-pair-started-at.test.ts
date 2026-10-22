/**
 * Item 47 (R-010), v0.13.2, test 47-c-1: one verify writes the same `startedAt` string into latest.json, latest.md (the
 * `| Started | … |` row) and its history file. This is the clue of the reader contract (README "出力"; ADR-0003 and ADR-0034
 * notes): when latest.json and latest.md carry different values, they come from different runs. The same value does not prove the
 * same run (two runs can start in the same millisecond; regression-item47-latest-pair-race.test.ts). Passes before and after
 * v0.13.2: the contract pins the present behaviour, it changes nothing.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** The value of the `| Started | … |` row of latest.md (null when the row is missing). */
function startedOfMarkdown(md: string): string | null {
  const m = /^\| Started \| (.+) \|$/m.exec(md);
  return m?.[1] ?? null;
}

describe("item 47 (47-c-1): one verify writes one startedAt into latest.json, latest.md and its history", () => {
  it("the three values are the same string", async () => {
    const t = makeTempDir("aiqh-item47-pair-");
    cleanups.push(t.cleanup);
    writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "one", kind: "custom", command: "node -e 0" }] }));
    const lines: string[] = [];
    const code = await runVerify({ cwd: t.dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    expect(code).toBe(0);
    const out = path.join(t.dir, "artifacts", "verification");
    const json = JSON.parse(readFileSync(path.join(out, "latest.json"), "utf8")) as VerificationReport;
    const md = readFileSync(path.join(out, "latest.md"), "utf8");
    const history = readdirSync(path.join(out, "history"));
    expect(history).toHaveLength(1);
    const historyReport = JSON.parse(readFileSync(path.join(out, "history", history[0] ?? ""), "utf8")) as VerificationReport;
    expect(json.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(startedOfMarkdown(md)).toBe(json.startedAt);
    expect(historyReport.startedAt).toBe(json.startedAt);
  });
});
