/**
 * M2-1 (v0.4.0): `aiqh review-packet` in-process (runReviewPacket / buildPacket) on throwaway git
 * repositories: structure, file kinds, awkward paths, range validation, fail-closed findings (nothing
 * written, existing files kept, values never printed), security.allow, the verify section, ZIP and
 * reproducibility. Secret-shaped values are assembled at run time and forbidden characters are built
 * from code points, so this file contains neither.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket, type ReviewPacketOptions } from "../src/commands/review-packet.ts";
import { LOCK_FILE_NAMES, renderPath } from "../src/review/packet.ts";
import { checked, fake, makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  const errors: unknown[] = [];
  while (cleanups.length > 0) {
    try {
      cleanups.pop()?.();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) throw errors[0];
});

const ch = (cp: number): string => String.fromCodePoint(cp);
const SECRET = (): string => fake("AKIA", "QWERTYUIOPASDFGH");
const TODAY = "2026-09-23";

interface Repo {
  dir: string;
  git: (...args: string[]) => string;
  write: (rel: string, content: string | Buffer) => void;
  commit: (message: string, paths: string[]) => string;
}

let clock = 1_790_000_000;
function makeRepo(): Repo {
  const t = makeTempDir("aiqh-rp-");
  cleanups.push(t.cleanup);
  const dir = t.dir;
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` },
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "-q");
  const write = (rel: string, content: string | Buffer): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  };
  const commit = (message: string, paths: string[]): string => {
    clock += 60;
    if (paths.length > 0) git("add", "--", ...paths);
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  return { dir, git, write, commit };
}

/** Base commit plus one change commit; returns the two SHAs. */
function baseRepo(): Repo & { base: string } {
  const r = makeRepo();
  r.write("README.md", "# demo\n");
  r.write("src/keep.ts", "export const keep = 1;\n");
  r.write("src/gone.ts", "export const gone = 1;\n");
  r.write("src/old-name.ts", "export const moved = 1;\nexport const two = 2;\nexport const three = 3;\n");
  const base = r.commit("base", ["README.md", "src/keep.ts", "src/gone.ts", "src/old-name.ts"]);
  return { ...r, base };
}

