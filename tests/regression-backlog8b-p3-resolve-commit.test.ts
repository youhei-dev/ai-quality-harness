/**
 * Backlog 8 (B group), P3 (docs/reviews/m2-2/response-r1.md): resolveCommit() asked git twice — `<ref>^{commit}` for the commit (its status
 * was checked) and then the ref itself for the tag object (its status was NOT checked). A second call that fails was taken as "no tag object"
 * and the packet was written without a word (exit 0); a ref that moved between the two calls gave a tag object that belongs to another
 * commit than the one shown. The ref is read once now, to an object name, and the commit is that object's; both statuses are checked.
 * git is wrapped by a shell script put first on PATH (builtins only) that fails or moves a tag at a chosen call, because the failure is
 * not reachable with real input. The cases that are not about P3 are controls: they pass before and after.
 */
import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReviewPacket } from "../src/commands/review-packet.ts";
import { makeTempDir } from "./helpers.ts";

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

// Counts the calls that resolve a revision (rev-parse --verify --quiet --end-of-options ...). AIQH_SHIM_FAIL_AT=N fails the Nth;
// AIQH_SHIM_MOVE_AFTER=N moves the tag to another commit after the Nth. Everything else goes to the real git unchanged.
const SHIM = `#!/bin/sh
REAL="$AIQH_REAL_GIT"
case " $* " in
  *" rev-parse --verify --quiet --end-of-options "*) ;;
  *) exec "$REAL" "$@" ;;
esac
n=0
[ -f "$AIQH_SHIM_COUNT" ] && read n < "$AIQH_SHIM_COUNT"
n=$((n+1))
echo "$n" > "$AIQH_SHIM_COUNT"
if [ "$AIQH_SHIM_FAIL_AT" = "$n" ]; then exit 1; fi
"$REAL" "$@"; rc=$?
if [ "$AIQH_SHIM_MOVE_AFTER" = "$n" ]; then
  (cd "$AIQH_SHIM_REPO" && "$REAL" -c user.name=T -c user.email=t@example.invalid -c tag.gpgsign=false tag -f -a "$AIQH_SHIM_TAG" -m moved "$AIQH_SHIM_TARGET" >/dev/null 2>&1)
fi
exit $rc
`;

interface Repo {
  dir: string;
  out: string;
  c1: string;
  c2: string;
  git: (...args: string[]) => string;
}

/** Three commits; the tag `v1` is on the first (annotated or not). */
function repo(annotated: boolean): Repo {
  const t = makeTempDir("aiqh-b8b-p3-");
  cleanups.push(t.cleanup);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd: t.dir, encoding: "utf8" });
  git("init", "-q");
  const shas: string[] = [];
  for (const n of [1, 2, 3]) {
    writeFileSync(path.join(t.dir, "a.ts"), `export const a = ${n};\n`);
    git("add", "--", "a.ts");
    git("commit", "-q", "-m", `c${n}`);
    shas.push(git("rev-parse", "HEAD").trim());
  }
  if (annotated) git("tag", "-a", "v1", "-m", "release one", shas[0] ?? "");
  else git("tag", "v1", shas[0] ?? "");
  const out = path.join(t.dir, "out");
  mkdirSync(out);
  return { dir: t.dir, out, c1: shas[0] ?? "", c2: shas[1] ?? "", git };
}

