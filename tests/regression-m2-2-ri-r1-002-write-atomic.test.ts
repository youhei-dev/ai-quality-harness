/**
 * M2-2-RI-R1-002 (Medium, the independent review of review-import R1): writeAtomic wrote its temporary file at a predictable name
 * (`<target>.tmp-<pid>`) with writeFileSync, which follows a symbolic link: a link placed at that name could make it change a file outside
 * the repository (and a failed rename did not undo it). v0.6.1 (the human decision B-2): the temporary file is a random name in the same
 * directory (`.<base>.tmp-<16 hex digits>`), created exclusively (O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW) and closed, then opened again by
 * its path with the numeric flag O_WRONLY | O_TRUNC | O_NOFOLLOW (nothing is created, a symbolic link is not followed) and written, then
 * renamed; a name that exists is never written, another random name is tried (a few times); on a failure only the temporary name this call
 * created is removed. The verify reports and the history use the same function: their names, contents and the exit 2 on a write failure do
 * not change.
 * The collision is made in the test by wrapping node:crypto's randomBytes, and the name is replaced between the creation and the second open
 * by wrapping node:fs's writeFileSync (src/ has no test entrance).
 */
import type * as Crypto from "node:crypto";
import { randomBytes } from "node:crypto";
import type * as Fs from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  type PathOrFileDescriptor,
  type WriteFileOptions,
} from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { runReviewImport } from "../src/commands/review-import.ts";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { writeAtomic, writeReports } from "../src/report/write.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import { checkResult, makeTempDir } from "./helpers.ts";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

type WriteFile = (file: PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: WriteFileOptions) => void;

const FIXTURE = path.resolve(import.meta.dirname, "fixtures", "review-import", "b21-r1.md");
const actualFs = await vi.importActual<typeof Fs>("node:fs");
const random = vi.mocked(randomBytes) as unknown as Mock<(size: number) => Buffer>;
const writes = vi.mocked(writeFileSync) as unknown as Mock<WriteFile>;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  // back to the real functions (mockReset of vi.fn(impl) restores impl)
  random.mockReset();
  writes.mockReset();
});