async function run(opts: Partial<ReviewPacketOptions> & { cwd: string; range: string }): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runReviewPacket({ toolVersion: "0.0.0-test", today: TODAY, ...opts, log: (l) => out.push(l), logError: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function outPath(dir: string, label: string): string {
  return path.join(dir, "artifacts", "ai-review", `review-packet-${label}.md`);
}

/** Top-level "# " headings outside fenced blocks, in order. */
function sections(md: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = /^(`{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1] ?? null;
      else if (line.trim() === fence) fence = null;
      continue;
    }
    if (fence === null && line.startsWith("# ")) out.push(line);
  }
  return out;
}

describe("review-packet: content", () => {
  it("writes the sections in order with metadata, trailer-free messages, request, review and documents", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 2;\n");
    r.write("docs/adr.md", "# ADR\n\ndecision\n");
    r.commit("change keep\n\nbody line\n\nCo-Authored-By: Someone <x@example.invalid>\nClaude-Session: https://example.invalid/s", ["src/keep.ts", "docs/adr.md"]);
    r.write("../request.md", "Please review the keep change.\n");
    r.write("../review-r1.md", "Earlier finding: none.\n");
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "t1", request: "../request.md", review: ["../review-r1.md"], doc: ["docs/adr.md"] });
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain("REVIEW PACKET: written");
    const md = readFileSync(outPath(r.dir, "t1"), "utf8");
    expect(sections(md)).toEqual([
      "# Review Packet — t1",
      "# Request",
      "# Previous Reviews",
      "# Commits",
      "# Changed Files",
      "# Diff",
      "# Full Source of Changed Files",
      "# Documents",
      "# Verification",
      "# Integrity",
    ]);
    expect(md).toContain("Please review the keep change.");
    expect(md).toContain("Earlier finding: none.");
    expect(md).toContain("body line");
    expect(md).not.toContain("Co-Authored-By: Someone");
    expect(md).not.toContain("Claude-Session: https://example.invalid/s");
    expect(md).not.toContain("x@example.invalid");
    expect(md).not.toContain("test@example.invalid");
    expect(md).toContain("may contain its\nexplanations");
    expect(md).toContain("## `docs/adr.md` (at `");
    expect(md).toContain("No verify result: `artifacts/verification/latest.json` does not exist.");
    expect(md).toMatch(/Committer time of <to>: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  });

  it("classifies added, modified, deleted, renamed, binary, lock, excluded and submodule entries", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 3;\n");
    r.git("rm", "-q", "--", "src/gone.ts");
    r.git("mv", "src/old-name.ts", "src/new-name.ts");
    r.write("src/added.ts", "export const added = true;\n");
    r.write("assets/logo.bin", Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));
    r.write("package-lock.json", '{"lockfileVersion": 3}\n');
    r.write("go.sum", "example.invalid/mod v1.0.0 h1:abc=\n");
    r.write("vendor/big.txt", "vendored\n");
    r.git("update-index", "--add", "--cacheinfo", `160000,${r.base},sub`);
    r.commit("many kinds", ["src/keep.ts", "src/added.ts", "assets/logo.bin", "package-lock.json", "go.sum", "vendor/big.txt"]);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "kinds", exclude: ["vendor/**"] });
    expect(res.code, res.err).toBe(0);
    const md = readFileSync(outPath(r.dir, "kinds"), "utf8");
    const row = (p: string): string => md.split("\n").find((l) => l.startsWith("| ") && l.includes(`| \`${p}\` |`)) ?? "";
    expect(row("src/added.ts")).toMatch(/\| A \|.*\| text \|/);
    expect(row("src/keep.ts")).toMatch(/\| M \|.*\| text \|/);
    expect(row("src/gone.ts")).toMatch(/\| D \|.*\| deleted \|/);
    expect(row("src/new-name.ts")).toMatch(/\| R\d+ \| `src\/new-name.ts` \| `src\/old-name.ts` \| text \|/);
    expect(row("assets/logo.bin")).toContain("| binary |");
    expect(row("package-lock.json")).toContain("| lock |");
    expect(row("go.sum")).toContain("| lock |");
    expect(row("vendor/big.txt")).toContain("excluded (`vendor/**`)");
    expect(row("sub")).toContain("| submodule |");
    const full = md.slice(md.indexOf("# Full Source of Changed Files"), md.indexOf("# Documents"));
    expect(full).toContain("## `src/added.ts` (1 lines)");
    expect(full).toContain("## `src/new-name.ts` (3 lines)");
    for (const p of ["src/gone.ts", "assets/logo.bin", "package-lock.json", "go.sum", "vendor/big.txt"]) expect(full).not.toContain(`## \`${p}\``);
    expect(md).not.toContain("lockfileVersion");
    expect(md).not.toContain("vendored");
    const diff = md.slice(md.indexOf("# Diff"), md.indexOf("# Full Source"));
    expect(diff).toContain("-export const gone = 1;");
    expect(diff).toContain("Not shown (binary).");
    expect(diff).toContain("Not shown (lock).");
    expect(diff).toContain("Not shown (excluded).");
    expect(diff).toContain("rename from src/old-name.ts");
    // Integrity lists the SHA-256 of the lock file blob
    const lockRow = md.split("\n").find((l) => l.startsWith("| `package-lock.json` |")) ?? "";
    expect(lockRow).toMatch(/\| [0-9a-f]{64} \|$/);
    expect(LOCK_FILE_NAMES).toHaveLength(12);
    // rows are sorted by the UTF-8 bytes of the path
    const table = md.slice(md.indexOf("# Changed Files"), md.indexOf("# Diff"));
    const paths = [...table.matchAll(/^\| \d+ \| [A-Z]\d* \| `([^`]+)` \|/gm)].map((m) => m[1] ?? "");
    expect(paths.length).toBe(9);
    expect([...paths].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)))).toEqual(paths);
  });

  it("keeps paths with a newline, spaces and non-ASCII characters intact (read with -z, blobs by id)", async () => {
    const r = baseRepo();
    const nl = `odd\nname.txt`;
    const jp = `docs/${ch(0x65e5)}${ch(0x672c)} file.md`;
    r.write(nl, "newline path content\n");
    r.write(jp, "japanese path content\n");
    r.write("with space/a b.ts", "export const s = 1;\n");
    r.commit("awkward paths", [nl, jp, "with space/a b.ts"]);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "paths" });
    expect(res.code, res.err).toBe(0);
    const md = readFileSync(outPath(r.dir, "paths"), "utf8");
    expect(md).toContain(`## ${renderPath(checked(nl))} (1 lines)\n\n\`\`\`text\nnewline path content\n\`\`\``);
    expect(renderPath(checked(nl))).toBe("`odd\\nname.txt`");
    expect(md).toContain(`## \`${jp}\` (1 lines)\n\n\`\`\`markdown\njapanese path content\n\`\`\``);
    expect(md).toContain("## `with space/a b.ts` (1 lines)");
  });

  it("uses a fence longer than any backtick run in the content", async () => {
    const r = baseRepo();
    r.write("docs/fences.md", "text\n````\ninner\n````\n");
    r.commit("fences", ["docs/fences.md"]);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "fence" });
    expect(res.code, res.err).toBe(0);
    expect(readFileSync(outPath(r.dir, "fence"), "utf8")).toContain("`````markdown\ntext\n````\ninner\n````\n`````");
  });
});

