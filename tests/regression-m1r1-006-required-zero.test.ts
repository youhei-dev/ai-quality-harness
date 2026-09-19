/**
 * M1-R1-006: `aiqh init --write` validates the generated config with the runtime parser / resolver
 * before writing; a proposal with zero required checks (Playwright only, no git) is shown but never
 * written (exit 2).
 */
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.ts";
import { makeTempDir } from "./helpers.ts";

const FIX = path.resolve(import.meta.dirname, "fixtures", "repos");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});
async function init(cwd: string, opts: Partial<Parameters<typeof runInit>[0]> = {}) {
  const lines: string[] = [];
  const code = await runInit({ cwd, toolVersion: "0.0.0", log: (l) => lines.push(l), logError: (l) => lines.push(l), ...opts });
  return { code, output: lines.join("\n") };
}

describe("M1-R1-006: a config with zero required checks is never written", () => {
  it("Playwright-only, non-git fixture: proposal shown, --write refused with exit 2, no file", async () => {
    const t = makeTempDir("aiqh-r1-006-");
    cleanups.push(t.cleanup);
    cpSync(path.join(FIX, "node-playwright-only"), t.dir, { recursive: true });
    const proposal = await init(t.dir);
    expect(proposal.code).toBe(0);
    expect(proposal.output).toContain('"kind": "e2e"');
    expect(proposal.output).toContain('"required": false');
    const written = await init(t.dir, { write: true });
    expect(written.code).toBe(2);
    expect(written.output).toMatch(/required/i);
    expect(existsSync(path.join(t.dir, "aiqh.config.jsonc"))).toBe(false);
  });
});
