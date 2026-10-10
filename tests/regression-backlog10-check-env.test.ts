/**
 * Backlog 10 (ADR-0020): the environment of a check. A check inherited the whole environment of aiqh. With FORCE_COLOR in it, eslint,
 * vitest, `npm run` and pytest colored their output into the pipe (131 ESC in one measured report); PY_COLORS=1 did the same for pytest
 * even with NO_COLOR; and NO_COLOR alone changed nothing (a pipe is not colored by default), did not stop eslint when FORCE_COLOR was
 * set, and made Node print a warning when both were set. A check now gets the environment of aiqh without FORCE_COLOR and PY_COLORS,
 * and with NO_COLOR=1; everything else is kept. CLICOLOR_FORCE and NPM_CONFIG_COLOR did not change any output when measured, so they
 * are not touched. This is the one place that builds a check's environment (backlog 6, a minimal environment, was closed in v0.5.37 for the test:minpath script only).
 * The new module is imported at run time inside each test so that this file also runs against v0.5.23, where the tests that expect it
 * fail on their own.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");

type CheckEnv = (parent?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
async function loadCheckEnv(): Promise<CheckEnv> {
  const spec = "../src/runner/env.ts";
  const m = (await import(/* @vite-ignore */ spec).catch(() => ({}))) as { checkEnv?: CheckEnv };
  if (m.checkEnv === undefined) throw new Error("checkEnv does not exist");
  return m.checkEnv;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("backlog 10: checkEnv", () => {
  it("drops FORCE_COLOR and PY_COLORS and sets NO_COLOR=1", async () => {
    const checkEnv = await loadCheckEnv();
    const env = checkEnv({ PATH: "/bin", FORCE_COLOR: "1", PY_COLORS: "1" });
    expect("FORCE_COLOR" in env).toBe(false);
    expect("PY_COLORS" in env).toBe(false);
    expect(env.NO_COLOR).toBe("1");
  });
  it("sets NO_COLOR=1 whatever the parent had (also an empty or a '0' value)", async () => {
    const checkEnv = await loadCheckEnv();
    for (const v of ["", "0", "1", "false"]) expect(checkEnv({ NO_COLOR: v }).NO_COLOR).toBe("1");
    expect(checkEnv({}).NO_COLOR).toBe("1");
  });
  it("keeps every other variable, the color ones that did not change any output included (CLICOLOR_FORCE, NPM_CONFIG_COLOR)", async () => {
    const checkEnv = await loadCheckEnv();
    const parent = { PATH: "/bin:/usr/bin", HOME: "/h", LANG: "C", CLICOLOR_FORCE: "1", NPM_CONFIG_COLOR: "always", TERM: "xterm", EMPTY: "" };
    const env = checkEnv({ ...parent, FORCE_COLOR: "1" });
    expect(env).toEqual({ ...parent, NO_COLOR: "1" });
  });
  it("does not change the environment it is given", async () => {
    const checkEnv = await loadCheckEnv();
    const parent: NodeJS.ProcessEnv = { FORCE_COLOR: "1", PY_COLORS: "1", PATH: "/bin" };
    const copy = { ...parent };
    checkEnv(parent);
    expect(parent).toEqual(copy);
  });
  it("without an argument it starts from the environment of this process, which it does not change either", async () => {
    const checkEnv = await loadCheckEnv();
    const before = process.env.FORCE_COLOR;
    const env = checkEnv();
    expect(env.NO_COLOR).toBe("1");
    expect("FORCE_COLOR" in env).toBe(false);
    expect(env.PATH).toBe(process.env.PATH);
    expect(process.env.FORCE_COLOR).toBe(before);
  });
});

describe("backlog 10: aiqh verify starts a check with that environment (real CLI)", () => {
  it("a parent with FORCE_COLOR, PY_COLORS and CLICOLOR_FORCE: the check sees NO_COLOR=1, no FORCE_COLOR, no PY_COLORS, and still CLICOLOR_FORCE", async () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    // the check prints only the presence of each variable (and whether NO_COLOR is "1"), never a value of the environment
    const probe = "const e = process.env; console.log(['FORCE_COLOR' in e, 'PY_COLORS' in e, 'CLICOLOR_FORCE' in e, e.NO_COLOR === '1'].join(','));";
    writeFileSync(path.join(tmp.dir, "probe.js"), probe);
    writeFileSync(path.join(tmp.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "envprobe", type: "node" }, checks: [{ name: "probe", kind: "custom", command: "node probe.js", timeoutSec: 30 }] }));
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "1", PY_COLORS: "1", CLICOLOR_FORCE: "1" };
    delete env.NO_COLOR;
    const r = await execFileAsync(process.execPath, [CLI, "verify", "--cwd", tmp.dir], { cwd: tmp.dir, env, timeout: 50_000, killSignal: "SIGKILL" }).then(
      () => 0,
      (err: { code?: number }) => err.code ?? -1,
    );
    expect(r).toBe(0);
    const report = JSON.parse(readFileSync(path.join(tmp.dir, "artifacts", "verification", "latest.json"), "utf8")) as { checks: Array<{ stdoutTail: string }> };
    // FORCE_COLOR present, PY_COLORS present, CLICOLOR_FORCE present, NO_COLOR is "1"
    expect(report.checks[0]?.stdoutTail.trim()).toBe("false,false,true,true");
  }, 60_000);
});
