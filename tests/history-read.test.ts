/**
 * v0.11.0 (ADR-0034 B–D, M): aiqh history reads the history files as untrusted input. The --from forms and their errors, the names it
 * reads, symbolic links, the read limits taken from the descriptor (M4-D-R1-001), the order of the unread reasons, the detection of a
 * replaced directory (M4-D-R1-002), the length and number bounds before the masker (M4-D-R1-003, M4-D-R2-003), the fields kept, the
 * duplicates (Q7) and the count keys of the parsers. Times are never asserted (ROADMAP item 41).
 */
import { appendFileSync, chmodSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHECKS_MAX, readHistory, type ReadDeps, type ReadResult } from "../src/run-history/read.ts";
import { COUNT_KEYS, parseOutputAs } from "../src/parse/read.ts";
import { PARSER_TOOLS } from "../src/types.ts";
import { check, historyDir, put, report, SENTINELS, stamp, type Json } from "./history-fixtures.ts";
import { fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const read = (froms: string[], deps: ReadDeps = {}): ReadResult => readHistory(froms, "/", deps);
function ok(r: ReadResult): Extract<ReadResult, { ok: true }> {
  if (!r.ok) throw new Error(`expected a reading, got ${r.kind} (${r.detail})`);
  return r;
}
/** The unread reason (and code) of the only file of a one-file history. */
function reasonOf(content: Json | string | Buffer, deps: ReadDeps = {}): string {
  const { root, history } = historyDir(cleanups);
  put(history, stamp(0), content);
  const r = ok(read([root], deps));
  const u = r.unread[0];
  return u === undefined ? "read" : u.code === null ? u.reason : `${u.reason}:${u.code}`;
}

describe("ADR-0034 B: the --from forms and the input errors", () => {
  it("a project root (artifacts/verification/history) and a history directory are both read", () => {
    const a = historyDir(cleanups, "root");
    const b = historyDir(cleanups, "history");
    put(a.history, stamp(0), report());
    put(b.history, stamp(1), report({ project: { name: "beta", root: "/x" } }));
    const r = ok(read([a.root, b.root]));
    expect(r.sources.map((s) => [s.index, s.historyFiles, s.read, s.unread])).toEqual([[1, 1, 1, 0], [2, 1, 1, 0]]);
    expect(r.runs.map((x) => [x.source, x.project])).toEqual([[1, "alpha"], [2, "beta"]]);
  });

  it("a relative --from is resolved against cwd", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    const r = ok(readHistory([path.basename(a.root)], path.dirname(a.root)));
    expect(r.runs).toHaveLength(1);
  });

  it("errors: not found, not a directory, no history file, the same history twice; no path in the detail", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    const missing = read([path.join(a.root, "missing")]);
    expect(missing).toMatchObject({ ok: false, kind: "not-found", source: 1 });
    const file = put(a.root, "a-file", "x");
    expect(read([a.root, file])).toMatchObject({ ok: false, kind: "not-a-directory", source: 2 });
    const empty = historyDir(cleanups, "history");
    expect(read([empty.root])).toMatchObject({ ok: false, kind: "no-history", source: 1 });
    expect(read([a.root, a.history])).toMatchObject({ ok: false, kind: "duplicate-source", source: 2 });
    for (const r of [missing, read([a.root, file]), read([empty.root]), read([a.root, a.history])]) expect(JSON.stringify(r)).not.toContain(a.root);
  });

  it("a history directory whose realpath is outside the project root is an input error (outside-root)", () => {
    const a = historyDir(cleanups, "root");
    const outside = historyDir(cleanups, "root");
    put(outside.history, stamp(0), report());
    const t = makeTempDir("aiqh-history-root-");
    cleanups.push(t.cleanup);
    symlinkSync(path.join(outside.root, "artifacts"), path.join(t.dir, "artifacts"));
    expect(read([t.dir])).toMatchObject({ ok: false, kind: "outside-root", source: 1 });
    expect(a.root).not.toBe(t.dir);
  });

  it("names: only <stamp>.json and <stamp>-N.json are read; a leftover temporary file is counted; anything else is ignored; no descent", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    put(a.history, stamp(1).replace(".json", "-2.json"), report({ startedAt: "2026-01-01T00:00:01.000Z" }));
    put(a.history, `.${stamp(2)}.tmp-0123456789abcdef`, "partial");
    for (const other of ["notes.txt", ".DS_Store", stamp(3).replace(".json", "-01.json"), stamp(4).replace(".json", ".JSON"), "latest.json"]) put(a.history, other, report());
    mkdirSync(path.join(a.history, "sub"));
    put(path.join(a.history, "sub"), stamp(5), report());
    const r = ok(read([a.root]));
    expect(r.sources[0]).toEqual({ index: 1, historyFiles: 2, read: 2, unread: 0, duplicates: 0, ignored: 6, leftoverTemporary: 1 });
  });

  it("a symbolic link or a directory with a history name is not-regular (never followed)", () => {
    const a = historyDir(cleanups, "root");
    const target = put(a.root, "target.json", report());
    symlinkSync(target, path.join(a.history, stamp(0)));
    mkdirSync(path.join(a.history, stamp(1)));
    put(a.history, stamp(2), report());
    const r = ok(read([a.root]));
    expect(r.unread.map((u) => [u.file, u.reason])).toEqual([[stamp(0), "not-regular"], [stamp(1), "not-regular"]]);
    expect(r.runs).toHaveLength(1);
  });

  it("a file replaced after its lstat: a symbolic link is refused by O_NOFOLLOW, a directory by the fstat of the descriptor (both not-regular)", () => {
    const toLink = (f: string): void => {
      renameSync(f, `${f}.moved`);
      symlinkSync(`${f}.moved`, f);
    };
    const toDirectory = (f: string): void => {
      rmSync(f);
      mkdirSync(f);
    };
    expect(reasonOf(report(), { afterLstat: toLink })).toBe("not-regular");
    expect(reasonOf(report(), { afterLstat: toDirectory })).toBe("not-regular");
    expect(reasonOf(report(), { afterLstat: () => {} })).toBe("read");
  });

  it("more history files than the limit is an input error before anything is read (too-many-files)", () => {
    const a = historyDir(cleanups, "root");
    for (let i = 0; i < 3; i++) put(a.history, stamp(i), report());
    let reads = 0;
    const r = read([a.root], { limits: { totalFiles: 2 }, afterFileRead: () => (reads += 1) });
    expect(r).toMatchObject({ ok: false, kind: "too-many-files", source: null });
    expect(reads).toBe(0);
    expect(ok(read([a.root], { limits: { totalFiles: 3 } })).sources[0]?.read).toBe(3);
  });
});

