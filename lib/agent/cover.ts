import "server-only";
import { readImageSize, type ImageSize } from "@/lib/images/dimensions";

// Cover-image fetch shared by the brief and build endpoints. Both need the raw
// bytes (Gemini reads the palette from them) plus the intrinsic size (so the
// prompt can forbid upscaling), so each request re-fetches from the URL — the
// bytes are too large to round-trip through the client between stages.

export type CoverPart = { mimeType: string; data: string; size: ImageSize | null };

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function fetchImagePart(url: string): Promise<CoverPart | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const res = await fetch(parsed, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "bookshell-generator/1.0" },
  });
  if (!res.ok) throw new Error(`Cover fetch failed: ${res.status}`);

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new Error(`Unsupported cover MIME: ${mimeType || "unknown"}`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Cover too large: ${buf.byteLength} bytes`);
  }

  const bytes = Buffer.from(buf);
  return { mimeType, data: bytes.toString("base64"), size: readImageSize(bytes, mimeType) };
}

// The inlineData part array Gemini expects (empty when there's no cover).
export function coverInlineParts(cover: CoverPart | null) {
  return cover ? [{ inlineData: { mimeType: cover.mimeType, data: cover.data } }] : [];
}
