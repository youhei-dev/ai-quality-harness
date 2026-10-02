/**
 * Backlog 10, review backlog-9-10-r1 R1-004 (Medium, written without care; 0 callers in src/ or tests/): `executeCommand` started the
 * child with `env: options.env ?? checkEnv()`, so a caller that passed `env` skipped checkEnv() altogether and FORCE_COLOR / PY_COLORS
 * reached the check, although ADR-0020 says checkEnv() is the one place that builds the environment of a check. `options.env` is now
 * the parent's environment, the base checkEnv() works on (`checkEnv(options.env ?? process.env)`), not the finished environment of the
 * child. The probe prints only the presence of each variable and whether NO_COLOR is "1", never a value.
 */
import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/runner/execute.ts";
import { makeTempDir, nodeEval } from "./helpers.ts";

const PROBE = nodeEval("const e = process.env; console.log(['FORCE_COLOR' in e, 'PY_COLORS' in e, e.NO_COLOR === '1', 'AIQH_PROBE_KEEP' in e].join(','));");

/** A parent environment without any of the color variables, plus `extra` and a marker variable that must be kept. */
function parentEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, AIQH_PROBE_KEEP: "1" };
  delete env.FORCE_COLOR;
  delete env.PY_COLORS;
  delete env.NO_COLOR;
  return { ...env, ...extra };
}

async function probe(env: NodeJS.ProcessEnv): Promise<string> {
  const tmp = makeTempDir();
  try {
    const r = await executeCommand({ command: PROBE, cwd: tmp.dir, timeoutMs: 20_000, env });
    expect(r.exitCode).toBe(0);
    return r.stdout.trim();
  } finally {
    tmp.cleanup();
  }
}

describe("backlog 10, R1-004: an env passed to executeCommand goes through checkEnv", () => {
  it.each([
    ["FORCE_COLOR", { FORCE_COLOR: "1" }],
    ["PY_COLORS", { PY_COLORS: "1" }],
    ["FORCE_COLOR and PY_COLORS", { FORCE_COLOR: "1", PY_COLORS: "1" }],
  ] as const)("a parent env with %s: the check sees neither of them, sees NO_COLOR=1, and keeps the other variables", async (_name, extra) => {
    // FORCE_COLOR present, PY_COLORS present, NO_COLOR is "1", the marker is kept
    expect(await probe(parentEnv(extra))).toBe("false,false,true,true");
  }, 30_000);

  it("a parent env with none of them: NO_COLOR=1 is added and the other variables are kept", async () => {
    expect(await probe(parentEnv({}))).toBe("false,false,true,true");
  }, 30_000);

  it("does not change the env object it is given", async () => {
    const env = parentEnv({ FORCE_COLOR: "1", PY_COLORS: "1" });
    const copy = { ...env };
    await probe(env);
    expect(env).toEqual(copy);
  }, 30_000);
});