describe("M4-D-R1-001: the bytes read are bounded by the descriptor reads, not by the size seen before", () => {
  const padded = (n: number): string => {
    const text = `${JSON.stringify(report(), null, 2)}\n`;
    return text + " ".repeat(n - Buffer.byteLength(text));
  };

  it("at most the limit + 1 bytes are read from a larger file, which is too-large", () => {
    let most = 0;
    const deps: ReadDeps = { limits: { fileBytes: 4096 }, chunkBytes: 1000, afterChunk: (_f, n) => (most = Math.max(most, n)) };
    expect(reasonOf("x".repeat(4096 + 100), deps)).toBe("too-large");
    expect(most).toBe(4097);
  });

  it("exactly the limit is read; the limit + 1 is too-large", () => {
    const deps: ReadDeps = { limits: { fileBytes: 8192 } };
    expect(reasonOf(padded(8192), deps)).toBe("read");
    expect(reasonOf(padded(8193), deps)).toBe("too-large");
  });

  it("a file appended to after it was read is unreadable (size-changed)", () => {
    expect(reasonOf(report(), { afterFileRead: (f) => appendFileSync(f, " ") })).toBe("unreadable:size-changed");
  });

  it("a file truncated after it was read is unreadable (size-changed)", () => {
    expect(reasonOf(report(), { afterFileRead: (f) => truncateSync(f, 10) })).toBe("unreadable:size-changed");
  });

  it("a file that grows past the limit while it is read is too-large", () => {
    let grown = false;
    const deps: ReadDeps = {
      limits: { fileBytes: 64 },
      chunkBytes: 16,
      afterChunk: (f) => {
        if (!grown) appendFileSync(f, "y".repeat(100));
        grown = true;
      },
    };
    expect(reasonOf("z".repeat(50), deps)).toBe("too-large");
  });

  it("the total counts the bytes actually read, the limit + 1 of a too-large file included (too-many-bytes, nothing aggregated)", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), "x".repeat(5000));
    put(a.history, stamp(1), padded(3000));
    // 4,001 bytes read from the too-large file (the limit + 1) and 3,000 from the other: 7,001 in all.
    expect(read([a.root], { limits: { fileBytes: 4000, totalBytes: 7000 } })).toMatchObject({ ok: false, kind: "too-many-bytes", source: null });
    const r = ok(read([a.root], { limits: { fileBytes: 4000, totalBytes: 7001 } }));
    expect(r.unread.map((u) => u.reason)).toEqual(["too-large"]);
  });
});