describe("review-packet: range and usage errors (exit 2, nothing written)", () => {
  it("rejects a non-ancestor range, unknown or option-like refs, an empty range and malformed ranges", async () => {
    const r = baseRepo();
    const head = r.commit("second", []);
    const cases = [`${head}..${r.base}`, `${r.base}..nope`, `--output=x..HEAD`, `${head}..${head}`, `${r.base}...HEAD`, "HEAD", `..HEAD`];
    for (const range of cases) {
      const res = await run({ cwd: r.dir, range, label: "bad" });
      expect(res.code, range).toBe(2);
      expect(res.err).toContain("REVIEW PACKET: not written (error)");
    }
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
    expect(existsSync(path.join(r.dir, "x"))).toBe(false);
  });

  it("rejects labels outside [a-z0-9.-] and non-ASCII output names", async () => {
    const r = baseRepo();
    r.commit("second", []);
    for (const label of ["Upper", "a/b", "a b", `${ch(0x65e5)}`, "a_b", ""]) {
      expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label })).code, label).toBe(2);
    }
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, output: `out/${ch(0x65e5)}.md` })).code).toBe(2);
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
  });

  it("a changed file above --max-file-bytes is an error unless excluded, and --exclude records it", async () => {
    const r = baseRepo();
    r.write("data/big.txt", "x".repeat(2000) + "\n");
    r.commit("big", ["data/big.txt"]);
    const tooBig = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "big", maxFileBytes: 1000 });
    expect(tooBig.code).toBe(2);
    expect(tooBig.err).toContain("data/big.txt (2001 bytes)");
    expect(existsSync(outPath(r.dir, "big"))).toBe(false);
    const excluded = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "big", maxFileBytes: 1000, exclude: ["data/*"] });
    expect(excluded.code, excluded.err).toBe(0);
    expect(readFileSync(outPath(r.dir, "big"), "utf8")).toContain("excluded (`data/*`)");
  });

  it("a packet above --max-packet-bytes is an error and nothing is written", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 9;\n");
    r.commit("small", ["src/keep.ts"]);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "cap", maxPacketBytes: 500 });
    expect(res.code).toBe(2);
    expect(res.err).toContain("more than --max-packet-bytes (500)");
    expect(existsSync(outPath(r.dir, "cap"))).toBe(false);
  });

  it("outside a git repository → exit 2", async () => {
    const t = makeTempDir("aiqh-rp-nogit-");
    cleanups.push(t.cleanup);
    expect((await run({ cwd: t.dir, range: "a..b" })).code).toBe(2);
  });
});

