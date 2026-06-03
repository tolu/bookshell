// Run: node --test lib/images/dimensions.test.ts   (Node 24 strips types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readImageSize } from "./dimensions.ts";

// Minimal valid headers, hand-built so the test carries no binary fixtures.

test("PNG: reads IHDR width/height (big-endian uint32)", () => {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0); // signature start
  buf.writeUInt32BE(800, 16); // width
  buf.writeUInt32BE(1200, 20); // height
  assert.deepEqual(readImageSize(buf, "image/png"), { width: 800, height: 1200 });
});

test("GIF: reads logical-screen width/height (little-endian uint16)", () => {
  const buf = Buffer.alloc(10);
  buf.write("GIF89a", 0, "ascii");
  buf.writeUInt16LE(640, 6);
  buf.writeUInt16LE(480, 8);
  assert.deepEqual(readImageSize(buf, "image/gif"), { width: 640, height: 480 });
});

test("JPEG: skips an APP0 segment then reads SOF0 height/width", () => {
  // FFD8 (SOI) | FFE0 APP0 len=4 +2 payload | FFC0 SOF0 len=17 precision height width
  const parts = [
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb, // APP0, length 4 (covers these 2 payload bytes)
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, length 17, precision 8
    0x04, 0xb0, // height = 1200
    0x03, 0x20, // width = 800
    0x00, 0x00, // tail padding so off+9 < length holds at the SOF marker
  ];
  const buf = Buffer.from(parts);
  assert.deepEqual(readImageSize(buf, "image/jpeg"), { width: 800, height: 1200 });
});

test("WebP (VP8X): reads 24-bit canvas width-1/height-1", () => {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  // width-1 = 799, height-1 = 1199, little-endian 24-bit
  const w = 799;
  const h = 1199;
  buf.writeUInt8(w & 0xff, 24);
  buf.writeUInt8((w >> 8) & 0xff, 25);
  buf.writeUInt8((w >> 16) & 0xff, 26);
  buf.writeUInt8(h & 0xff, 27);
  buf.writeUInt8((h >> 8) & 0xff, 28);
  buf.writeUInt8((h >> 16) & 0xff, 29);
  assert.deepEqual(readImageSize(buf, "image/webp"), { width: 800, height: 1200 });
});

test("unknown mime returns null", () => {
  assert.equal(readImageSize(Buffer.alloc(64), "image/avif"), null);
});

test("truncated buffer returns null, never throws", () => {
  assert.equal(readImageSize(Buffer.from([0x89, 0x50]), "image/png"), null);
  assert.equal(readImageSize(Buffer.from([0xff, 0xd8]), "image/jpeg"), null);
});