describe("ADR-0034 C: the unread reasons and their order", () => {
  it("each reason", () => {
    expect(reasonOf("")).toBe("empty");
    expect(reasonOf(Buffer.from([0x7b, 0xff, 0x7d]))).toBe("not-utf8");
    expect(reasonOf("{")).toBe("not-json");
    expect(reasonOf(report({ schemaVersion: 2 }))).toBe("unknown-version");
    expect(reasonOf(report({ schemaVersion: "1" }))).toBe("unknown-version");
    expect(reasonOf('{"tool": {}}')).toBe("unknown-version");
    expect(reasonOf("[1]")).toBe("unknown-version");
    expect(reasonOf(report({ project: { root: "/x" } }))).toBe("bad-shape");
    expect(reasonOf(report({ verdict: "MAYBE" }))).toBe("bad-shape");
    expect(reasonOf(report({ startedAt: "2026-02-30T00:00:00.000Z" }))).toBe("bad-shape");
    expect(reasonOf(report({ configSha256: "A".repeat(64) }))).toBe("bad-shape");
  });

  it("an empty file that changes while it is read is unreadable, not empty (the order of the reasons)", () => {
    expect(reasonOf("", { afterFileRead: (f) => appendFileSync(f, "{}") })).toBe("unreadable:size-changed");
  });

  it("a file without read permission is unreadable with its errno name", () => {
    if (process.getuid?.() === 0) return; // root reads it anyway
    const { root, history } = historyDir(cleanups);
    const f = put(history, stamp(0), report());
    chmodSync(f, 0o000);
    cleanups.push(() => chmodSync(f, 0o600));
    expect(ok(read([root])).unread).toEqual([{ source: 1, file: stamp(0), reason: "unreadable", code: "EACCES" }]);
  });
});

describe("M4-D-R1-002: a replaced directory is detected, not prevented", () => {
  const replace = (dir: string): void => {
    const moved = `${dir}-moved`;
    renameSync(dir, moved);
    cpSync(moved, dir, { recursive: true });
    cleanups.push(() => rmSync(moved, { recursive: true, force: true }));
  };

  it("the history directory given directly, replaced after the reading: directory-changed", () => {
    const h = historyDir(cleanups, "history");
    put(h.history, stamp(0), report());
    expect(read([h.root], { afterAllRead: () => replace(h.history) })).toMatchObject({ ok: false, kind: "directory-changed", source: 1 });
  });

  it("an ancestor of the history (artifacts) replaced after the reading: directory-changed", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    expect(read([a.root], { afterAllRead: () => replace(path.join(a.root, "artifacts")) })).toMatchObject({ ok: false, kind: "directory-changed" });
  });

  it("verification replaced by a symbolic link to a copy inside the root: directory-changed", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    const v = path.join(a.root, "artifacts", "verification");
    const afterAllRead = (): void => {
      cpSync(v, path.join(a.root, "copy"), { recursive: true });
      rmSync(v, { recursive: true });
      symlinkSync(path.join(a.root, "copy"), v);
    };
    expect(read([a.root], { afterAllRead })).toMatchObject({ ok: false, kind: "directory-changed" });
  });

  it("nothing replaced: the reading stands (the control)", () => {
    const a = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    expect(ok(read([a.root], { afterAllRead: () => undefined })).runs).toHaveLength(1);
  });
});

