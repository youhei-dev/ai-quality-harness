import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
 * Assemble a synthetic secret-shaped value at runtime. Keeping prefix and body apart means
 * no literal in the repository matches a credential pattern (pre-push guard, secret scanners),
 * while the value under test is identical to a real-looking token.
 */
export function fake(prefix: string, body: string): string {
  return prefix + body;
}
