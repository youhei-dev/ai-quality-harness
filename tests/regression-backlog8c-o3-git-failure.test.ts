/**
 * Backlog 8 (C group), O3 (docs/reviews/m2-2/response-r1.md) and the failure wording left by P3 (v0.5.30): git that fails was described as
 * "not a git repository" (verify's `git:` line and the Markdown report; src/git/info.ts answered null for every failure, the report's
 * `git` is null for both) and, in review-packet, as "does not name a commit" / "not inside a git work tree" whatever git exited with.
 * Now: verify says "git: unavailable (<why>)" when git could not be run, timed out, or exited with something other than its own "not a git
 * repository" (the report's `git` stays null: its contract is unchanged); review-packet keeps the plain messages for git's own "no"
 * (`rev-parse --verify --quiet` exits 1; "fatal: not a git repository") and adds git's words for any other failure. git is wrapped by a shell
 * script put first on PATH (builtins only) because those failures are not reachable with real input. The cases that are not about O3 are
 * controls: they pass before and after.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { getGitInfo, lookupGit } from "../src/git/info.ts";
import { buildReport } from "../src/report/build-report.ts";
import { renderMarkdown } from "../src/report/markdown.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { ResolvedConfig } from "../src/types.ts";
import { checkResult, fake, makeTempDir } from "./helpers.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(REPO_ROOT, "src", "cli.ts");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** The first executable named `git` on the current PATH (an absolute path; the shim calls it). */
function realGit(): string {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "git");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // next directory
    }
  }
  throw new Error("git is not on PATH");
}