/** Run the packet for `range` with the shim on PATH (when `env` is given) and restore the environment afterwards. */
async function packet(r: Repo, range: string, env?: Record<string, string>): Promise<{ code: number; err: string; text: string | null }> {
  const saved: Record<string, string | undefined> = {};
  const vars: Record<string, string> = {};
  if (env !== undefined) {
    const shim = makeTempDir("aiqh-b8b-p3-shim-");
    cleanups.push(shim.cleanup);
    const shimDir = shim.dir;
    writeFileSync(path.join(shimDir, "git"), SHIM);
    chmodSync(path.join(shimDir, "git"), 0o755);
    Object.assign(vars, {
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}`,
      AIQH_REAL_GIT: realGit(),
      AIQH_SHIM_COUNT: path.join(shimDir, "count"),
      AIQH_SHIM_REPO: r.dir,
      AIQH_SHIM_TAG: "v1",
      AIQH_SHIM_TARGET: r.c2,
      ...env,
    });
  }
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  const err: string[] = [];
  const file = path.join(r.out, "packet.md");
  try {
    const code = await runReviewPacket({ cwd: r.dir, range, toolVersion: "t", output: file, log: () => {}, logError: (l) => err.push(l) });
    return { code, err: err.join("\n"), text: existsSync(file) ? readFileSync(file, "utf8") : null };
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const line = (text: string | null, prefix: string): string => text?.split("\n").find((l) => l.startsWith(prefix)) ?? "";
const tagObjectOf = (l: string): string | null => /tag object `([0-9a-f]{40})`/.exec(l)?.[1] ?? null;
const commitOf = (l: string): string | null => /commit `([0-9a-f]{40})`/.exec(l)?.[1] ?? null;

describe("backlog 8 P3: a revision is resolved once, and a git call that fails is an error", () => {
  it("the second git call of a revision fails (annotated tag): exit 2, no packet (before: exit 0, a packet without the tag object)", async () => {
    const r = repo(true);
    const res = await packet(r, "v1..HEAD", { AIQH_SHIM_FAIL_AT: "2" });
    expect(res.code, res.err).toBe(2);
    expect(res.text).toBeNull();
    expect(res.err).toMatch(/--range: from revision "v1" does not name a commit/);
  });

  it("the same with a lightweight tag (no tag object exists): the failing call is still an error, not 'no tag object'", async () => {
    const r = repo(false);
    const res = await packet(r, "v1..HEAD", { AIQH_SHIM_FAIL_AT: "2" });
    expect(res.code, res.err).toBe(2);
    expect(res.text).toBeNull();
  });

  it("the second git call of <to> fails: exit 2, no packet", async () => {
    const r = repo(true);
    const res = await packet(r, "v1..HEAD", { AIQH_SHIM_FAIL_AT: "4" });
    expect(res.code, res.err).toBe(2);
    expect(res.text).toBeNull();
    expect(res.err).toMatch(/--range: to revision "HEAD" does not name a commit/);
  });

  it("the tag moves to another commit between the git calls: the tag object shown is the one that belongs to the commit shown", async () => {
    const r = repo(true);
    const original = r.git("rev-parse", "v1").trim();
    const res = await packet(r, "v1..HEAD", { AIQH_SHIM_MOVE_AFTER: "1" });
    expect(res.code, res.err).toBe(0);
    const from = line(res.text, "- From: ");
    const shown = tagObjectOf(from);
    expect(shown, from).not.toBeNull();
    expect(commitOf(from)).toBe(r.c1);
    // the shown tag object peels to the shown commit (before: it was the moved tag, which peels to the other commit)
    expect(r.git("rev-parse", `${shown ?? ""}^{commit}`).trim()).toBe(r.c1);
    expect(shown).toBe(original);
    // and the tag really did move, so the test is not vacuous
    expect(r.git("rev-parse", "v1^{commit}").trim()).toBe(r.c2);
  });
});

describe("backlog 8 P3 controls (pass before and after)", () => {
  it("an annotated tag shows its tag object for <from>, and <to> = HEAD shows none", async () => {
    const r = repo(true);
    const res = await packet(r, "v1..HEAD");
    expect(res.code, res.err).toBe(0);
    expect(tagObjectOf(line(res.text, "- From: "))).toBe(r.git("rev-parse", "v1").trim());
    expect(tagObjectOf(line(res.text, "- To: "))).toBeNull();
  });

  it("a lightweight tag and a full SHA show no tag object", async () => {
    const r = repo(false);
    const a = await packet(r, "v1..HEAD");
    const b = await packet(r, `${r.c1}..HEAD`);
    expect(a.code, a.err).toBe(0);
    expect(b.code, b.err).toBe(0);
    expect(tagObjectOf(line(a.text, "- From: "))).toBeNull();
    expect(tagObjectOf(line(b.text, "- From: "))).toBeNull();
  });

  it("the first git call fails: exit 2 with the same message as for a revision that does not exist", async () => {
    const r = repo(true);
    const res = await packet(r, "v1..HEAD", { AIQH_SHIM_FAIL_AT: "1" });
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/--range: from revision "v1" does not name a commit/);
    const missing = await packet(r, "no-such-ref..HEAD");
    expect(missing.code).toBe(2);
    expect(missing.err).toMatch(/--range: from revision "no-such-ref" does not name a commit/);
  });

  it("a revision that is not a commit (a tree) is refused with the same message", async () => {
    const r = repo(true);
    const res = await packet(r, "HEAD^{tree}..HEAD");
    expect(res.code, res.err).toBe(2);
    expect(res.err).toMatch(/does not name a commit/);
  });
});
