/**
 * M2-0-R2-002: allow rule text may not contain control characters (C0, DEL, C1) or the Unicode line
 * / paragraph separators, so the audit output cannot be broken up or steered by a terminal.
 */
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfigText } from "../src/config/load.ts";

const BASE = '"version": 1, "project": { "name": "x" }, "checks": [ { "name": "a", "kind": "custom", "command": "true" } ]';
const cfg = (reason: string, p = "tests/**") => `{ ${BASE}, "security": { "allow": [ { "path": ${JSON.stringify(p)}, "reason": ${JSON.stringify(reason)} } ] } }`;

describe("M2-0-R2-002: control characters and Unicode line separators", () => {
  it("U+2028 / U+2029 / ESC / U+0085 in reason or path are schema errors", () => {
    for (const bad of ["one two", "one two", "esc\u001b[31mred", "nel\u0085next", "del\u007fx", "c1\u009bx"]) {
      expect(() => parseConfigText(cfg(bad)), JSON.stringify(bad)).toThrow(ConfigError);
      expect(() => parseConfigText(cfg("ok", bad)), `path ${JSON.stringify(bad)}`).toThrow(ConfigError);
    }
  });
  it("ordinary reasons with Japanese text, symbols and spaces are valid", () => {
    expect(() => parseConfigText(cfg("テスト用の合成キー（実行時連結）— 本物ではない / 2027-03 まで"))).not.toThrow();
    expect(() => parseConfigText(cfg("tabs\tare fine? no: keep it printable"))).toThrow(ConfigError); // TAB is C0
    expect(() => parseConfigText(cfg("plain reason with symbols !@#$%^&*()"))).not.toThrow();
  });
});
