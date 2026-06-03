// Dependency-free intrinsic-size reader for the exact image types we accept as
// book covers (image/jpeg, image/png, image/webp, image/gif — see
// ALLOWED_IMAGE_MIME in the generate route). We only need width/height from the
// header, so we parse the few leading bytes per format rather than pull in a
// native decoder like sharp. Returns null on anything we can't confidently read
// — callers treat a null as "dimensions unknown" and fall back to CSS heuristics,
// so a parse miss is never fatal.

export type ImageSize = { width: number; height: number };

export function readImageSize(buf: Buffer, mimeType: string): ImageSize | null {
  switch (mimeType) {
    case "image/png":
      return readPng(buf);
    case "image/gif":
      return readGif(buf);
    case "image/jpeg":
      return readJpeg(buf);
    case "image/webp":
      return readWebp(buf);
    default:
      return null;
  }
}

// PNG: 8-byte signature, then the IHDR chunk whose width/height are big-endian
// uint32 at byte offsets 16 and 20.
function readPng(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// GIF: "GIF87a"/"GIF89a" then logical-screen width/height as little-endian
// uint16 at offsets 6 and 8.
function readGif(buf: Buffer): ImageSize | null {
  if (buf.length < 10) return null;
  if (buf.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

// JPEG: walk the marker segments from offset 2 until a Start-Of-Frame marker
// (0xC0–0xCF, excluding the non-SOF DHT/JPG/DAC markers), whose payload carries
// height then width as big-endian uint16.
function readJpeg(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf.readUInt8(off) !== 0xff) {
      off++;
      continue;
    }
    const marker = buf.readUInt8(off + 1);
    // Standalone markers (no length payload): padding, SOI/EOI, restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      off += 2;
      continue;
    }
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (isSof) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    // Otherwise skip this segment by its declared length.
    off += 2 + buf.readUInt16BE(off + 2);
  }
  return null;
}

// WebP: RIFF/WEBP container with one of three chunk encodings. Each packs the
// canvas dimensions differently; see the VP8/VP8L/VP8X bitstream specs.
function readWebp(buf: Buffer): ImageSize | null {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buf.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    // Lossy: 14-bit width/height (little-endian) after the 0x9d012a start code.
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L") {
    // Lossless: 14-bit width-1 / height-1 bit-packed after the 0x2f signature.
    const b0 = buf.readUInt8(21);
    const b1 = buf.readUInt8(22);
    const b2 = buf.readUInt8(23);
    const b3 = buf.readUInt8(24);
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit canvas width-1 / height-1 (little-endian) at offset 24/27.
    const width = 1 + (buf.readUInt8(24) | (buf.readUInt8(25) << 8) | (buf.readUInt8(26) << 16));
    const height = 1 + (buf.readUInt8(27) | (buf.readUInt8(28) << 8) | (buf.readUInt8(29) << 16));
    return { width, height };
  }
  return null;
}