describe("review-packet: fail closed (exit 1, nothing written, values never printed)", () => {
  interface Case {
    name: string;
    setup: (r: Repo & { base: string }) => Partial<ReviewPacketOptions>;
    expect: RegExp;
  }
  const secretFile = (r: Repo & { base: string }): Partial<ReviewPacketOptions> => {
    r.write("src/config.ts", `export const key = "${SECRET()}";\n`);
    r.commit("add config", ["src/config.ts"]);
    return {};
  };
  const cases: Case[] = [
    { name: "secret-shaped string in a changed file", setup: secretFile, expect: /\[secret\] full source src\/config\.ts:1 aws/ },
    {
      name: "secret-shaped string in a commit message",
      setup: (r) => {
        r.commit(`note ${SECRET()}`, []);
        return {};
      },
      expect: /\[secret\] commit [0-9a-f]{12} message:1 aws/,
    },
    {
      name: "secret-shaped string in the request",
      setup: (r) => {
        r.commit("x", []);
        r.write("../req.md", `use ${SECRET()}\n`);
        return { request: "../req.md" };
      },
      expect: /\[secret\] request:1 aws/,
    },
    {
      name: "U+2028 in a changed file",
      setup: (r) => {
        r.write("docs/sep.md", `a${ch(0x2028)}b\n`);
        r.commit("sep", ["docs/sep.md"]);
        return {};
      },
      expect: /\[raw-char\] full source docs\/sep\.md:1 U\+2028/,
    },
    {
      name: "U+2029 in a commit message",
      setup: (r) => {
        r.commit(`subject${ch(0x2029)}more`, []);
        return {};
      },
      expect: /\[raw-char\] commit [0-9a-f]{12} message:1 U\+2029/,
    },
    {
      name: "BOM at the start of a changed file",
      setup: (r) => {
        r.write("docs/bom.md", `${ch(0xfeff)}title\n`);
        r.commit("bom", ["docs/bom.md"]);
        return {};
      },
      expect: /\[raw-char\] full source docs\/bom\.md:1 U\+FEFF/,
    },
    {
      name: "CR (CRLF line ends) in a changed file",
      setup: (r) => {
        r.write("docs/crlf.txt", "one\r\ntwo\r\n");
        r.commit("crlf", ["docs/crlf.txt"]);
        return {};
      },
      expect: /\[raw-char\] full source docs\/crlf\.txt:1 U\+000D/,
    },
    {
      name: "bidi control in a --doc",
      setup: (r) => {
        r.write("docs/bidi.md", `x${ch(0x202e)}y\n`);
        r.commit("bidi", ["docs/bidi.md"]);
        return { doc: ["docs/bidi.md"] };
      },
      expect: /\[raw-char\] doc docs\/bidi\.md:1 U\+202E/,
    },
    {
      name: "invalid UTF-8 (no NUL) in a changed file",
      setup: (r) => {
        r.write("docs/latin1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
        r.commit("latin1", ["docs/latin1.txt"]);
        return {};
      },
      expect: /\[invalid-utf8\] full source docs\/latin1\.txt:1/,
    },
    {
      name: "invalid UTF-8 in the request",
      setup: (r) => {
        r.commit("x", []);
        r.write("../bad-req.md", Buffer.from([0x6f, 0x6b, 0x0a, 0xff, 0x0a]));
        return { request: "../bad-req.md" };
      },
      expect: /\[invalid-utf8\] request:2/,
    },
    {
      name: "NUL (C0) in a previous review",
      setup: (r) => {
        r.commit("x", []);
        r.write("../rev.md", `ok${ch(0)}\n`);
        return { review: ["../rev.md"] };
      },
      expect: /\[raw-char\] review rev\.md:1 U\+0000/,
    },
    {
      name: "raw character in a check name of latest.json for <to>",
      setup: (r) => {
        const head = r.commit("x", []);
        r.write(
          "artifacts/verification/latest.json",
          JSON.stringify({ git: { commit: head, branch: "main", dirty: false }, verdict: "PASSED", exitCode: 0, tool: { name: "aiqh", version: "t" }, checks: [{ name: `unit${ch(0x85)}`, kind: "unit", required: true, status: "PASS", exitCode: 0, durationMs: 1 }] }),
        );
        return {};
      },
      expect: /\[raw-char\] verification \(artifacts\/verification\/latest\.json\):\d+ U\+0085/,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const r = baseRepo();
      const extra = c.setup(r);
      // an existing packet with the same name must survive the failed run
      mkdirSync(path.join(r.dir, "artifacts", "ai-review"), { recursive: true });
      writeFileSync(outPath(r.dir, "fc"), "previous packet\n");
      const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "fc", zip: true, ...extra });
      expect(res.code, res.err).toBe(1);
      expect(res.err).toMatch(c.expect);
      expect(res.err).toContain("REVIEW PACKET: not written (findings)");
      expect(readFileSync(outPath(r.dir, "fc"), "utf8")).toBe("previous packet\n");
      expect(existsSync(outPath(r.dir, "fc").replace(/\.md$/, ".zip"))).toBe(false);
      const printed = res.out + res.err;
      expect(printed).not.toContain(SECRET());
      expect(printed).not.toContain("QWERTYUIOPASDFGH");
    });
  }

  it("text that appears only in the packet's metadata (an --exclude glob) is checked before rendering", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 7;\n");
    r.commit("s2", ["src/keep.ts"]);
    const secretGlob = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "s2", exclude: [`none/${SECRET()}`] });
    expect(secretGlob.code).toBe(1);
    // v0.4.2 (M2-1-R2-006): option values are checked (raw characters and secret shapes) before rendering;
    // up to v0.4.1 a secret-shaped glob was found by the whole-packet check (stage "packet")
    expect(secretGlob.err).toMatch(/\[secret\] --exclude pattern 1:1 aws \(input\)/);
    expect(secretGlob.err).not.toContain("QWERTYUIOPASDFGH");
    const rawGlob = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "s2", exclude: [`none/${ch(0x2028)}`] });
    expect(rawGlob.code).toBe(1);
    // v0.4.1 (M2-1-R1-004): option values are rendered escaped, so a raw character in a glob is reported at the input stage
    expect(rawGlob.err).toMatch(/\[raw-char\] --exclude pattern 1:1 U\+2028 \(input\)/);
    expect(existsSync(outPath(r.dir, "s2"))).toBe(false);
  });

  it("--exclude lets a file with invalid UTF-8 through and records it as excluded", async () => {
    const r = baseRepo();
    r.write("docs/latin1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
    r.commit("latin1", ["docs/latin1.txt"]);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "ex", exclude: ["docs/latin1.txt"] });
    expect(res.code, res.err).toBe(0);
    expect(readFileSync(outPath(r.dir, "ex"), "utf8")).toContain("excluded (`docs/latin1.txt`)");
  });

  it("--json reports findings without values", async () => {
    const r = baseRepo();
    secretFile(r);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "js", json: true });
    expect(res.code).toBe(1);
    const parsed = JSON.parse(res.out) as { result: string; findings: Array<{ kind: string; source: string; line: number; detail: string }> };
    expect(parsed.result).toBe("findings");
    expect(parsed.findings.some((f) => f.kind === "secret" && f.source === "full source src/config.ts" && f.line === 1 && f.detail === "aws")).toBe(true);
    expect(res.out).not.toContain("QWERTYUIOPASDFGH");
  });
});

