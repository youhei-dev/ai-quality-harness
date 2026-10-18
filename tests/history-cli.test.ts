/**
 * v0.11.0 (ADR-0034 A, F, H, I, N): the command aiqh history. Real verify histories are read; the exit codes and the last lines
 * (COMPLETE 0, INCOMPLETE 2 with the aggregate and the list, ERROR 2 with nothing on standard output, 1 never); --json is one document
 * on standard output, the same for the same input; the fields that are not shown — paths, commands, output, item names (the allow rules
 * of R1-005 too), branch, commit, description — appear nowhere, neither in the table, the JSON nor the errors; the limits of the
 * aggregate and of the output (exactly the limit is shown, one more is an error); the finite guard; the CLI wiring.
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runHistory, type HistoryOptions } from "../src/commands/history.ts";
import { runVerify } from "../src/commands/verify.ts";
import { check, historyDir, put, report, SENTINELS, stamp } from "./history-fixtures.ts";
import { fake, makeTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Run {
  code: number;
  out: string[];
  err: string[];
}

async function history(from: string[], over: Partial<HistoryOptions> = {}): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runHistory({ from, json: false, toolVersion: "0.11.0", log: (l) => out.push(l), logError: (l) => err.push(l), cwd: "/", ...over });
  return { code, out, err };
}

/** A project with the given number of history files (one run each, a second apart). */
function project(runs: number, name = "alpha"): { root: string; history: string } {
  const h = historyDir(cleanups, "root");
  for (let i = 0; i < runs; i++) put(h.history, stamp(i), report({ project: { name, root: "/x" }, startedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
  return h;
}

describe("ADR-0034: real verify histories", () => {
  it("two verify runs of a project are read and aggregated: exit 0 and HISTORY COMPLETE", async () => {
    const t = makeTempDir("aiqh-history-verify-");
    cleanups.push(t.cleanup);
    writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "demo" }, checks: [{ name: "ok", kind: "custom", command: "node -e 0" }] }));
    for (let i = 0; i < 2; i++) expect(await runVerify({ cwd: t.dir, toolVersion: "0.11.0", log: () => undefined, logError: () => undefined })).toBe(0);
    const r = await history([t.dir]);
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe("HISTORY COMPLETE — projects 1, runs 2, sources 1");
    const j = await history([t.dir], { json: true });
    const doc = JSON.parse(j.out[0] ?? "{}") as { projects: Array<{ configs: Array<{ sha256: string | null; runs: number }> }> };
    expect(doc.projects[0]?.configs).toHaveLength(1);
    expect(doc.projects[0]?.configs[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ADR-0034 H: exit codes and last lines", () => {
  it("--json: one JSON document on standard output, the last line on standard error; the same input gives the same output", async () => {
    const a = project(2);
    const b = project(1, "beta");
    const r1 = await history([a.root, b.root], { json: true });
    const r2 = await history([a.root, b.root], { json: true });
    expect(r1.code).toBe(0);
    expect(r1.out).toHaveLength(1);
    expect(r1.out).toEqual(r2.out);
    expect(r1.err).toEqual(["HISTORY COMPLETE — projects 2, runs 3, sources 2"]);
    const doc = JSON.parse(r1.out[0] ?? "{}") as { kind: string; schemaVersion: number; projects: Array<{ name: string }> };
    expect([doc.kind, doc.schemaVersion, doc.projects.map((p) => p.name)]).toEqual(["aiqh-history", 1, ["alpha", "beta"]]);
  });

  it("a file that cannot be read: exit 2, the aggregate and the list, HISTORY INCOMPLETE (never 1)", async () => {
    const a = project(2);
    put(a.history, stamp(5), "");
    const r = await history([a.root]);
    expect(r.code).toBe(2);
    expect(r.out).toContain(`  #1/${stamp(5)}: empty`);
    expect(r.out.some((l) => l.startsWith("project alpha: runs 2"))).toBe(true);
    expect(r.out.at(-1)).toBe("HISTORY INCOMPLETE — unread 1 of 3 history files (listed above)");
    const j = await history([a.root], { json: true });
    expect(j.code).toBe(2);
    expect((JSON.parse(j.out[0] ?? "{}") as { complete: boolean }).complete).toBe(false);
  });

  it("a history full of FAILED runs is still exit 0 (1 is never used)", async () => {
    const h = historyDir(cleanups, "root");
    put(h.history, stamp(0), report({ verdict: "FAILED", exitCode: 1, checks: [check({ status: "FAIL", exitCode: 1 })] }));
    const r = await history([h.root]);
    expect(r.code).toBe(0);
  });

  it("an input error: exit 2, nothing on standard output, the --from as #n and no path, HISTORY ERROR (<kind>) last", async () => {
    const a = project(1);
    const r = await history([a.root, path.join(a.root, "missing")]);
    expect(r.code).toBe(2);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual(["aiqh: --from #2 does not exist", "HISTORY ERROR (not-found)"]);
    const u = await history([]);
    expect([u.code, u.out, u.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (usage)"]);
  });
});

describe("D6 / Q2 / R1-005: the fields that are not shown appear nowhere", () => {
  it("terminal, --json and the errors: no path, command, cwd, output, item or allow-rule name, branch, commit, description or reason", async () => {
    const h = historyDir(cleanups, "root");
    const items = [{ kind: "allowed", name: SENTINELS.allowRule }, { kind: "allow-rule-used", name: SENTINELS.allowRule }];
    const scan = check({ name: "security", kind: "security", parsed: { tool: "aiqh-security-scan", status: "parsed", reason: SENTINELS.reason, truncated: false, counts: { findings: 0, suppressed: 2, allowRulesUsed: 1, expiredAllowRules: 0, unusedAllowRules: 0 }, items, itemsOmitted: 0 } });
    for (let i = 0; i < 3; i++) put(h.history, stamp(i), report({ startedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), checks: [check({ status: i === 0 ? "FAIL" : "PASS" }), scan] }));
    put(h.history, stamp(9), "{");
    const runs = [await history([h.root]), await history([h.root], { json: true }), await history([h.root, path.join(h.root, "nope")])];
    const text = runs.map((r) => [...r.out, ...r.err].join("\n")).join("\n");
    for (const s of Object.values(SENTINELS)) expect(text, s).not.toContain(s);
    expect(text).not.toContain(h.root);
    expect(text).toContain("aiqh-security-scan suppressed"); // the number of suppressed findings is shown (Q1), the rule names are not
  });

  it("a secret-shaped name is masked in the table and in the JSON", async () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const h = historyDir(cleanups, "root");
    put(h.history, stamp(0), report({ project: { name: `p ${secret}`, root: "/x" }, checks: [check({ name: `c ${secret}` })] }));
    for (const json of [false, true]) {
      const r = await history([h.root], { json });
      const text = [...r.out, ...r.err].join("\n");
      expect(text).not.toContain(secret);
      expect(text).toContain("[REDACTED:");
    }
  });
});

describe("ADR-0034 N: the limits of the aggregate and of the output (M4-D-R2-001, Q10)", () => {
  it("too-many-values: nothing on standard output", async () => {
    const a = project(2);
    for (const json of [false, true]) {
      const r = await history([a.root], { json, deps: { aggregate: { valuesMax: 5 } } });
      expect([r.code, r.out, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (too-many-values)"]);
    }
  });

  it("--json: a document of exactly the limit is written; one byte less is output-too-large with nothing written", async () => {
    const a = project(2);
    const full = await history([a.root], { json: true });
    const bytes = Buffer.byteLength(full.out[0] ?? "", "utf8");
    const exact = await history([a.root], { json: true, deps: { outputMaxBytes: bytes } });
    expect(exact.out).toEqual(full.out);
    const less = await history([a.root], { json: true, deps: { outputMaxBytes: bytes - 1 } });
    expect([less.code, less.out, less.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-too-large)"]);
  });

  it("the table: exactly the limit is printed; one byte less is output-too-large with nothing printed", async () => {
    const a = project(2);
    const full = await history([a.root]);
    const table = full.out.slice(0, -1); // the last line is not part of the table
    const bytes = table.reduce((n, l) => n + Buffer.byteLength(l, "utf8") + 1, 0);
    const exact = await history([a.root], { deps: { outputMaxBytes: bytes } });
    expect(exact.out).toEqual(full.out);
    const less = await history([a.root], { deps: { outputMaxBytes: bytes - 1 } });
    expect([less.code, less.out, less.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-too-large)"]);
  });

  it("non-finite: nothing on standard output (only a replaced aggregate can show it)", async () => {
    const a = project(1);
    const beforeFiniteCheck = (v: { projects: Array<{ durationMs: { max: number } }> }): void => {
      const p = v.projects[0];
      if (p !== undefined) p.durationMs.max = Number.NaN;
    };
    const r = await history([a.root], { deps: { aggregate: { beforeFiniteCheck } } });
    expect([r.code, r.out, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (non-finite)"]);
  });

  it("near the default limits (no time is asserted): a long series goes through the JSON door", async () => {
    const h = historyDir(cleanups, "root");
    const counts = { testFiles: 1, testFilesFailed: 0, testFilesPassed: 1, testFilesExpectedFail: 0, testFilesSkipped: 0, testFilesTodo: 0, tests: 9, testsFailed: 0, testsPassed: 9, testsExpectedFail: 0, testsSkipped: 0, testsTodo: 0, errors: 0 };
    for (let d = 0; d < 400; d++) {
      const parsed = { tool: "vitest", status: "parsed", reason: null, truncated: false, counts, items: [], itemsOmitted: 0 };
      put(h.history, stamp(d), report({ startedAt: new Date(Date.UTC(2026, 0, 1 + d)).toISOString(), checks: [check({ parsed }), check({ name: "unit-2", parsed })] }));
    }
    const r = await history([h.root], { json: true });
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out[0] ?? "{}") as { projects: Array<{ counts: unknown[] }> };
    expect(doc.projects[0]?.counts).toHaveLength(26);
  });
});

describe("ADR-0034 A: the CLI", () => {
  async function cli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd, timeout: 25_000, killSignal: "SIGKILL" });
      return { code: 0, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
  }

  it("aiqh history --from <dir> (repeatable, relative to --cwd) --json; without --from it is a usage error (exit 2)", async () => {
    const a = project(1);
    const b = project(1, "beta");
    const r = await cli(["history", "--cwd", path.dirname(a.root), "--from", path.basename(a.root), "--from", b.root, "--json"], "/");
    expect(r.code).toBe(0);
    expect((JSON.parse(r.stdout) as { projects: unknown[] }).projects).toHaveLength(2);
    expect(r.stderr.trim().split("\n").at(-1)).toBe("HISTORY COMPLETE — projects 2, runs 2, sources 2");
    const u = await cli(["history"], a.root);
    expect(u.code).toBe(2);
    expect(u.stderr.trim().split("\n").at(-1)).toBe("HISTORY ERROR (usage)");
  });
});