/** A directory with a `git` script that runs `cases` (the body of a `case " $* " in … esac`) and otherwise the real git. Returns the PATH to use. */
function shimPath(cases: string): string {
  const t = makeTempDir("aiqh-b8c-o3-shim-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "git"), `#!/bin/sh\nREAL="$AIQH_REAL_GIT"\ncase " $* " in\n${cases}\nesac\nexec "$REAL" "$@"\n`);
  chmodSync(path.join(t.dir, "git"), 0o755);
  return `${t.dir}${path.delimiter}${process.env.PATH ?? ""}`;
}

/** An empty directory as the whole PATH: git cannot be run. */
function emptyPath(): string {
  const t = makeTempDir("aiqh-b8c-o3-nogit-");
  cleanups.push(t.cleanup);
  return t.dir;
}

/** Run `fn` with the environment changed, and restore it afterwards. */
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  const all = { AIQH_REAL_GIT: realGit(), ...vars };
  for (const k of Object.keys(all)) saved[k] = process.env[k];
  Object.assign(process.env, all);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** A repository with `commits` commits (a.ts) in a temporary directory outside any other repository. */
function repo(commits = 2): { dir: string } {
  const t = makeTempDir("aiqh-b8c-o3-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  for (let n = 1; n <= commits; n++) {
    writeFileSync(path.join(t.dir, "a.ts"), `export const a = ${n};\n`);
    git("add", "--", "a.ts");
    git("commit", "-q", "-m", `c${n}`);
  }
  return { dir: t.dir };
}

const INSIDE = '*" rev-parse --is-inside-work-tree "*) echo "fatal: detected dubious ownership in repository" >&2; exit 128;;';
const RESOLVE_128 = '*" rev-parse --verify --quiet --end-of-options "*) echo "fatal: unable to read tree" >&2; exit 128;;';
const RESOLVE_1 = '*" rev-parse --verify --quiet --end-of-options "*) exit 1;;';

describe("backlog 8 O3: lookupGit tells git that failed from git that said 'no'", () => {
  it("git cannot be run (not on PATH): no info, and the problem says it could not be run (before: indistinguishable from a non-repository)", async () => {
    const r = repo();
    const res = await withEnv({ PATH: emptyPath() }, () => lookupGit(r.dir));
    expect(res.info).toBeNull();
    expect(res.problem).toMatch(/^git could not be run \(ENOENT\)$/);
  });

  it("git exits 128 with something other than 'not a git repository' (a refusal): the problem carries git's own line", async () => {
    const r = repo();
    const res = await withEnv({ PATH: shimPath(INSIDE) }, () => lookupGit(r.dir));
    expect(res.info).toBeNull();
    expect(res.problem).toBe("git exited 128: fatal: detected dubious ownership in repository");
  });

  it("git exits with another status and no message: the problem names the status", async () => {
    const r = repo();
    const res = await withEnv({ PATH: shimPath('*" rev-parse --is-inside-work-tree "*) exit 3;;') }, () => lookupGit(r.dir));
    expect(res.info).toBeNull();
    expect(res.problem).toBe("git exited 3");
  });

  it("a repository and a non-repository have no problem (git answered); only a failure has one", async () => {
    const r = repo();
    expect(lookupGit(r.dir)).toMatchObject({ problem: null, info: { branch: "main" } });
    const t = makeTempDir("aiqh-b8c-o3-plain2-");
    cleanups.push(t.cleanup);
    expect(lookupGit(t.dir)).toEqual({ info: null, problem: null });
    expect((await withEnv({ PATH: shimPath('*" status --porcelain "*) exit 128;;') }, () => lookupGit(r.dir))).problem).toBeNull();
  });

  it("getGitInfo keeps its contract: null for every one of those", async () => {
    const r = repo();
    expect(await withEnv({ PATH: emptyPath() }, () => getGitInfo(r.dir))).toBeNull();
    expect(await withEnv({ PATH: shimPath(INSIDE) }, () => getGitInfo(r.dir))).toBeNull();
  });
});

describe("backlog 8 O3 controls: getGitInfo (pass before and after)", () => {
  it("a repository: branch, commit and a clean tree", () => {
    const r = repo();
    const info = getGitInfo(r.dir);
    expect(info?.branch).toBe("main");
    expect(info?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(info?.dirty).toBe(false);
  });

  it("a directory that is not a repository: null (git answered 'no')", () => {
    const t = makeTempDir("aiqh-b8c-o3-plain-");
    cleanups.push(t.cleanup);
    expect(getGitInfo(t.dir)).toBeNull();
  });

  it("a failing `git status` is 'unknown', not 'clean' (R-009)", async () => {
    const r = repo();
    const info = await withEnv({ PATH: shimPath('*" status --porcelain "*) exit 128;;') }, () => getGitInfo(r.dir));
    expect(info?.dirty).toBeNull();
  });
});

describe("backlog 8 O3: the verify command says what happened (real CLI)", () => {
  function verify(dir: string, pathValue: string): { code: number | null; out: string; reportGit: unknown } {
    const cfg = path.join(dir, "aiqh.config.jsonc");
    writeFileSync(cfg, JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "ok", kind: "lint", command: `'${process.execPath}' -e 'process.exit(0)'` }] }));
    const r = spawnSync(process.execPath, [CLI, "verify", "--config", cfg], { cwd: dir, env: { ...process.env, PATH: pathValue }, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    const reportFile = path.join(dir, "artifacts", "verification", "latest.json");
    const reportGit = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, "utf8")) as { git: unknown }).git : "(no report)";
    return { code: r.status, out: r.stdout, reportGit };
  }

  it("a repository, but git cannot be run: 'git: unavailable (…)', verdict unchanged (exit 0), the report's git is null (before: 'git: not a git repository')", () => {
    const r = repo();
    const res = verify(r.dir, emptyPath());
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^git: unavailable \(git could not be run \(ENOENT\)\)$/m);
    expect(res.out).not.toMatch(/^git: not a git repository$/m);
    expect(res.reportGit).toBeNull();
  });

  it("a refusal by git is shown with git's own line", () => {
    const r = repo();
    const res = verify(r.dir, shimPath(INSIDE));
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^git: unavailable \(git exited 128: fatal: detected dubious ownership in repository\)$/m);
    expect(res.reportGit).toBeNull();
  });

  it("control: a directory that is not a repository still says 'not a git repository'", () => {
    const t = makeTempDir("aiqh-b8c-o3-plainverify-");
    cleanups.push(t.cleanup);
    const res = verify(t.dir, process.env.PATH ?? "");
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^git: not a git repository$/m);
    expect(res.reportGit).toBeNull();
  });

  it("control: a repository shows branch and commit", () => {
    const r = repo();
    const res = verify(r.dir, process.env.PATH ?? "");
    expect(res.out).toMatch(/^git: main @ [0-9a-f]{12}/m);
    expect((res.reportGit as { branch: string }).branch).toBe("main");
  });
});

