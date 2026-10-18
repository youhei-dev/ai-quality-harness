/**
 * v0.11.2 (M4-H-R1-001, ADR-0034 H / N): the output limit of aiqh history is the bytes it writes to standard output — every line with
 * its newline, the last line `HISTORY COMPLETE …` / `HISTORY INCOMPLETE …` included, and the --json document with its newline —
 * whatever the writer is. The writer `write` gets standard output as those bytes (the whole text in one call; it takes the place of
 * `log`), so these tests count the bytes it received. For the table and for --json: exactly the limit is written; one byte over is
 * output-too-large with nothing written (exit 2); a limit that only the last line (the table) or the last newline (--json) exceeds
 * is output-too-large with nothing written. The same limits give the same answers with the line writer `log`, and `write` gets
 * exactly the bytes the CLI writes to standard output.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runHistory, type HistoryOptions } from "../src/commands/history.ts";
import { historyDir, put, report, stamp } from "./history-fixtures.ts";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "src", "cli.ts");
const VERSION = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }).version;
const ERROR = "HISTORY ERROR (output-too-large)";
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Written {
  code: number;
  /** What the writer `write` received, one string per call. */
  written: string[];
  /** What the line writer `log` received (nothing when `write` is given). */
  lines: string[];
  err: string[];
}

async function history(from: string[], over: Partial<HistoryOptions> = {}): Promise<Written> {
  const written: string[] = [];
  const lines: string[] = [];
  const err: string[] = [];
  const write = (text: string): void => {
    written.push(text);
  };
  const code = await runHistory({ from, json: false, toolVersion: VERSION, write, log: (l) => lines.push(l), logError: (l) => err.push(l), cwd: "/", ...over });
  return { code, written, lines, err };
}

/** The CLI as a child process: its exit code and standard output. */
async function cli(args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [CLI, ...args], { cwd: "/", timeout: 25_000, killSignal: "SIGKILL" });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? "" };
  }
}

/** The bytes of what a writer received. */
const bytesOf = (parts: string[]): number => Buffer.byteLength(parts.join(""), "utf8");

