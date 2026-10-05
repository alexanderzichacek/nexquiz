import { deflateSync } from "node:zlib";

/** Generated test media for the smoke test (no binary fixtures in the repo). */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * RGB PNG of `width × height`: grey background with a red square around
 * (`spot.x`, `spot.y`) given as 0–1 fractions (the hotspot target).
 */
export function generatePng(width: number, height: number, spot: { x: number; y: number }): Buffer {
  const rows: Buffer[] = [];
  const cx = spot.x * width;
  const cy = spot.y * height;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const inSpot = Math.abs(x - cx) < 16 && Math.abs(y - cy) < 16;
      row.set(inSpot ? [220, 40, 40] : [200, 200, 200], 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // colour type: truecolour
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Silent MPEG-1 Layer III stream (128 kbit/s, 44.1 kHz, mono) of roughly
 * `seconds` length: valid frame headers with zeroed side info / main data,
 * which decoders play as silence and `music-metadata` parses with a duration.
 */
export function generateMp3(seconds: number): Buffer {
  const frameBytes = Math.floor((144 * 128_000) / 44_100); // 417, no padding
  const frames = Math.ceil((seconds * 44_100) / 1152);
  const frame = Buffer.alloc(frameBytes);
  frame.set([0xff, 0xfb, 0x90, 0xc0], 0); // sync, MPEG-1, Layer III, no CRC | 128k, 44.1k | mono
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}