describe("M4-D-R1-003 / M4-D-R2-003: lengths and numbers are checked before anything is kept or masked", () => {
  const nameOf = (bytes: number, char = "a"): string => char.repeat(bytes / Buffer.byteLength(char));

  it("project and check names: 256 UTF-8 bytes read, 257 bad-shape (multi-byte characters count as bytes)", () => {
    expect(reasonOf(report({ project: { name: nameOf(256) } }))).toBe("read");
    expect(reasonOf(report({ project: { name: nameOf(257) } }))).toBe("bad-shape");
    expect(reasonOf(report({ project: { name: `${"あ".repeat(85)}a` } }))).toBe("read");
    expect(reasonOf(report({ project: { name: "あ".repeat(86) } }))).toBe("bad-shape");
    expect(reasonOf(report({ checks: [check({ name: nameOf(256) })] }))).toBe("read");
    expect(reasonOf(report({ checks: [check({ name: nameOf(257) })] }))).toBe("bad-shape");
  });

  it("tool.version: 64 bytes read, 65 bad-shape; checks: 256 read, 257 bad-shape", () => {
    expect(reasonOf(report({ tool: { version: nameOf(64) } }))).toBe("read");
    expect(reasonOf(report({ tool: { version: nameOf(65) } }))).toBe("bad-shape");
    const many = (n: number): Json[] => Array.from({ length: n }, (_, i) => check({ name: `c${i}` }));
    expect(reasonOf(report({ checks: many(CHECKS_MAX) }))).toBe("read");
    expect(reasonOf(report({ checks: many(CHECKS_MAX + 1) }))).toBe("bad-shape");
  });

  it("a name over the bound never reaches the masker: nothing of it is kept", () => {
    const secret = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const { root, history } = historyDir(cleanups);
    put(history, stamp(0), report({ project: { name: `${secret}${"x".repeat(300)}` } }));
    const r = ok(read([root]));
    expect(r.unread.map((u) => u.reason)).toEqual(["bad-shape"]);
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(JSON.stringify(r)).not.toContain("REDACTED");
  });

  it("numbers are safe integers: 2^53 - 1 read; 2^53, 1e100, -1 and 0.5 bad-shape; -0 read as 0", () => {
    const text = (v: string): string => JSON.stringify(report({ durationMs: 1 }), null, 2).replace('"durationMs": 1,', `"durationMs": ${v},`);
    expect(reasonOf(text("9007199254740991"))).toBe("read");
    for (const v of ["9007199254740992", "1e100", "-1", "0.5"]) expect(reasonOf(text(v)), v).toBe("bad-shape");
    expect(reasonOf(text("-0"))).toBe("read");
    expect(reasonOf(report({ summary: { total: 2 ** 53, passed: 1, failed: 0, skipped: 0, requiredFailed: 0 } }))).toBe("bad-shape");
    expect(reasonOf(report({ checks: [check({ durationMs: 2 ** 53 })] }))).toBe("bad-shape");
    const counts = (v: number): Json => report({ checks: [check({ parsed: { tool: "vitest", status: "parsed", reason: null, truncated: false, counts: { tests: v }, items: [], itemsOmitted: 0 } })] });
    expect(reasonOf(counts(2 ** 53 - 1))).toBe("read");
    expect(reasonOf(counts(2 ** 53))).toBe("bad-shape");
  });

  it("timeoutSec is a positive integer like in the config: 1 read; 0, 0.5, 1e-100, -1 and 2^53 bad-shape", () => {
    expect(reasonOf(report({ checks: [check({ timeoutSec: 1 })] }))).toBe("read");
    for (const v of [0, 0.5, 1e-100, -1, 2 ** 53]) expect(reasonOf(report({ checks: [check({ timeoutSec: v })] })), String(v)).toBe("bad-shape");
  });

  it("a deep nesting inside a read field is bad-shape; one inside a field not read is dropped", () => {
    // Written as text: JSON.stringify of a value this deep runs out of stack in the test itself.
    const deep = `${"[".repeat(10_000)}1${"]".repeat(10_000)}`;
    const withDeep = (value: Json): string => `${JSON.stringify(value, null, 2)}\n`.replace('"DEEP"', deep);
    expect(withDeep({ x: "DEEP" })).toContain(deep);
    expect(reasonOf(withDeep(report({ checks: [check({ parsed: { tool: "vitest", status: "parsed", reason: null, truncated: false, counts: { tests: "DEEP" }, items: [], itemsOmitted: 0 } })] })))).toBe("bad-shape");
    expect(reasonOf(withDeep(report({ notRead: "DEEP" })))).toBe("read");
  });
});