/** A project with two history files; a name with multi-byte characters, so that bytes are not UTF-16 units. */
function project(name = "アルファ"): { root: string; history: string } {
  const h = historyDir(cleanups, "root");
  for (let i = 0; i < 2; i++) put(h.history, stamp(i), report({ project: { name, root: "/x" }, startedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
  return h;
}

describe("M4-H-R1-001: the table — every line, its newline and the last line count", () => {
  it("exactly the limit is written in one call; one byte over (the last newline) is output-too-large with nothing written", async () => {
    const a = project();
    const full = await history([a.root]);
    expect(full.code).toBe(0);
    expect(full.lines).toEqual([]); // write takes the place of log
    expect(full.written).toHaveLength(1);
    const text = full.written.join("");
    expect(text.endsWith("\nHISTORY COMPLETE — projects 1, runs 2, sources 1\n")).toBe(true);
    const bytes = bytesOf(full.written);
    expect(bytes).toBeGreaterThan(text.length);
    const exact = await history([a.root], { deps: { outputMaxBytes: bytes } });
    expect([exact.code, exact.written]).toEqual([0, full.written]);
    const over = await history([a.root], { deps: { outputMaxBytes: bytes - 1 } });
    expect([over.code, over.written, over.lines, over.err.at(-1)]).toEqual([2, [], [], ERROR]);
  });

  it("a limit that only the last line exceeds (every other line fits exactly) is output-too-large with nothing written", async () => {
    const a = project();
    const full = await history([a.root]);
    const text = full.written.join("");
    const last = "HISTORY COMPLETE — projects 1, runs 2, sources 1\n";
    expect(text.endsWith(`\n${last}`)).toBe(true);
    const withoutLast = bytesOf(full.written) - Buffer.byteLength(last, "utf8");
    const r = await history([a.root], { deps: { outputMaxBytes: withoutLast } });
    expect([r.code, r.written, r.lines, r.err.at(-1)]).toEqual([2, [], [], ERROR]);
  });

  it("HISTORY INCOMPLETE: its last line counts too (exit 2 either way; written only within the limit)", async () => {
    const a = project();
    put(a.history, stamp(5), "");
    const full = await history([a.root]);
    expect(full.code).toBe(2);
    const last = "HISTORY INCOMPLETE — unread 1 of 3 history files (listed above)\n";
    expect(full.written.join("").endsWith(`\n${last}`)).toBe(true);
    const bytes = bytesOf(full.written);
    const exact = await history([a.root], { deps: { outputMaxBytes: bytes } });
    expect([exact.code, exact.written]).toEqual([2, full.written]);
    const r = await history([a.root], { deps: { outputMaxBytes: bytes - Buffer.byteLength(last, "utf8") } });
    expect([r.code, r.written, r.lines, r.err.at(-1)]).toEqual([2, [], [], ERROR]);
  });
});

describe("M4-H-R1-001: --json — the document and its newline count", () => {
  it("exactly the limit is written in one call; one byte over is output-too-large with nothing written", async () => {
    const a = project();
    const full = await history([a.root], { json: true });
    expect(full.code).toBe(0);
    expect(full.lines).toEqual([]);
    expect(full.written).toHaveLength(1);
    const text = full.written[0] ?? "";
    expect(text.endsWith("}\n")).toBe(true);
    expect((JSON.parse(text) as { kind: string }).kind).toBe("aiqh-history");
    expect(full.err).toEqual(["HISTORY COMPLETE — projects 1, runs 2, sources 1"]); // standard error is not part of the limit
    const bytes = bytesOf(full.written);
    const exact = await history([a.root], { json: true, deps: { outputMaxBytes: bytes } });
    expect([exact.code, exact.written]).toEqual([0, full.written]);
    const over = await history([a.root], { json: true, deps: { outputMaxBytes: bytes - 1 } });
    expect([over.code, over.written, over.lines, over.err.at(-1)]).toEqual([2, [], [], ERROR]);
  });

  it("a limit that only the last newline exceeds (the document alone fits exactly) is output-too-large with nothing written", async () => {
    const a = project();
    const full = await history([a.root], { json: true });
    const text = full.written[0] ?? "";
    const documentBytes = Buffer.byteLength(text.slice(0, -1), "utf8");
    expect(documentBytes).toBe(bytesOf(full.written) - 1); // the only byte after the document is its newline
    const r = await history([a.root], { json: true, deps: { outputMaxBytes: documentBytes } });
    expect([r.code, r.written, r.lines, r.err.at(-1)]).toEqual([2, [], [], ERROR]);
  });
});

describe("M4-H-R1-001: the count does not depend on the writer", () => {
  it("with the line writer log, the same limits give the same answers, and its lines with their newlines are the bytes write got", async () => {
    for (const json of [false, true]) {
      const a = project();
      const viaWrite = await history([a.root], { json });
      const bytes = bytesOf(viaWrite.written);
      expect(bytes).toBeGreaterThan(0);
      const viaLog = async (max: number): Promise<{ code: number; out: string[]; err: string[] }> => {
        const out: string[] = [];
        const err: string[] = [];
        const code = await runHistory({ from: [a.root], json, toolVersion: VERSION, log: (l) => out.push(l), logError: (l) => err.push(l), cwd: "/", deps: { outputMaxBytes: max } });
        return { code, out, err };
      };
      const exact = await viaLog(bytes);
      expect(exact.code, `json ${json}`).toBe(0);
      expect(exact.out.map((l) => `${l}\n`).join("")).toBe(viaWrite.written.join(""));
      const over = await viaLog(bytes - 1);
      expect([over.code, over.out, over.err.at(-1)]).toEqual([2, [], ERROR]);
    }
  });

  it("write gets exactly the bytes the CLI writes to standard output (the table and --json)", async () => {
    const a = project();
    for (const json of [false, true]) {
      const viaWrite = await history([a.root], { json });
      const r = await cli(["history", "--from", a.root, ...(json ? ["--json"] : [])]);
      expect([r.code, r.stdout], `json ${json}`).toEqual([0, viaWrite.written.join("")]);
    }
  });
});
