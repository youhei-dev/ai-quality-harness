/**
 * v0.12.0 (ADR-0035 decisions 1 and 5, ADR-0034 H / N): the command side of `aiqh history --html [--out <dir>]`. The dashboard is
 * written to `<out>/dashboard.html` (by default `<cwd>/artifacts/history/`) through writeAtomic (format "html"); standard output
 * stays what it is without --html (the table, or --json), and the bytes of v0.11.2 are kept (a fixed fixture, its SHA-256). --out
 * without --html is a usage error. The output is never written through a symbolic link (--out or dashboard.html), never into a
 * history directory that is read, and the limit of the HTML file is the bytes of the file written (exactly the limit is written,
 * one byte over is output-too-large with nothing written: no file, nothing on standard output). A history that cannot be read in
 * full still gets its dashboard (exit 2).
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runHistory, type HistoryOptions } from "../src/commands/history.ts";
import { writeAtomic } from "../src/report/write.ts";
import { check, historyDir, put, report, stamp } from "./history-fixtures.ts";
import { makeTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");
const TOO_LARGE = "HISTORY ERROR (output-too-large)";
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Run {
  code: number;
  written: string[];
  err: string[];
}

async function history(from: string[], over: Partial<HistoryOptions> = {}): Promise<Run> {
  const written: string[] = [];
  const err: string[] = [];
  const write = (text: string): void => {
    written.push(text);
  };
  const code = await runHistory({ from, json: false, toolVersion: "0.0.0-fixed", write, logError: (l) => err.push(l), cwd: "/", ...over });
  return { code, written, err };
}

/** A new empty directory (removed after the test). */
function tempDir(prefix = "aiqh-html-out-"): string {
  const t = makeTempDir(prefix);
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Three runs of one project on three days (one FAIL) and an empty history file (unread): exit 2 with or without --html. */
function fixture(): { root: string; history: string } {
  const h = historyDir(cleanups, "root");
  for (let i = 0; i < 3; i++) {
    put(h.history, stamp(i), report({ startedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), checks: [check({ status: i === 1 ? "FAIL" : "PASS", exitCode: i === 1 ? 1 : 0 }), check({ name: "lint", kind: "lint" })] }));
  }
  put(h.history, stamp(9), "");
  return h;
}

/** A project with two runs, every file readable. */
function small(): { root: string; history: string } {
  const h = historyDir(cleanups, "root");
  for (let i = 0; i < 2; i++) put(h.history, stamp(i), report({ startedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
  return h;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const DASHBOARD_LINE = /^dashboard: dashboard\.html \((\d+) bytes\)$/;

describe("v0.12.0: standard output does not change", () => {
  it("without --html, the table and --json are the bytes of v0.11.2 (a fixed fixture: their SHA-256)", async () => {
    const h = fixture();
    const table = await history([h.root]);
    expect([table.code, Buffer.byteLength(table.written.join("")), sha256(table.written.join(""))]).toEqual([2, 1746, "b6211f2aac23ca8d9b377e7406f6aa26bf3ddb50501cdf45bdde8b93b88eed7d"]);
    const json = await history([h.root], { json: true });
    expect([json.code, Buffer.byteLength(json.written.join("")), sha256(json.written.join(""))]).toEqual([2, 10154, "4a78998fde05a3a359a94e8d5542456d2259072c58f39f0fc11d0bb82c7ab91c"]);
    expect(json.err).toEqual(["HISTORY INCOMPLETE — unread 1 of 4 history files (listed above)"]);
  });

  it("with --html, standard output is the same as without it (the table and --json); the dashboard line goes to standard error", async () => {
    const h = fixture();
    for (const json of [false, true]) {
      const plain = await history([h.root], { json });
      const out = tempDir();
      const r = await history([h.root], { json, html: true, out });
      expect(r.code, `json ${json}`).toBe(2);
      expect(r.written).toEqual(plain.written);
      const file = path.join(out, "dashboard.html");
      const bytes = statSync(file).size;
      const line = r.err.find((l) => DASHBOARD_LINE.test(l));
      expect(line, `json ${json}`).toBe(`dashboard: dashboard.html (${bytes} bytes)`);
      expect(r.err.join("\n")).not.toContain(out); // the path is not shown
      if (json) expect(r.err.at(-1)).toBe("HISTORY INCOMPLETE — unread 1 of 4 history files (listed above)");
    }
  });
});

describe("ADR-0035 decision 1: --html and --out", () => {
  it("--out without --html is a usage error (exit 2): nothing is written", async () => {
    const h = small();
    const out = tempDir();
    const r = await history([h.root], { out });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (usage)"]);
    expect(existsSync(path.join(out, "dashboard.html"))).toBe(false);
  });

  it("the default --out is <cwd>/artifacts/history/ (created when missing), relative --out is resolved against --cwd", async () => {
    const h = small();
    const cwd = tempDir("aiqh-html-cwd-");
    const r = await history([h.root], { html: true, cwd });
    expect(r.code).toBe(0);
    expect(lstatSync(path.join(cwd, "artifacts", "history", "dashboard.html")).isFile()).toBe(true);
    const rel = await history([h.root], { html: true, cwd, out: "nested/out" });
    expect(rel.code).toBe(0);
    expect(lstatSync(path.join(cwd, "nested", "out", "dashboard.html")).isFile()).toBe(true);
  });

  it("the history directories that are read are not written: an --out inside one is an error (exit 2), nothing written", async () => {
    const h = small();
    for (const out of [h.history, path.join(h.history, "sub")]) {
      const r = await history([h.root], { html: true, out });
      expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-in-history)"]);
      expect(existsSync(path.join(out, "dashboard.html"))).toBe(false);
    }
    expect(existsSync(path.join(h.history, "sub"))).toBe(false);
  });

  it("an --out that is a symbolic link is an error (exit 2): nothing is written where it points", async () => {
    const h = small();
    const target = tempDir();
    const base = tempDir();
    const link = path.join(base, "link");
    symlinkSync(target, link);
    const r = await history([h.root], { html: true, out: link });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-symlink)"]);
    expect(existsSync(path.join(target, "dashboard.html"))).toBe(false);
  });

  it("a dashboard.html that is a symbolic link is an error (exit 2): the link and the file it points to are not changed", async () => {
    const h = small();
    const out = tempDir();
    const elsewhere = path.join(tempDir(), "kept.txt");
    writeFileSync(elsewhere, "kept\n");
    symlinkSync(elsewhere, path.join(out, "dashboard.html"));
    const r = await history([h.root], { html: true, out });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-symlink)"]);
    expect(lstatSync(path.join(out, "dashboard.html")).isSymbolicLink()).toBe(true);
    expect(readFileSync(elsewhere, "utf8")).toBe("kept\n");
  });

  it("an --out that is a file, and a dashboard.html that is a directory, are errors (exit 2)", async () => {
    const h = small();
    const file = path.join(tempDir(), "a-file");
    writeFileSync(file, "x");
    const r = await history([h.root], { html: true, out: file });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-not-a-directory)"]);
    const out = tempDir();
    mkdirSync(path.join(out, "dashboard.html"));
    const d = await history([h.root], { html: true, out });
    expect([d.code, d.written, d.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (output-not-a-file)"]);
  });

  it("a history that cannot be read in full still gets its dashboard (exit 2)", async () => {
    const h = fixture();
    const out = tempDir();
    const r = await history([h.root], { html: true, out });
    expect(r.code).toBe(2);
    const html = readFileSync(path.join(out, "dashboard.html"), "utf8");
    expect(html).toContain(`#1/${stamp(9)}: empty`);
    expect(html).toContain("INCOMPLETE");
  });

  it("an input error writes nothing (no file, nothing on standard output)", async () => {
    const h = small();
    const out = tempDir();
    const r = await history([h.root, path.join(h.root, "missing")], { html: true, out });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], "HISTORY ERROR (not-found)"]);
    expect(existsSync(path.join(out, "dashboard.html"))).toBe(false);
  });
});

