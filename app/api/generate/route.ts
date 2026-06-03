import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "@/lib/gemini/client";
import { buildPrompt, type GenerateInput } from "@/lib/gemini/prompt";

export const runtime = "nodejs";
// Generation can take 10–30s on gemini-3-flash-preview. Vercel functions
// default to 10s.
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
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

// Streaming protocol: NDJSON lines. The client reads one line per event.
// Status frames give the user real progress info during the slow parts of
// the request (cover fetch, awaiting first token). Token frames carry the
// model output as it streams. Done/error frames close.
type Frame =
  | { type: "status"; label: string }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

function frame(f: Frame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(f) + "\n");
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (f: Frame) => controller.enqueue(frame(f));
      try {
        let coverPart: { mimeType: string; data: string } | null = null;
        if (imageUrl) {
          send({ type: "status", label: "Henter omslagsbilde…" });
          try {
            coverPart = await fetchImagePart(imageUrl);
          } catch (err) {
            send({
              type: "error",
              message: `Omslagsbildet kunne ikke lastes: ${(err as Error).message}`,
            });
            controller.close();
            return;
          }
        }

        const input: GenerateInput = {
          title,
          author,
          genre,
          description,
          longText,
          coverImageUrl: coverPart && imageUrl ? imageUrl : null,
        };
        const prompt = buildPrompt(input);

        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
          { text: prompt },
        ];
        if (coverPart) parts.push({ inlineData: coverPart });

        send({ type: "status", label: "Sender prompt til Gemini…" });

        const ai = getGenAI();
        const result = await ai.models.generateContentStream({
          model: GENERATION_MODEL,
          contents: [{ role: "user", parts }],
          // thinkingLevel HIGH is already the Gemini 3 default; we set it
          // explicitly so a future SDK/default change can't silently lower
          // reasoning depth on our design task. The prompt's "PLAN BEFORE YOU
          // WRITE" section steers what that thinking covers. includeThoughts
          // stays off so thought parts never enter chunk.text and pollute the
          // streamed HTML.
          config: {
            temperature: 0.95,
            maxOutputTokens: 36_000,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          },
        });

        send({ type: "status", label: "Venter på første tokens…" });

        let firstChunk = true;
        for await (const chunk of result) {
          const text = chunk.text;
          if (!text) continue;
          if (firstChunk) {
            send({ type: "status", label: "Genererer markup…" });
            firstChunk = false;
          }
          send({ type: "token", text });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Prevent intermediaries from buffering the stream.
      "x-accel-buffering": "no",
    },
  });
}
