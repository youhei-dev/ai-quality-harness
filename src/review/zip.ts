/**
 * Minimal ZIP writer for the review packet (M2-1, ADR-0014). Node standard library only (ADR-0008):
 * entries are stored without compression (method 0) so the bytes do not depend on the zlib version,
 * every entry has the fixed DOS time 1980-01-01 00:00:00, and the order is the order given. The same
 * entries therefore always give the same bytes. No ZIP64: sizes and offsets must fit in 32 bits.
 */
import { crc32 } from "node:zlib";
import type { Checked } from "./checked.ts";

export interface ZipEntry {
  /**
   * Archive path: ASCII letters, digits, ".", "_", "-", separated by "/"; no "." / ".." segments. Checked (raw
   * characters and secret shapes, M2-1-R2-001): the name is written twice into the archive and is not part of the
   * packet text that the whole-packet check sees.
   */
  name: Checked;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** 1980-01-01 00:00:00 in MS-DOS format (date: (year - 1980) << 9 | month << 5 | day). */
export const DOS_TIME = 0;
export const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** General purpose flag bit 11: the name is UTF-8 (always set; names are ASCII anyway). */
const FLAG_UTF8 = 0x0800;
const VERSION_NEEDED = 10;
/** Made by: 3 = Unix (so the external attributes carry a Unix mode), version 2.0. */
const VERSION_MADE_BY = (3 << 8) | 20;
const UNIX_FILE_MODE = 0o100644;
const MAX_32 = 0xffffffff;
const NAME = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export class ZipError extends Error {
  override readonly name = "ZipError";
}

export function createStoredZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length === 0) throw new ZipError("a zip needs at least one entry");
  if (entries.length > 0xffff) throw new ZipError("too many entries (no ZIP64)");
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    if (!NAME.test(e.name) || e.name.split("/").some((s) => s === "." || s === "..")) throw new ZipError(`invalid entry name: ${JSON.stringify(e.name)}`);
    if (seen.has(e.name)) throw new ZipError(`duplicate entry name: ${e.name}`);
    seen.add(e.name);
    if (e.data.length > MAX_32) throw new ZipError(`entry too large (no ZIP64): ${e.name}`);
    const name = Buffer.from(e.name, "ascii");
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    // extra length (30), comment length (32), disk number (34), internal attributes (36): 0
    central.writeUInt32LE((UNIX_FILE_MODE << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength));
    centrals.push(central, name);
    offset += local.length + name.length + size;
    if (offset > MAX_32) throw new ZipError("archive too large (no ZIP64)");
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