describe("ADR-0034 N / ADR-0035 decision 5: the limit of the HTML file is the bytes of the file written", () => {
  it("exactly the file's bytes is written; one byte less is output-too-large: no file, nothing on standard output", async () => {
    const h = small();
    const first = tempDir();
    expect((await history([h.root], { html: true, out: first })).code).toBe(0);
    const bytes = statSync(path.join(first, "dashboard.html")).size;
    expect(bytes).toBeGreaterThan(1000);
    const exact = tempDir();
    const e = await history([h.root], { html: true, out: exact, deps: { htmlMaxBytes: bytes } });
    expect(e.code).toBe(0);
    expect(readFileSync(path.join(exact, "dashboard.html"))).toEqual(readFileSync(path.join(first, "dashboard.html")));
    const over = tempDir();
    const o = await history([h.root], { html: true, out: over, deps: { htmlMaxBytes: bytes - 1 } });
    expect([o.code, o.written, o.err.at(-1)]).toEqual([2, [], TOO_LARGE]);
    expect(existsSync(path.join(over, "dashboard.html"))).toBe(false);
  });

  it("when standard output is over its limit, the HTML file is not written either", async () => {
    const h = small();
    const out = tempDir();
    const r = await history([h.root], { html: true, out, deps: { outputMaxBytes: 10 } });
    expect([r.code, r.written, r.err.at(-1)]).toEqual([2, [], TOO_LARGE]);
    expect(existsSync(path.join(out, "dashboard.html"))).toBe(false);
  });
});

describe("ADR-0035 decision 5: writeAtomic(…, \"html\")", () => {
  it("the forbidden characters become \\u{HEX} at the write, like Markdown (the last gate)", () => {
    const dir = tempDir();
    const file = path.join(dir, "x.html");
    writeAtomic(file, `a${String.fromCodePoint(0x202e)}b${String.fromCodePoint(0x7)}c\n`, "html");
    expect(readFileSync(file, "utf8")).toBe("a\\u{202E}b\\u{7}c\n");
  });
});

describe("ADR-0035 decision 1: the CLI", () => {
  async function cli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd, timeout: 25_000, killSignal: "SIGKILL" });
      return { code: 0, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
  }

  it("aiqh history --from <dir> --html --out <dir> writes the dashboard; --out alone is a usage error (exit 2)", async () => {
    const h = small();
    const out = tempDir();
    const r = await cli(["history", "--from", h.root, "--html", "--out", out], "/");
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("HISTORY COMPLETE — projects 1, runs 2, sources 1");
    expect(lstatSync(path.join(out, "dashboard.html")).isFile()).toBe(true);
    const u = await cli(["history", "--from", h.root, "--out", out], "/");
    expect(u.code).toBe(2);
    expect(u.stderr.trim().split("\n").at(-1)).toBe("HISTORY ERROR (usage)");
  });
});
