/**
 * Regression tests for the final independent review — R7-001
 * (docs/reviews/m0/independent-review-r7.md). When a UTF-8 code point is split across stdout /
 * stderr chunks, the runtime OutputBuffer must still land on a code-point boundary after the byte
 * cap: no U+FFFD, re-encoded length within the cap, and the end of the stream preserved. Chunk
 * boundaries are fixed explicitly so the tests are deterministic.
 */
import { describe, expect, it } from "vitest";
import { OutputBuffer } from "../src/runner/execute.ts";

function fill(chunks: number[][], maxBytes: number): OutputBuffer {
  const b = new OutputBuffer(maxBytes);
  for (const c of chunks) b.push(Buffer.from(c));
  return b;
}

describe("R7-001 OutputBuffer aligns to a UTF-8 boundary across chunk boundaries", () => {
  it("4-byte character split across two chunks: A😀B as [41 F0 9F] + [98 80 42], cap 4", () => {
    const b = fill([[0x41, 0xf0, 0x9f], [0x98, 0x80, 0x42]], 4);
    const text = b.toString();
    expect(b.truncated).toBe(true);
    expect(text).not.toContain("�");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4);
    expect(text.endsWith("B")).toBe(true);
    expect(text).toBe("B");
  });

  it("3-byte character split across two chunks: xあy as [78 E3 81] + [82 79], cap 3", () => {
    // After the byte cut the first chunk holds a single continuation byte (81); the next chunk
    // starts with another continuation byte (82) that must also be dropped.
    const b = fill([[0x78, 0xe3, 0x81], [0x82, 0x79]], 3);
    const text = b.toString();
    expect(text).not.toContain("�");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(3);
    expect(text.endsWith("y")).toBe(true);
    expect(text).toBe("y");
  });

  it("continuation bytes spread over several tiny chunks: [F0] [9F] [98] [80] [42], cap 3", () => {
    const b = fill([[0xf0], [0x9f], [0x98], [0x80], [0x42]], 3);
    const text = b.toString();
    expect(text).not.toContain("�");
    expect(text).toBe("B");
  });

  it("trailing continuation bytes arriving after an earlier trim, within the cap: [61 F0] [9F] [98] [80], cap 2", () => {
    // Once the stream start has been discarded, a chunk that only continues a split character
    // fits in the cap but must not survive (found by the seeded test at iteration 160).
    const b = fill([[0x61, 0xf0], [0x9f], [0x98], [0x80]], 2);
    expect(b.toString()).toBe("");
    const c = fill([[0xf0], [0x9f, 0x98], [0x80]], 1);
    expect(c.toString()).toBe("");
  });

  it("deterministic seeded splits: many chunkings and caps keep a valid UTF-8 suffix within the cap", () => {
    // Mixed 1-, 2-, 3- and 4-byte characters.
    const alphabet = ["a", "é", "あ", "😀", "B", "ñ", "い", "🚀"];
    // Small LCG; the high bits are used because the low bits of an LCG have a short period.
    let seed = 20260918;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    for (let iter = 0; iter < 500; iter++) {
      const len = 8 + rand(24);
      let text = "";
      for (let i = 0; i < len; i++) text += alphabet[rand(alphabet.length)];
      const bytes = Buffer.from(text, "utf8");
      // split into chunks of random sizes 1..3 (small chunks make cross-chunk code points common)
      const chunks: number[][] = [];
      let pos = 0;
      while (pos < bytes.length) {
        const n = 1 + rand(3);
        chunks.push([...bytes.subarray(pos, pos + n)]);
        pos += n;
      }
      const cap = 1 + rand(bytes.length + 2);
      const out = fill(chunks, cap).toString();
      expect(out, `iter ${iter} cap ${cap} text ${JSON.stringify(text)}`).not.toContain("�");
      expect(Buffer.byteLength(out, "utf8"), `iter ${iter} cap ${cap}`).toBeLessThanOrEqual(cap);
      expect(text.endsWith(out), `iter ${iter} cap ${cap}: ${JSON.stringify(out)} is not a suffix of ${JSON.stringify(text)}`).toBe(true);
    }
  });
});
