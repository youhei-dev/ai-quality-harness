import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkValue, type Checked } from "../src/review/checked.ts";
import { DEFAULT_SECURITY } from "../src/security/scan.ts";
import type { CheckResult } from "../src/types.ts";

export function makeTempDir(prefix = "aiqh-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function checkResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "check",
    kind: "custom",
    command: "true",
    cwd: ".",
    required: true,
    timeoutSec: 10,
    description: null,
    status: "PASS",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1,
    errorSummary: null,
    stdoutTail: "",
    stderrTail: "",
    outputTruncated: false,
    ...overrides,
  };
}

/** Quote a JS snippet for `node -e` inside a shell command (POSIX single quotes). */
export function nodeEval(js: string): string {
  return `node -e '${js.replace(/'/g, `'\\''`)}'`;
}

/**
 * Throw unless `pid` is a positive safe integer (M2-1). `process.kill(0, …)` targets the caller's
 * own process group and a negative pid a whole group, so an empty or half-written pid file
 * (`Number("") === 0`) must never reach `process.kill`.
 */
export function assertSignalablePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`refusing to signal pid ${String(pid)}: not a positive safe integer`);
  }
}

/** The pid in `text`, or null unless it is a positive safe integer (an empty or half-written file gives null). */
export function parsePid(text: string): number | null {
  if (!/^[0-9]+$/.test(text)) return null;
  const pid = Number(text);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Wait until `file` holds a valid pid and return it (M2-1). Waiting for the file to *exist* is not
 * enough: `writeFileSync` creates the file before it writes, so a reader in between sees "".
 * Throws with the last content seen when no valid pid appears within `ms`.
 */
export async function waitForPid(file: string, ms: number): Promise<number> {
  const deadline = Date.now() + ms;
  for (;;) {
    const last = existsSync(file) ? readFileSync(file, "utf8") : null;
    const pid = last === null ? null : parsePid(last);
    if (pid !== null) return pid;
    if (Date.now() >= deadline) {
      throw new Error(`no valid pid in ${file} within ${ms}ms (last content: ${last === null ? "file missing" : JSON.stringify(last)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Assemble a synthetic secret-shaped value at runtime. Keeping prefix and body apart means
 * no literal in the repository matches a credential pattern (pre-push guard, secret scanners),
 * while the value under test is identical to a real-looking token.
 */
export function fake(prefix: string, body: string): string {
  return prefix + body;
}

/** A Checked value for tests (M2-1 R2); throws unless `value` passes the pre-render check. */
export function checked(value: string): Checked {
  const r = checkValue(value, DEFAULT_SECURITY);
  if (!r.ok) throw new Error(`test value does not pass the pre-render check: ${JSON.stringify(r.findings)}`);
  return r.value;
}
