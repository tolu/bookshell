import { NextResponse } from "next/server";
import { getGenAI, GENERATION_MODEL } from "@/lib/gemini/client";
import { buildPrompt, type GenerateInput } from "@/lib/gemini/prompt";

export const runtime = "nodejs";
// Generation can take 10–30s on gemini-2.5-pro. Vercel functions default to 10s.
export const maxDuration = 60;

type Body = {
  title?: string;
  author?: string;
  imageUrl?: string;
  genre?: string;
  description?: string;
  longText?: string;
};

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — Gemini inline limit is ~20 MB; this is a safety cap.

async function fetchImagePart(url: string): Promise<{ mimeType: string; data: string } | null> {
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

  return { mimeType, data: Buffer.from(buf).toString("base64") };
}

// Strip markdown code fences if the model emits them despite the prompt.
function stripFences(text: string): string {
  const fenced = text.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

function validateHtml(html: string): { ok: true } | { ok: false; reason: string } {
  if (!html.toLowerCase().includes("<!doctype html")) return { ok: false, reason: "missing DOCTYPE" };
  if (!html.includes("<article")) return { ok: false, reason: "missing <article>" };
  if (/<script\b/i.test(html)) return { ok: false, reason: "contains <script>" };
  if (/<link\b/i.test(html)) return { ok: false, reason: "contains <link>" };
  return { ok: true };
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const author = body.author?.trim();
  const genre = body.genre?.trim();
  const description = body.description?.trim();
  const longText = body.longText?.trim();
  const imageUrl = body.imageUrl?.trim();

  if (!title || !author || !genre || !description || !longText) {
    return NextResponse.json(
      { error: "title, author, genre, description, longText are all required" },
      { status: 400 }
    );
  }
  if (longText.length > 2000) {
    return NextResponse.json({ error: "longText exceeds 2000 characters" }, { status: 400 });
  }

  let coverPart: { mimeType: string; data: string } | null = null;
  if (imageUrl) {
    try {
      coverPart = await fetchImagePart(imageUrl);
    } catch (err) {
      return NextResponse.json(
        { error: `Cover image could not be loaded: ${(err as Error).message}` },
        { status: 400 }
      );
    }
  }

  const input: GenerateInput = {
    title,
    author,
    genre,
    description,
    longText,
    // Only pass the URL if we successfully fetched it. A URL the model can
    // see but we couldn't fetch is just an invitation to hallucinate.
    coverImageUrl: coverPart && imageUrl ? imageUrl : null,
  };
  const prompt = buildPrompt(input);

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  if (coverPart) parts.push({ inlineData: coverPart });

  let html: string;
  try {
    const ai = getGenAI();
    const res = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.95,
        // Headroom for a full HTML doc + design comments. 2.5 Pro caps at 65k.
        maxOutputTokens: 16000,
      },
    });
    const text = res.text;
    if (!text) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
    }
    html = stripFences(text);
  } catch (err) {
    return NextResponse.json(
      { error: `Generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const validation = validateHtml(html);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `Generated HTML failed validation: ${validation.reason}`, html },
      { status: 502 }
    );
  }

  return NextResponse.json({ html });
}