function dir(): string {
  const t = makeTempDir("aiqh-test-ri2-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Temporary-file names in `d` (old and new forms). */
function temporaries(d: string): string[] {
  return readdirSync(d).filter((n) => n.includes(".tmp-"));
}

/** Run `change` on the temporary name just before writeFileSync opens it (after the exclusive creation); returns the names it was given. */
function beforeTheWrite(change: (tmp: string) => void): string[] {
  const seen: string[] = [];
  writes.mockImplementation((file, data, options) => {
    if (typeof file === "string" && path.basename(file).includes(".tmp-")) {
      seen.push(file);
      change(file);
    }
    actualFs.writeFileSync(file, data, options);
  });
  return seen;
}

describe("M2-2-RI-R1-002: a symbolic link at the old predictable name is not followed", () => {
  it("review-import: the file outside is unchanged and the findings file is written as a regular file", async () => {
    const root = dir();
    const outside = path.join(dir(), "outside.txt");
    writeFileSync(outside, "outside: keep\n");
    const target = path.join(root, "docs", "reviews", "backlog-21");
    mkdirSync(target, { recursive: true });
    const old = path.join(target, `findings-r1.json.tmp-${process.pid}`);
    symlinkSync(outside, old);
    const err: string[] = [];
    const code = await runReviewImport({ review: FIXTURE, label: "backlog-21", round: 1, idPrefix: "B21", cwd: root, toolVersion: "9.9.9", log: () => undefined, logError: (l) => err.push(l) });
    expect([code, err]).toEqual([0, []]);
    expect(readFileSync(outside, "utf8")).toBe("outside: keep\n");
    expect(lstatSync(path.join(target, "findings-r1.json")).isFile()).toBe(true);
    expect(readlinkSync(old)).toBe(outside); // the link itself is left as it was
    expect(temporaries(target)).toEqual([path.basename(old)]);
  });

  it("verify's reports: the file outside is unchanged; latest.json, latest.md and the history are written as before", () => {
    const root = dir();
    const outside = path.join(dir(), "outside.txt");
    writeFileSync(outside, "outside: keep\n");
    const outputDir = path.join(root, "artifacts", "verification");
    mkdirSync(path.join(outputDir, "history"), { recursive: true });
    symlinkSync(outside, path.join(outputDir, `latest.json.tmp-${process.pid}`));
    const report = buildReport({
      config: { projectRoot: root, configPath: path.join(root, "aiqh.config.jsonc"), project: { name: "demo" }, outputDir, security: DEFAULT_SECURITY, checks: [] },
      results: [checkResult({ name: "a", kind: "lint" })],
      git: null,
      startedAt: new Date("2026-10-13T01:02:03.456Z"),
      finishedAt: new Date("2026-10-13T01:02:04.000Z"),
      toolVersion: "9.9.9",
    });
    const paths = writeReports(report, outputDir);
    expect(readFileSync(outside, "utf8")).toBe("outside: keep\n");
    const json = `${JSON.stringify(report, null, 2)}\n`;
    expect(readFileSync(paths.latestJson, "utf8")).toBe(json);
    expect(readFileSync(paths.history, "utf8")).toBe(json);
    expect(readFileSync(paths.latestMd, "utf8")).toBe(renderMarkdown(report));
    expect(path.basename(paths.history)).toBe("20261013T010203Z.json");
    expect(temporaries(outputDir)).toEqual([`latest.json.tmp-${process.pid}`]);
    expect(temporaries(path.join(outputDir, "history"))).toEqual([]);
  });
});

describe("M2-2-RI-R1-002: the temporary file is created exclusively with a random name", () => {
  it("a name that exists is not written: another random name is tried and the write succeeds", () => {
    const d = dir();
    const target = path.join(d, "findings.json");
    const first = Buffer.from("aaaaaaaaaaaaaaaa", "hex");
    const taken = path.join(d, `.findings.json.tmp-${first.toString("hex")}`);
    writeFileSync(taken, "someone else's\n");
    random.mockImplementationOnce(() => first);
    writeAtomic(target, "{}\n", "json");
    expect(readFileSync(target, "utf8")).toBe("{}\n");
    expect(readFileSync(taken, "utf8")).toBe("someone else's\n");
    expect(random.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(temporaries(d)).toEqual([path.basename(taken)]);
  });

  it("when every name tried exists, the write fails (EEXIST), nothing is replaced and the existing files are left", () => {
    const d = dir();
    const target = path.join(d, "findings.json");
    writeFileSync(target, "before\n");
    const same = Buffer.from("bbbbbbbbbbbbbbbb", "hex");
    const taken = path.join(d, `.findings.json.tmp-${same.toString("hex")}`);
    writeFileSync(taken, "someone else's\n");
    random.mockImplementation(() => same);
    let error: unknown = null;
    try {
      writeAtomic(target, "after\n", "json");
    } catch (err) {
      error = err;
    }
    expect((error as NodeJS.ErrnoException | null)?.code).toBe("EEXIST");
    expect(readFileSync(target, "utf8")).toBe("before\n");
    expect(readFileSync(taken, "utf8")).toBe("someone else's\n");
    expect(temporaries(d)).toEqual([path.basename(taken)]);
  });

  it("a failed rename removes the temporary file this call created and only that one", () => {
    const d = dir();
    const target = path.join(d, "out.json");
    mkdirSync(path.join(target, "inside"), { recursive: true }); // a non-empty directory: the rename fails
    const unrelated = path.join(d, ".other.json.tmp-0123456789abcdef");
    writeFileSync(unrelated, "keep\n");
    expect(() => writeAtomic(target, "{}\n", "json")).toThrow();
    expect(temporaries(d)).toEqual([path.basename(unrelated)]);
    expect(existsSync(path.join(target, "inside"))).toBe(true);
  });
});

describe("M2-2-RI-R1-002: the second open does not create and does not follow a symbolic link (B-2)", () => {
  it("review-import: the name replaced by a symbolic link before the second open is ELOOP: exit 2, nothing written, the file outside unchanged", async () => {
    const root = dir();
    mkdirSync(path.join(root, "docs", "reviews"), { recursive: true });
    const outside = path.join(dir(), "outside.txt");
    writeFileSync(outside, "outside: keep\n");
    const seen = beforeTheWrite((tmp) => {
      rmSync(tmp, { force: true });
      symlinkSync(outside, tmp);
    });
    const err: string[] = [];
    const code = await runReviewImport({ review: FIXTURE, label: "backlog-21", round: 1, idPrefix: "B21", cwd: root, toolVersion: "9.9.9", log: () => undefined, logError: (l) => err.push(l) });
    expect(seen).toHaveLength(1);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("[write] docs/reviews/backlog-21/findings-r1.json could not be written (ELOOP)");
    expect(err.at(-1)).toBe("REVIEW IMPORT: not written (error)");
    expect(readFileSync(outside, "utf8")).toBe("outside: keep\n");
    expect(readdirSync(path.join(root, "docs", "reviews"))).toEqual([]);
  });

  it("writeAtomic: the same replacement is ELOOP; the file outside and the target are unchanged, and the name it created is removed", () => {
    const d = dir();
    const target = path.join(d, "findings.json");
    writeFileSync(target, "before\n");
    const outside = path.join(dir(), "outside.txt");
    writeFileSync(outside, "outside: keep\n");
    const seen = beforeTheWrite((tmp) => {
      rmSync(tmp, { force: true });
      symlinkSync(outside, tmp);
    });
    expect(() => writeAtomic(target, "after\n", "json")).toThrow(expect.objectContaining({ code: "ELOOP" }));
    expect(seen).toHaveLength(1);
    expect(readFileSync(outside, "utf8")).toBe("outside: keep\n");
    expect(readFileSync(target, "utf8")).toBe("before\n");
    expect(temporaries(d)).toEqual([]);
  });

  it("writeAtomic: the name removed before the second open is ENOENT; nothing is created there and the target is unchanged", () => {
    const d = dir();
    const target = path.join(d, "findings.json");
    writeFileSync(target, "before\n");
    const seen = beforeTheWrite((tmp) => rmSync(tmp, { force: true }));
    expect(() => writeAtomic(target, "after\n", "json")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(seen).toHaveLength(1);
    expect(readFileSync(target, "utf8")).toBe("before\n");
    expect(temporaries(d)).toEqual([]);
  });
});
