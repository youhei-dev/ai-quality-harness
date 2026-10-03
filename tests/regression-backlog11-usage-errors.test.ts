/**
 * Backlog 11 (prototype of the regression test): a usage error of any command is exit 2. Exit 1 means "findings" (VERIFY FAILED for verify,
 * findings for security-scan and review-packet); until v0.5.26 only review-packet answered a usage error with 2, the other commands and the root
 * program answered 1 (commander's default), so a CI could not tell a mistyped option from a failed quality gate. The real CLI is run as a child
 * process in an empty directory with forms that do not run the real work; help and --version stay 0. The message is not changed (it is still one
 * error line on standard error and nothing on standard output).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./helpers.ts";

const CLI = path.resolve(import.meta.dirname, "..", "src", "cli.ts");

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function run(args: string[], dir?: string): { code: number | null; out: string; err: string } {
  let cwd = dir;
  if (cwd === undefined) {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    cwd = tmp.dir;
  }
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Usage errors that answered 1 before this change (commander's default exit). */
const WAS_ONE: Array<[string, string[]]> = [
  ["an unknown command", ["foo"]],
  ["an unknown command with an unknown option", ["foo", "--bogus"]],
  ["an unknown option of the program", ["--bogus"]],
  ["verify: an unknown long option", ["verify", "--no-such-option"]],
  ["verify: an unknown short option", ["verify", "-x"]],
  ["verify: an abbreviation (with commander's suggestion)", ["verify", "--conf"]],
  ["init: an unknown option", ["init", "--no-such-option"]],
  ["security-scan: an unknown option", ["security-scan", "--no-such-option"]],
  ["verify: --config without a value", ["verify", "--config"]],
  ["verify: --cwd without a value", ["verify", "--cwd"]],
  ["verify: -o without a value", ["verify", "-o"]],
  ["init: --cwd without a value", ["init", "--cwd"]],
  ["security-scan: --cwd without a value", ["security-scan", "--cwd"]],
  ["security-scan: --config without a value", ["security-scan", "--config"]],
  ["verify: an excess argument", ["verify", "extra"]],
  ["init: an excess argument", ["init", "extra"]],
  ["security-scan: an excess argument", ["security-scan", "extra"]],
];

/** Usage errors of review-packet, which already answered 2 (they must stay 2). */
const WAS_TWO: Array<[string, string[]]> = [
  ["review-packet: no arguments (--range is required)", ["review-packet"]],
  ["review-packet: an unknown option", ["review-packet", "--no-such-option"]],
  ["review-packet: --range without a value", ["review-packet", "--range"]],
  ["review-packet: --max-file-bytes 0", ["review-packet", "--range", "a..b", "--max-file-bytes", "0"]],
  ["review-packet: --max-file-bytes abc", ["review-packet", "--range", "a..b", "--max-file-bytes", "abc"]],
  ["review-packet: --max-packet-bytes 1.5", ["review-packet", "--range", "a..b", "--max-packet-bytes", "1.5"]],
  ["review-packet: an excess argument", ["review-packet", "--range", "a..b", "extra"]],
];

/** help and the version are not errors. */
const ZERO: Array<[string, string[]]> = [
  ["--help", ["--help"]],
  ["-h", ["-h"]],
  ["help", ["help"]],
  ["--version", ["--version"]],
  ["-V", ["-V"]],
  ["verify --help", ["verify", "--help"]],
  ["init --help", ["init", "--help"]],
  ["security-scan --help", ["security-scan", "--help"]],
  ["review-packet --help", ["review-packet", "--help"]],
];

describe("backlog 11: a usage error is exit 2", () => {
  it.each(WAS_ONE)("%s: exit 2 (was 1), one error line on standard error, nothing on standard output", (_label, args) => {
    const r = run(args);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/^error: /);
  });

  it.each([
    ["no command given", []],
    ["help for a command that does not exist", ["help", "foo"]],
  ] as Array<[string, string[]]>)("%s: the help on standard error and exit 2 (was 1), nothing on standard output", (_label, args) => {
    const r = run(args);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/^Usage: aiqh/);
  });

  it.each(WAS_TWO)("%s: exit 2 (as before)", (_label, args) => {
    const r = run(args);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err.length).toBeGreaterThan(0);
  });

  it.each(ZERO)("%s: exit 0, nothing on standard error", (_label, args) => {
    const r = run(args);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out.length).toBeGreaterThan(0);
  });

  it("exit 1 stays VERIFY FAILED: a failing required check is 1, not 2", () => {
    const tmp = makeTempDir();
    cleanups.push(tmp.cleanup);
    writeFileSync(path.join(tmp.dir, "aiqh.config.jsonc"), JSON.stringify({ version: 1, project: { name: "usage", type: "node" }, checks: [{ name: "fails", kind: "custom", command: "node -e process.exit(1)", timeoutSec: 30 }] }));
    const r = run(["verify", "--cwd", tmp.dir], tmp.dir);
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain("VERIFY FAILED");
  }, 60_000);
});
