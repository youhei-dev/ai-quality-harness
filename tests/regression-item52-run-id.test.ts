/**
 * Item 52 (v0.16.0; batch2 design, final, §3; ADR-0038): verify makes one runId at its start (crypto.randomUUID(): a UUID of
 * version 4 in lower case, 36 characters) and writes the same value into latest.json and its history file (the top-level key right
 * before startedAt) and into latest.md (the `| Run ID |` row right before `| Started |`). The terminal output does not show it
 * (B2-Q6 A). buildReport takes the runId as an input and makes none; the report type keeps it optional (older reports have none).
 * Readers that skip unknown keys (aiqh history) read a report with or without runId the same.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHistory } from "../src/commands/history.ts";
import { runVerify } from "../src/commands/verify.ts";
import { buildReport } from "../src/report/build-report.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { ResolvedConfig, VerificationReport } from "../src/types.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Written {
  code: number;
  lines: string[];
  json: VerificationReport;
  jsonText: string;
  md: string;
  history: VerificationReport[];
  historyFiles: string[];
  out: string;
}

/** One verify in a new directory (one check `node -e 0`; with `aborted`, a signal before any check). */
async function verifyOnce(aborted = false): Promise<Written> {
  const t = makeTempDir("aiqh-item52-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "one", kind: "custom", command: "node -e 0" }] }));
  const lines: string[] = [];
  const controller = new AbortController();
  if (aborted) controller.abort("SIGINT");
  const code = await runVerify({ cwd: t.dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l), signal: controller.signal });
  const out = path.join(t.dir, "artifacts", "verification");
  const jsonText = readFileSync(path.join(out, "latest.json"), "utf8");
  const historyFiles = readdirSync(path.join(out, "history")).sort();
  return {
    code,
    lines,
    json: JSON.parse(jsonText) as VerificationReport,
    jsonText,
    md: readFileSync(path.join(out, "latest.md"), "utf8"),
    history: historyFiles.map((f) => JSON.parse(readFileSync(path.join(out, "history", f), "utf8")) as VerificationReport),
    historyFiles,
    out,
  };
}

/** The value of the `| Run ID | … |` row of latest.md (null when there is none). */
const runIdOfMarkdown = (md: string): string | null => /^\| Run ID \| (.+) \|$/m.exec(md)?.[1] ?? null;

describe("item 52: one runId per verify, the same in latest.json, latest.md and the history file", () => {
  it("R1: one verify writes one runId into latest.json, latest.md and its history file", async () => {
    const w = await verifyOnce();
    expect(w.code).toBe(0);
    expect(w.history).toHaveLength(1);
    expect(typeof w.json.runId).toBe("string");
    expect(runIdOfMarkdown(w.md)).toBe(w.json.runId);
    expect(w.history[0]?.runId).toBe(w.json.runId);
  });

  it("R2: two verifies have two runIds", async () => {
    const [a, b] = [await verifyOnce(), await verifyOnce()];
    expect(a.json.runId).toMatch(UUID_V4);
    expect(b.json.runId).toMatch(UUID_V4);
    expect(a.json.runId).not.toBe(b.json.runId);
  });

  it("R3: the runId is a UUID of version 4 in lower case (8-4-4-4-12, version digit 4, variant digit 8 to b)", async () => {
    const w = await verifyOnce();
    expect(w.json.runId).toMatch(UUID_V4);
    expect(w.json.runId).toHaveLength(36);
  });

  it("R6: an interrupted run (a signal before any check) also writes one runId into the three files", async () => {
    const w = await verifyOnce(true);
    expect(w.json).toMatchObject({ verdict: "ERROR", interruptedBy: "SIGINT" });
    expect(w.json.runId).toMatch(UUID_V4);
    expect(runIdOfMarkdown(w.md)).toBe(w.json.runId);
    expect(w.history.map((r) => r.runId)).toEqual([w.json.runId]);
  });

  it("the place: the top-level key right before startedAt (after configSha256), and the Run ID row right before the Started row", async () => {
    const w = await verifyOnce();
    for (const r of [w.json, ...w.history]) {
      const keys = Object.keys(r);
      expect(keys.indexOf("runId"), "runId right before startedAt").toBe(keys.indexOf("startedAt") - 1);
      expect(keys.indexOf("runId"), "runId right after configSha256").toBe(keys.indexOf("configSha256") + 1);
    }
    const rows = w.md.split("\n");
    const at = rows.findIndex((l) => l.startsWith("| Run ID | "));
    expect(at).toBeGreaterThan(-1);
    expect(rows[at + 1]).toMatch(/^\| Started \| /);
    expect(rows.filter((l) => l.startsWith("| Run ID | "))).toHaveLength(1);
  });

  it("the terminal output does not show the runId (B2-Q6 A)", async () => {
    const w = await verifyOnce();
    const runId = w.json.runId ?? "";
    expect(runId).toMatch(UUID_V4);
    expect(w.lines.some((l) => l.includes(runId))).toBe(false);
    expect(w.lines.some((l) => /run id|runid/i.test(l))).toBe(false);
  });

  it("buildReport writes the runId it is given and makes none (two reports of the same input are equal)", () => {
    const config: ResolvedConfig = { projectRoot: "/r", configPath: "/r/aiqh.config.jsonc", project: { name: "p" }, outputDir: "/r/out", security: DEFAULT_SECURITY, checks: [] };
    const input = { config, results: [checkResult()], git: null, startedAt: new Date("2026-10-26T00:00:00.000Z"), finishedAt: new Date("2026-10-26T00:00:01.000Z"), toolVersion: "0.0.0", runId: "11111111-2222-4333-8444-555555555555" };
    const a = buildReport(input);
    expect(a.runId).toBe("11111111-2222-4333-8444-555555555555");
    expect(buildReport(input)).toEqual(a);
  });

  it("R5 (guard): aiqh history reads a report without runId (written before v0.16.0) as the same report with it", async () => {
    const w = await verifyOnce();
    const read = async (): Promise<{ code: number; out: string }> => {
      const out: string[] = [];
      const code = await runHistory({ from: [path.join(w.out, "history")], json: true, toolVersion: "0.0.0-test", log: (l) => out.push(l), logError: (l) => out.push(l), cwd: "/" });
      return { code, out: out.join("\n") };
    };
    const withRunId = await read();
    const file = path.join(w.out, "history", w.historyFiles[0] ?? "");
    const old = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    delete old.runId;
    writeFileSync(file, JSON.stringify(old, null, 2));
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")) as object)).not.toContain("runId");
    const withoutRunId = await read();
    expect(withRunId.code).toBe(0);
    expect(withoutRunId).toEqual(withRunId);
  });
});
