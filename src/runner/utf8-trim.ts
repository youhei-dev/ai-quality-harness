/**
 * UTF-8-aware front trimming shared by the runtime output buffer (R5-004) and the report tail
 * (R6-001). After a byte-wise cut the first byte may be a UTF-8 continuation byte (0x80-0xBF);
 * dropping up to 3 more bytes lands on a code-point boundary, so the decoded text neither starts
 * with U+FFFD nor re-encodes to more bytes than the cap. The result can therefore be up to 3 bytes
 * shorter than requested.
 */

/** True for a UTF-8 continuation byte (10xxxxxx). */
export function isUtf8ContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Number of leading bytes (0..3) to drop from `buf` so that it starts on a UTF-8 code-point
 * boundary. `buf` is expected to be the tail of a longer UTF-8 byte sequence.
 */
export function utf8LeadingBytesToDrop(buf: Uint8Array): number {
  let n = 0;
  while (n < 3 && n < buf.length) {
    const byte = buf[n];
    if (byte === undefined || !isUtf8ContinuationByte(byte)) break;
    n += 1;
  }
  return n;
}

/**
 * Return the last `maxBytes` bytes of `buf`, aligned to a UTF-8 code-point boundary.
 * When `buf` fits, it is returned unchanged.
 */
export function utf8SafeTail(buf: Buffer, maxBytes: number): Buffer {
  if (buf.length <= maxBytes) return buf;
  const cut = buf.subarray(buf.length - maxBytes);
  const drop = utf8LeadingBytesToDrop(cut);
  return drop === 0 ? cut : cut.subarray(drop);
}