describe("ADR-0034 C: what is kept", () => {
  it("only the fields the aggregate uses: no path, command, output, item name, branch, commit, description or reason", () => {
    const { root, history } = historyDir(cleanups);
    const items = [{ kind: "allowed", name: SENTINELS.allowRule }, { kind: "allow-rule-used", name: SENTINELS.allowRule }];
    const scan = check({ name: "security", kind: "security", parsed: { tool: "aiqh-security-scan", status: "parsed", reason: SENTINELS.reason, truncated: false, counts: { findings: 0, suppressed: 2, allowRulesUsed: 1, expiredAllowRules: 0, unusedAllowRules: 0 }, items, itemsOmitted: 0 } });
    put(history, stamp(0), report({ checks: [check(), scan] }));
    const text = JSON.stringify(ok(read([root])));
    for (const s of Object.values(SENTINELS)) expect(text).not.toContain(s);
    expect(text).not.toContain(root);
  });

  it("the same bytes in two sources are read once (duplicates, Q7)", () => {
    const a = historyDir(cleanups, "root");
    const b = historyDir(cleanups, "root");
    put(a.history, stamp(0), report());
    put(b.history, stamp(0), report());
    put(b.history, stamp(1), report({ startedAt: "2026-01-01T00:00:01.000Z" }));
    const r = ok(read([a.root, b.root]));
    expect(r.sources.map((s) => [s.read, s.duplicates])).toEqual([[1, 0], [2, 1]]);
    expect(r.runs).toHaveLength(2);
  });

  it("only the count keys of the tool are kept, in their order; other keys (__proto__ too) are dropped", () => {
    const { root, history } = historyDir(cleanups);
    const text = JSON.stringify(report({ checks: [check({ parsed: { tool: "vitest", status: "parsed", reason: null, truncated: false, counts: { other: 3, tests: 5, errors: 0 }, items: [], itemsOmitted: 0 } })] })).replace('"other":3', '"other":3,"__proto__":7');
    put(history, stamp(0), text);
    const r = ok(read([root]));
    expect([...(r.runs[0]?.checks[0]?.parsed?.counts.entries() ?? [])]).toEqual([["tests", 5], ["errors", 0]]);
  });

  it("COUNT_KEYS covers every key the parsers write (the fixtures of the parsers)", () => {
    const FIX = path.join(import.meta.dirname, "fixtures", "parse");
    const exec = (out: string, err = ""): Parameters<typeof parseOutputAs>[1] => ({ stdout: out, stderr: err, exitCode: 1, stdoutTruncated: false, stderrTruncated: false });
    const files: Record<string, string> = {
      vitest: "vitest-agent.stdout.txt",
      eslint: "eslint-sample.stdout.txt",
      "npm-audit": "npm-audit-two.stdout.txt",
      "aiqh-security-scan": "security-self.stdout.txt",
      pytest: "pytest-q-failures.stdout.txt",
      "node-test": "node-test-spec-fail.stdout.txt",
    };
    for (const tool of PARSER_TOOLS) {
      const p = parseOutputAs(tool, exec(readFileSync(path.join(FIX, files[tool] ?? ""), "utf8")));
      expect(p.status, tool).toBe("parsed");
      for (const key of Object.keys(p.counts)) expect(COUNT_KEYS[tool], `${tool} ${key}`).toContain(key);
    }
  });
});