describe("review-packet: security.allow", () => {
  it("an allow rule for the path and line suppresses the full source and the diff line, and is listed", async () => {
    const r = baseRepo();
    r.write("fixtures/key.txt", `first line\n${SECRET()}\n`);
    r.commit("fixture", ["fixtures/key.txt"]);
    const cfg = path.join(path.dirname(r.dir), `${path.basename(r.dir)}-aiqh.config.jsonc`);
    writeFileSync(cfg, JSON.stringify({ version: 1, project: { name: "t" }, checks: [{ name: "x", kind: "custom", command: "true" }], security: { allow: [{ path: "fixtures/key.txt", line: 2, reason: "test fixture" }] } }));
    cleanups.push(() => rmSync(cfg, { force: true }));
    const denied = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "al" });
    expect(denied.code).toBe(1);
    const res = await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "al", configPath: cfg });
    expect(res.code, res.err).toBe(0);
    const md = readFileSync(outPath(r.dir, "al"), "utf8");
    expect(md).toContain("Suppressed by security.allow: 2.");
    expect(md).toContain("- `full source fixtures/key.txt` → `fixtures/key.txt`:2 `aws` by rule #1");
    expect(md).toContain("- `diff fixtures/key.txt` → `fixtures/key.txt`:2 `aws` by rule #1");
    const wrongLine = path.join(path.dirname(r.dir), `${path.basename(r.dir)}-aiqh2.config.jsonc`);
    writeFileSync(wrongLine, JSON.stringify({ version: 1, project: { name: "t" }, checks: [{ name: "x", kind: "custom", command: "true" }], security: { allow: [{ path: "fixtures/key.txt", line: 1, reason: "wrong line" }] } }));
    cleanups.push(() => rmSync(wrongLine, { force: true }));
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "al2", configPath: wrongLine })).code).toBe(1);
  });
});

