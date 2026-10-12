/**
 * B20-R1-001: the rule of src/node-options.ts on its own (ADR-0024), over many forms. The CLI's use of it is fixed by
 * regression-b20-r1-001-node-options.test.ts. The forms and what Node v24.13.1 does with them were measured first (a dash and an
 * underscore are the same in a name; names and modes are case-sensitive; Node removes double quotes and backslashes in NODE_OPTIONS,
 * also inside a name; the later setting wins). The rule does not imitate the last two: it refuses warn wherever it is and the abort
 * name in any form, and refuses NODE_OPTIONS that names unhandled-rejections in a form that cannot be read one way. In NODE_OPTIONS the
 * name inside `--other=<value>` is read as that value; a bare token with the name is refused (whether the option before it takes a value
 * is not known here).
 */
import { describe, expect, it } from "vitest";
import { refusedNodeOption } from "../src/node-options.ts";

type Expect = null | "warn" | "abort" | "unreadable";
const kind = (line: string | null): Expect =>
  line === null ? null : line.includes("--unhandled-rejections=warn") ? "warn" : line.includes("abort-on-uncaught-exception") ? "abort" : line.includes("cannot be read") ? "unreadable" : (`unexpected: ${line}` as never);

const ARGV: Array<[string[], Expect]> = [
  [[], null],
  [["--import", "file:///x/preload.mjs"], null],
  [["--unhandled-rejections=warn"], "warn"],
  [["--unhandled-rejections", "warn"], "warn"],
  [["--unhandled_rejections=warn"], "warn"],
  [["--unhandled_rejections", "warn"], "warn"],
  [["--unhandled-rejections=throw", "--unhandled-rejections=warn"], "warn"],
  [["--unhandled-rejections=warn", "--unhandled-rejections=throw"], "warn"],
  [["--unhandled-rejections=warn-with-error-code"], null],
  [["--unhandled-rejections", "warn-with-error-code"], null],
  [["--unhandled-rejections=throw"], null],
  [["--unhandled-rejections=strict"], null],
  [["--unhandled-rejections=none"], null],
  [["--unhandled-rejections"], "unreadable"],
  [["--unhandled-rejections=bogus"], "unreadable"],
  [["--import", "./unhandled-rejections-helper.mjs"], null],
  [["--abort-on-uncaught-exception"], "abort"],
  [["--abort_on_uncaught_exception"], "abort"],
  [["--abort-on_uncaught-exception"], "abort"],
  [["--no-abort-on-uncaught-exception"], "abort"],
  [["--noabort-on-uncaught-exception"], "abort"],
  [["--abort-on-uncaught-exception", "--no-abort-on-uncaught-exception"], "abort"],
  [["--import", "./abort-on-uncaught-exception.mjs"], "abort"],
  [["--trace-uncaught", "--trace-warnings", "--enable-source-maps"], null],
  [["--UNHANDLED-REJECTIONS=warn"], null],
];

const NODE_OPTIONS: Array<[string | undefined, Expect]> = [
  [undefined, null],
  ["", null],
  ["--trace-uncaught --enable-source-maps", null],
  ['--require "./has space.js"', null],
  ["--unhandled-rejections=warn", "warn"],
  ["--unhandled-rejections warn", "warn"],
  ["  --unhandled-rejections   warn  ", "warn"],
  ["--unhandled_rejections=warn", "warn"],
  ["--unhandled-rejections=warn --unhandled-rejections=throw", "warn"],
  ["--unhandled-rejections=throw --unhandled-rejections=warn", "warn"],
  ["--unhandled-rejections=warn-with-error-code", null],
  ["--unhandled-rejections=none --trace-warnings", null],
  ["--unhandled-rejections", "unreadable"],
  ["--unhandled-rejections=", "unreadable"],
  ["--unhandled-rejections=WARN", "unreadable"],
  ['"--unhandled-rejections=warn"', "unreadable"],
  ['--unhandled-rejections="warn"', "unreadable"],
  ['"--unhandled-rejections=throw"', "unreadable"],
  ['--unhandled-rej"ections=warn"', "unreadable"],
  ["'--unhandled-rejections=warn'", "unreadable"],
  ["--unhandled-rejections=w\\arn", "unreadable"],
  ["--unhandled-rejections\twarn", "unreadable"],
  ["--require=./unhandled-rejections.cjs", null],
  ["--require ./unhandled-rejections.cjs", "unreadable"],
  ["--abort-on-uncaught-exception", "abort"],
  ["--abort_on_uncaught_exception", "abort"],
  ["--no-abort-on-uncaught-exception", "abort"],
  ['"--abort-on-uncaught-exception"', "abort"],
  ['--abort-on-unc"aught-exception"', "abort"],
  ["--abort-on-uncaught-exception --unhandled-rejections=strict", "abort"],
];

describe("B20-R1-001 rule: the node command line (process.execArgv)", () => {
  for (const [argv, want] of ARGV) {
    it(`${JSON.stringify(argv)} -> ${String(want)}`, () => {
      expect(kind(refusedNodeOption(argv, undefined))).toBe(want);
    });
  }
});

describe("B20-R1-001 rule: NODE_OPTIONS", () => {
  for (const [value, want] of NODE_OPTIONS) {
    it(`${JSON.stringify(value)} -> ${String(want)}`, () => {
      const line = refusedNodeOption([], value);
      expect(kind(line)).toBe(want);
      if (line !== null) expect(line).toContain("NODE_OPTIONS");
    });
  }
});

describe("B20-R1-001 rule: the line", () => {
  it("is one line, names where the option was found, and never quotes NODE_OPTIONS itself", () => {
    const value = "--unhandled-rejections=warn --title=private-value";
    const line = refusedNodeOption([], value) ?? "";
    expect(line.split("\n")).toHaveLength(1);
    expect(line.startsWith("aiqh: refusing to start: NODE_OPTIONS ")).toBe(true);
    expect(line).not.toContain("private-value");
  });
  it("checks the command line first", () => {
    expect(refusedNodeOption(["--abort-on-uncaught-exception"], "--unhandled-rejections=warn")).toContain("the node command line");
  });
});
