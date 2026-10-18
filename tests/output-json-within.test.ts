/**
 * v0.11.0 (ADR-0034 N, M4-D-R2-001, ADR-0016): the output boundary gets one more door, `jsonWithin(value, maxBytes)`: the same JSON
 * document as `json` (safeJson: every string and key escaped and masked one by one, never the whole document), written only when its
 * UTF-8 length is at most maxBytes. It answers whether it wrote; over the limit nothing reaches the sink.
 */
import { describe, expect, it } from "vitest";
import { createOutput, type Output } from "../src/output.ts";
import { fake } from "./helpers.ts";

type JsonWithin = (value: unknown, maxBytes: number) => boolean;

/** createOutput with a sink that keeps what it gets, and its jsonWithin looked up at run time (absent before v0.11.0). */
function output(): { out: Output; within: JsonWithin; written: string[] } {
  const written: string[] = [];
  const out = createOutput({ log: (l) => written.push(l), logError: (l) => written.push(`ERR ${l}`) });
  const within = (out as Partial<Record<"jsonWithin", JsonWithin>>).jsonWithin;
  if (within === undefined) throw new Error("jsonWithin does not exist");
  return { out, within, written };
}

const SECRET = fake("AKIA", "ABCDEFGHIJKLMNOP");
const VALUE = { name: `a ${SECRET} b`, [`key-${SECRET}`]: 1, nested: [{ text: "あいう", n: 2.5 }, null, true], line: `x${String.fromCodePoint(0x202e)}y` };

describe("v0.11.0: jsonWithin", () => {
  it("writes the same text as json when it fits, and says it wrote", () => {
    const a = output();
    a.out.json(VALUE);
    const b = output();
    expect(b.within(VALUE, 1_000_000)).toBe(true);
    expect(b.written).toEqual(a.written);
    expect(b.written[0]).not.toContain(SECRET);
    expect(b.written[0]).toContain("[REDACTED:");
    expect(b.written[0]).toContain("\\\\u{202E}");
  });

  it("the limit is the UTF-8 length of the document: exactly the length is written, one byte less is not (nothing reaches the sink)", () => {
    const a = output();
    a.out.json(VALUE);
    const bytes = Buffer.byteLength(a.written[0] ?? "", "utf8");
    expect(bytes).toBeGreaterThan((a.written[0] ?? "").length); // multi-byte characters: bytes, not UTF-16 units
    const exact = output();
    expect(exact.within(VALUE, bytes)).toBe(true);
    expect(exact.written).toHaveLength(1);
    const less = output();
    expect(less.within(VALUE, bytes - 1)).toBe(false);
    expect(less.written).toEqual([]);
  });

  it("refuses what is not JSON data, like json (nothing written)", () => {
    const a = output();
    expect(() => a.within({ f: () => 1 }, 1_000_000)).toThrow(/not JSON data/);
    expect(a.written).toEqual([]);
  });
});