describe("backlog 8 O3: git's own line goes through the output boundary", () => {
  it("a secret-shaped string and an ESC in git's message: masked on verify's stdout, ESC written as notation", () => {
    const r = repo();
    const esc = String.fromCodePoint(0x1b);
    const akia = fake("AKIA", "ABCDEFGHIJKLMNOP");
    // the shim prints the message through printf with octal escapes, so that no raw ESC is typed in the script
    const cases = `*" rev-parse --is-inside-work-tree "*) printf 'fatal: %s \\033[31m refused\\n' '${akia}' >&2; exit 128;;`;
    const cfg = path.join(r.dir, "aiqh.config.jsonc");
    writeFileSync(cfg, JSON.stringify({ version: 1, project: { name: "p" }, checks: [{ name: "ok", kind: "lint", command: `'${process.execPath}' -e 'process.exit(0)'` }] }));
    const res = spawnSync(process.execPath, [CLI, "verify", "--config", cfg], { cwd: r.dir, env: { ...process.env, PATH: shimPath(cases), AIQH_REAL_GIT: realGit() }, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^git: unavailable \(git exited 128: fatal: /m);
    expect(res.stdout).not.toContain(akia);
    expect(res.stdout).not.toContain(esc);
  });
});

describe("backlog 8 O3: the Markdown report does not say more than it knows", () => {
  const config: ResolvedConfig = {
    projectRoot: "/p",
    configPath: "/p/aiqh.config.jsonc",
    project: { name: "p" },
    outputDir: "/p/artifacts/verification",
    security: DEFAULT_SECURITY,
    checks: [],
  };

  it("git null: the cell names the non-repository and the failed git (before: only 'not a git repository / no commit')", () => {
    const report = buildReport({ config, results: [checkResult()], git: null, startedAt: new Date(), finishedAt: new Date(), toolVersion: "0.0.0", runId: "00000000-0000-4000-8000-000000000000" });
    const md = renderMarkdown(report);
    expect(md).toContain("not a git repository");
    expect(md).toContain("git unavailable");
  });
});

describe("backlog 8 O3: review-packet keeps git's own words when git fails", () => {
  async function packet(dir: string, range: string, pathValue: string): Promise<{ code: number; err: string; written: boolean }> {
    const out = path.join(dir, "out");
    mkdirSync(out, { recursive: true });
    const file = path.join(out, "packet.md");
    const err: string[] = [];
    const code = await withEnv({ PATH: pathValue }, () => runReviewPacket({ cwd: dir, range, toolVersion: "t", output: file, log: () => {}, logError: (l) => err.push(l) }));
    return { code, err: err.join("\n"), written: existsSync(file) };
  }

  it("resolving a revision: git exits 128 (a fatal, not 'no such revision'): exit 2, git's line in the message (before: 'does not name a commit')", async () => {
    const r = repo();
    const res = await packet(r.dir, "HEAD~1..HEAD", shimPath(RESOLVE_128));
    expect(res.code, res.err).toBe(2);
    expect(res.written).toBe(false);
    expect(res.err).toMatch(/--range: from revision "HEAD~1" could not be resolved \(git exit 128: fatal: unable to read tree\)/);
    expect(res.err).not.toMatch(/does not name a commit/);
  });

  it("the work-tree question: git refuses (dubious ownership): the message does not claim 'not inside a git work tree' (before: it did)", async () => {
    const r = repo();
    const res = await packet(r.dir, "HEAD~1..HEAD", shimPath(INSIDE));
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/could not tell whether .* is inside a git work tree \(git exit 128: fatal: detected dubious ownership in repository\)/);
    expect(res.err).not.toMatch(/not inside a git work tree/);
  });
});

describe("backlog 8 O3: git's own line in a review-packet message goes through the output boundary", () => {
  it("a secret-shaped string and an ESC in git's message: masked, and the ESC is written as notation", async () => {
    const r = repo();
    const esc = String.fromCodePoint(0x1b);
    const akia = fake("AKIA", "ABCDEFGHIJKLMNOP");
    const cases = `*" rev-parse --verify --quiet --end-of-options "*) printf 'fatal: %s \\033[31m refused\\n' '${akia}' >&2; exit 128;;`;
    const out = path.join(r.dir, "out");
    mkdirSync(out);
    const err: string[] = [];
    const code = await withEnv({ PATH: shimPath(cases) }, () => runReviewPacket({ cwd: r.dir, range: "HEAD~1..HEAD", toolVersion: "t", output: path.join(out, "packet.md"), log: () => {}, logError: (l) => err.push(l) }));
    expect(code).toBe(2);
    const text = err.join("\n");
    expect(text).toMatch(/could not be resolved \(git exit 128: fatal: /);
    expect(text).not.toContain(akia);
    expect(text).not.toContain(esc);
  });
});

describe("backlog 8 O3 controls: review-packet (pass before and after)", () => {
  async function packet(dir: string, range: string, pathValue: string): Promise<{ code: number; err: string }> {
    const err: string[] = [];
    const code = await withEnv({ PATH: pathValue }, () => runReviewPacket({ cwd: dir, range, toolVersion: "t", output: path.join(dir, "packet.md"), log: () => {}, logError: (l) => err.push(l) }));
    return { code, err: err.join("\n") };
  }

  it("a revision that does not exist (git exits 1, silently): the plain message", async () => {
    const r = repo();
    const res = await packet(r.dir, "no-such-ref..HEAD", process.env.PATH ?? "");
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/--range: from revision "no-such-ref" does not name a commit/);
  });

  it("git exits 1 for the resolving call (the status of 'not a valid name'): the plain message", async () => {
    const r = repo();
    const res = await packet(r.dir, "HEAD~1..HEAD", shimPath(RESOLVE_1));
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/--range: from revision "HEAD~1" does not name a commit/);
  });

  it("a directory that is not a git work tree: the plain message, byte for byte", async () => {
    const t = makeTempDir("aiqh-b8c-o3-plainpacket-");
    cleanups.push(t.cleanup);
    const res = await packet(t.dir, "HEAD~1..HEAD", process.env.PATH ?? "");
    expect(res.code).toBe(2);
    expect(res.err).toContain(`aiqh review-packet: not inside a git work tree: ${t.dir}`);
    expect(res.err).not.toMatch(/could not tell whether/);
  });

  it("git cannot be run: the message that already named it (unchanged)", async () => {
    const r = repo();
    const res = await packet(r.dir, "HEAD~1..HEAD", emptyPath());
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/git could not be run: /);
  });
});
