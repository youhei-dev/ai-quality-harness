/**
 * v0.10.1 (Q12 of the M4 design R3): a check's timeoutSec is waited with setTimeout(…, timeoutSec * 1000). A Node.js timer cannot
 * wait longer than 2,147,483,647 ms: a longer delay becomes 1 ms with a TimeoutOverflowWarning on standard error (outside aiqh's
 * output), so a check with timeoutSec 2,147,484 or more timed out at once. The config now refuses a timeoutSec above 2,147,483 —
 * a check's and defaults.timeoutSec — as a configuration error: exit 2, no report, and the message names the limit and the reason.
 * The largest allowed value is read and a check runs with it without the timer warning (no test waits for the timeout itself).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify } from "../src/commands/verify.ts";
import { generateConfigJsonSchema } from "../src/config/json-schema.ts";
import { ConfigError, parseConfigText } from "../src/config/load.ts";
import * as schema from "../src/config/schema.ts";
import type { VerificationReport } from "../src/types.ts";
import { makeTempDir } from "./helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const TIMER_MAX_MS = 2_147_483_647;
const LIMIT = 2_147_483;

type Where = "check" | "defaults";
function configText(where: Where, timeoutSec: number): string {
  const check: Record<string, unknown> = { name: "ok", kind: "custom", command: "node -e 0" };
  if (where === "check") check.timeoutSec = timeoutSec;
  const config: Record<string, unknown> = { version: 1, project: { name: "p" }, checks: [check] };
  if (where === "defaults") config.defaults = { timeoutSec };
  return JSON.stringify(config);
}

function outcome(run: () => unknown): { ok: true } | { error: string; message: string } {
  try {
    run();
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).name, message: (err as Error).message };
  }
}

async function verify(text: string): Promise<{ code: number; lines: string[]; dir: string; warnings: string[] }> {
  const t = makeTempDir("aiqh-timeout-max-");
  cleanups.push(t.cleanup);
  writeFileSync(path.join(t.dir, "aiqh.config.jsonc"), text);
  const warnings: string[] = [];
  const onWarning = (w: Error): void => {
    warnings.push(w.name);
  };
  process.on("warning", onWarning);
  try {
    const lines: string[] = [];
    const code = await runVerify({ cwd: t.dir, toolVersion: "0.0.0-test", log: (l) => lines.push(l), logError: (l) => lines.push(l) });
    await new Promise((resolve) => setImmediate(resolve)); // a warning is emitted on a later tick
    return { code, lines, dir: t.dir, warnings };
  } finally {
    process.off("warning", onWarning);
  }
}

describe("v0.10.1: the largest timeoutSec is 2,147,483 seconds (the longest wait of a Node.js timer)", () => {
  it("MAX_TIMEOUT_SEC is the timer's limit in whole seconds", () => {
    const max = (schema as { MAX_TIMEOUT_SEC?: number }).MAX_TIMEOUT_SEC;
    expect(max).toBe(LIMIT);
    expect(LIMIT * 1000).toBeLessThanOrEqual(TIMER_MAX_MS);
    expect((LIMIT + 1) * 1000).toBeGreaterThan(TIMER_MAX_MS);
  });

  it.each<Where>(["check", "defaults"])("%s: 2,147,483 is accepted", (where) => {
    expect(outcome(() => parseConfigText(configText(where, LIMIT)))).toEqual({ ok: true });
  });

  it.each<Where>(["check", "defaults"])("%s: 2,147,484 is a configuration error that names the limit and the reason", (where) => {
    const r = outcome(() => parseConfigText(configText(where, LIMIT + 1)));
    expect(r).toMatchObject({ error: "ConfigError" });
    expect(() => parseConfigText(configText(where, LIMIT + 1))).toThrow(ConfigError);
    const message = "message" in r ? r.message : "";
    expect(message).toContain("2147483");
    expect(message).toMatch(/timer/i);
    expect(message).toContain("2147483647 ms");
  });

  it.each<Where>(["check", "defaults"])("%s: verify with 2,147,484 ends with exit 2 and writes no report", async (where) => {
    const r = await verify(configText(where, LIMIT + 1));
    expect(r.code).toBe(2);
    expect(existsSync(path.join(r.dir, "artifacts"))).toBe(false);
    expect(r.lines.at(-1)).toBe("VERIFY ERROR (configuration error)");
    expect(r.lines.join("\n")).toContain("2147483");
    expect(r.warnings).not.toContain("TimeoutOverflowWarning");
  });

  it.each<Where>(["check", "defaults"])("%s: verify with 2,147,483 runs the check without the timer warning and records the value", async (where) => {
    const r = await verify(configText(where, LIMIT));
    expect(r.code).toBe(0);
    expect(r.warnings).not.toContain("TimeoutOverflowWarning");
    const report = JSON.parse(readFileSync(path.join(r.dir, "artifacts", "verification", "latest.json"), "utf8")) as VerificationReport;
    expect(report.checks[0]?.timeoutSec).toBe(LIMIT);
    expect(report.checks[0]?.timedOut).toBe(false);
  });

  it("the generated JSON Schema carries the same maximum for a check's and the defaults' timeoutSec", () => {
    const s = JSON.parse(generateConfigJsonSchema()) as {
      properties: { defaults: { properties: { timeoutSec: { maximum?: number } } }; checks: { items: { properties: { timeoutSec: { maximum?: number } } } } };
    };
    expect(s.properties.defaults.properties.timeoutSec.maximum).toBe(LIMIT);
    expect(s.properties.checks.items.properties.timeoutSec.maximum).toBe(LIMIT);
  });
});