describe("review-packet: verification, ZIP and reproducibility", () => {
  it("includes the verify result only when latest.json is for <to> on a clean tree", async () => {
    const r = baseRepo();
    const head = r.commit("x", []);
    const report = (commit: string, dirty: boolean): string =>
      JSON.stringify({ git: { commit, branch: "main", dirty }, verdict: "PASSED", exitCode: 0, tool: { name: "aiqh", version: "9.9.9" }, startedAt: "s", finishedAt: "f", checks: [{ name: "unit", kind: "unit", required: true, status: "PASS", exitCode: 0, durationMs: 12 }] });
    r.write("artifacts/verification/latest.json", report(head, false));
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "v1" })).code).toBe(0);
    const md = readFileSync(outPath(r.dir, "v1"), "utf8");
    expect(md).toContain("- Verdict: `PASSED`; exit code `0`; tool `aiqh 9.9.9`");
    expect(md).toContain("| `unit` | `unit` | `true` | `PASS` | `0` | `12` |");
    r.write("artifacts/verification/latest.json", report(head, true));
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "v2" })).code).toBe(0);
    expect(readFileSync(outPath(r.dir, "v2"), "utf8")).toContain("No verify result for <to>: latest.json is for commit");
    r.write("artifacts/verification/latest.json", report(r.base, false));
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "v3" })).code).toBe(0);
    expect(readFileSync(outPath(r.dir, "v3"), "utf8")).not.toContain("- Verdict:");
  });

  it("--zip writes a stored ZIP with the packet as its only entry; --zip-output chooses the path", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 4;\n");
    r.commit("z", ["src/keep.ts"]);
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "zp", zip: true })).code).toBe(0);
    const packet = readFileSync(outPath(r.dir, "zp"));
    const zip = readFileSync(outPath(r.dir, "zp").replace(/\.md$/, ".zip"));
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(1);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLen).toString()).toBe("review-packet-zp.md");
    expect(zip.subarray(30 + nameLen, 30 + nameLen + packet.length).equals(packet)).toBe(true);
    const other = path.join(r.dir, "out", "packet.zip");
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "zp", zipOutput: other })).code).toBe(0);
    expect(readFileSync(other).equals(zip)).toBe(true);
  });

  it("two runs give the same packet and ZIP bytes (no wall-clock time in the output)", async () => {
    const r = baseRepo();
    r.write("src/keep.ts", "export const keep = 5;\n");
    r.commit("again", ["src/keep.ts"]);
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "rep", zip: true })).code).toBe(0);
    const a = readFileSync(outPath(r.dir, "rep"));
    const az = readFileSync(outPath(r.dir, "rep").replace(/\.md$/, ".zip"));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await run({ cwd: r.dir, range: `${r.base}..HEAD`, label: "rep", zip: true })).code).toBe(0);
    expect(readFileSync(outPath(r.dir, "rep")).equals(a)).toBe(true);
    expect(readFileSync(outPath(r.dir, "rep").replace(/\.md$/, ".zip")).equals(az)).toBe(true);
  });
});
