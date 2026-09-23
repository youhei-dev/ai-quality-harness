/**
 * M2-1 (v0.4.0): the stored-ZIP writer of `aiqh review-packet`. Checked with a small reader written
 * here (no system `unzip`): signatures, method, flags, DOS time, CRC-32, sizes, offsets, names and
 * data; byte-for-byte reproducibility; rejected inputs.
 */
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOS_DATE, DOS_TIME, ZipError, createStoredZip } from "../src/review/zip.ts";
import { checked } from "./helpers.ts";

interface ReadEntry {
  name: string;
  data: Buffer;
  method: number;
  flags: number;
  time: number;
  date: number;
  mode: number;
}

/** Parse a ZIP by its central directory and cross-check every local header. Throws on any mismatch. */
function readZip(zip: Buffer): ReadEntry[] {
  const eocd = zip.length - 22;
  if (zip.readUInt32LE(eocd) !== 0x06054b50) throw new Error("no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize !== eocd) throw new Error("central directory does not end at the EOCD record");
  const out: ReadEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const time = zip.readUInt16LE(p + 12);
    const date = zip.readUInt16LE(p + 14);
    const crc = zip.readUInt32LE(p + 16);
    const csize = zip.readUInt32LE(p + 20);
    const usize = zip.readUInt32LE(p + 24);
    const nlen = zip.readUInt16LE(p + 28);
    const xlen = zip.readUInt16LE(p + 30);
    const clen = zip.readUInt16LE(p + 32);
    const mode = zip.readUInt32LE(p + 38) >>> 16;
    const lho = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + xlen + clen;
    if (zip.readUInt32LE(lho) !== 0x04034b50) throw new Error("bad local header");
    const lnlen = zip.readUInt16LE(lho + 26);
    const lxlen = zip.readUInt16LE(lho + 28);
    if (zip.subarray(lho + 30, lho + 30 + lnlen).toString("utf8") !== name) throw new Error("local / central name differ");
    if (zip.readUInt32LE(lho + 14) !== crc || zip.readUInt32LE(lho + 18) !== csize || zip.readUInt32LE(lho + 22) !== usize) throw new Error("local / central sizes differ");
    const data = zip.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
    if (method !== 0 || csize !== usize) throw new Error("not stored");
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`);
    out.push({ name, data: Buffer.from(data), method, flags, time, date, mode });
  }
  if (p !== eocd) throw new Error("central directory size mismatch");
  return out;
}

describe("createStoredZip", () => {
  it("writes one stored entry that the reader accepts, with fixed time, UTF-8 flag and mode 0644", () => {
    const data = Buffer.from("# Review Packet\n\n本文 `code`\n".repeat(500), "utf8");
    const entries = readZip(createStoredZip([{ name: checked("review-packet-demo.md"), data }]));
    expect(entries).toHaveLength(1);
    const [e] = entries;
    expect(e?.name).toBe("review-packet-demo.md");
    expect(e?.data.equals(data)).toBe(true);
    expect(e?.method).toBe(0);
    expect(e?.flags).toBe(0x0800);
    expect(e?.time).toBe(DOS_TIME);
    expect(e?.date).toBe(DOS_DATE);
    expect(e?.date).toBe(0x21);
    expect(e?.mode).toBe(0o100644);
  });

  it("keeps several entries in the given order, including an empty one", () => {
    const zip = createStoredZip([
      { name: checked("b.md"), data: Buffer.from("second") },
      { name: checked("a/empty.txt"), data: new Uint8Array(0) },
      { name: checked("c.md"), data: Buffer.from([0, 1, 2, 255]) },
    ]);
    expect(readZip(zip).map((e) => [e.name, e.data.length])).toEqual([
      ["b.md", 6],
      ["a/empty.txt", 0],
      ["c.md", 4],
    ]);
  });

  it("is reproducible byte for byte and independent of the clock", () => {
    const data = Buffer.from("same input\n");
    const a = createStoredZip([{ name: checked("p.md"), data }]);
    const b = createStoredZip([{ name: checked("p.md"), data: Buffer.from(data) }]);
    expect(a.equals(b)).toBe(true);
    // header sizes: local 30 + name, central 46 + name, end 22
    expect(a.length).toBe(30 + 4 + data.length + 46 + 4 + 22);
  });

  it("accepts a Uint8Array view with a non-zero offset", () => {
    const backing = Buffer.from("xxhello");
    const view = new Uint8Array(backing.buffer, backing.byteOffset + 2, 5);
    expect(readZip(createStoredZip([{ name: checked("v.txt"), data: view }]))[0]?.data.toString()).toBe("hello");
  });

  it("rejects no entries, unsafe or non-ASCII names, and duplicates", () => {
    expect(() => createStoredZip([])).toThrow(ZipError);
    for (const name of ["", "/abs.md", "../up.md", "a/../b.md", "./a.md", "a\\b.md", "日本.md", "a b.md", "a//b.md", "dir/"]) {
      expect(() => createStoredZip([{ name: checked(name), data: Buffer.from("x") }]), JSON.stringify(name)).toThrow(ZipError);
    }
    expect(() =>
      createStoredZip([
        { name: checked("a.md"), data: Buffer.from("1") },
        { name: checked("a.md"), data: Buffer.from("2") },
      ]),
    ).toThrow(/duplicate/);
  });
});
