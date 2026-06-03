import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "@/lib/gemini/client";
import { type GenerateInput } from "@/lib/gemini/prompt";
import { buildBriefPrompt, BRIEF_SCHEMA, type Brief } from "@/lib/gemini/brief";
import { buildFrontendPrompt, buildRevisePrompt } from "@/lib/gemini/frontend";
import { buildQaPrompt, QA_SCHEMA, type QaVerdict } from "@/lib/gemini/qa";
import { lintArtifact, type Finding } from "@/lib/releases/lint";
import { readImageSize, type ImageSize } from "@/lib/images/dimensions";

export const runtime = "nodejs";
// The brief→build→QA pipeline runs several Gemini calls in sequence and can
// take 1.5–3 min worst case. 300s needs Vercel Pro; on Hobby (60s cap) cut
// MAX_RENDERS to 1 (build only, no revise) to stay under the limit.
export const maxDuration = 300;

// 1 build + up to 2 revises. Early-exit stops the loop as soon as a render is
// lint-clean and the critic passes.
const MAX_RENDERS = 3;

type Body = {
  title?: string;
  author?: string;
  imageUrl?: string;
  genre?: string;
  description?: string;
  longText?: string;
  editorNotes?: string;
  praise?: string;
};

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type CoverPart = { mimeType: string; data: string; size: ImageSize | null };

async function fetchImagePart(url: string): Promise<CoverPart | null> {
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

// Streaming protocol: NDJSON lines, one event per line. `stage` frames mark
// pipeline phases (brief/build/qa/revise); `brief` surfaces the AD output;
// `render-start` tells the client to reset its HTML buffer for a fresh render;
// `token` carries the current render's HTML; `qa` reports a round's verdict.
type QaFinding = { severity: string; message: string };
type Frame =
  | { type: "status"; label: string }
  | { type: "stage"; stage: "brief" | "build" | "qa" | "revise"; label: string; round?: number }
  | { type: "brief"; brief: Brief }
  | { type: "render-start" }
  | { type: "token"; text: string }
  | { type: "qa"; round: number; passed: boolean; findings: QaFinding[] }
  | { type: "done" }
  | { type: "error"; message: string };

function frame(f: Frame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(f) + "\n");
}

// Server-side mirror of the client's stripFences: trim a whole-document code
// fence and anything past </html>, so lint/critic see clean HTML.
function stripHtml(text: string): string {
  const trimmed = text.trim();
  const opening = /^```(?:html)?\s*\n/i;
  const closing = /\n```\s*$/;
  let html = trimmed;
  if (opening.test(html) && closing.test(html)) {
    html = html.replace(opening, "").replace(closing, "").trim();
  }
  const end = html.toLowerCase().lastIndexOf("</html>");
  return end !== -1 ? html.slice(0, end + "</html>".length) : html;
}

function qaIssueToFinding(i: QaVerdict["issues"][number]): Finding {
  return { id: `qa-${i.area}`, severity: i.severity, message: `${i.area}: ${i.what}`, fix: i.fix };
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
  const editorNotes = body.editorNotes?.trim() || null;
  const praise = body.praise?.trim() || null;

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
        let coverPart: CoverPart | null = null;
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
          coverSize: coverPart && imageUrl ? coverPart.size : null,
          editorNotes,
          praise,
        };

        const ai = getGenAI();
        const coverParts = coverPart
          ? [{ inlineData: { mimeType: coverPart.mimeType, data: coverPart.data } }]
          : [];

        // ---- STAGE 1: AD brief (structured JSON) ---------------------------
        send({ type: "stage", stage: "brief", label: "Art director skriver brief…" });
        let brief: Brief;
        try {
          const res = await ai.models.generateContent({
            model: GENERATION_MODEL,
            contents: [{ role: "user", parts: [{ text: buildBriefPrompt(input) }, ...coverParts] }],
            config: {
              temperature: 0.9,
              maxOutputTokens: 6000,
              thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
              responseMimeType: "application/json",
              responseJsonSchema: BRIEF_SCHEMA,
            },
          });
          if (!res.text) throw new Error("tomt svar");
          brief = JSON.parse(res.text) as Brief;
        } catch (err) {
          send({ type: "error", message: `Klarte ikke lage design-brief: ${(err as Error).message}` });
          controller.close();
          return;
        }
        send({ type: "brief", brief });

        // ---- STAGE 2+3: build → QA → revise loop --------------------------
        const sourceText = [title, author, description, longText, editorNotes ?? ""].join("\n");
        let clean = "";
        let reviseIssues: Finding[] = [];

        for (let round = 0; round < MAX_RENDERS; round++) {
          const isRevise = round > 0;
          send(
            isRevise
              ? { type: "stage", stage: "revise", label: `Bygger om (runde ${round + 1})…`, round: round + 1 }
              : { type: "stage", stage: "build", label: "Frontend bygger siden…" }
          );
          send({ type: "render-start" });

          const prompt = isRevise
            ? buildRevisePrompt(input, brief, clean, reviseIssues)
            : buildFrontendPrompt(input, brief);

          const result = await ai.models.generateContentStream({
            model: GENERATION_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }, ...coverParts] }],
            config: {
              temperature: 0.95,
              maxOutputTokens: 36_000,
              thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            },
          });
          let raw = "";
          for await (const chunk of result) {
            const text = chunk.text;
            if (!text) continue;
            raw += text;
            send({ type: "token", text });
          }
          clean = stripHtml(raw);

          // ---- QA gate: deterministic lint + LLM critic -------------------
          send({ type: "stage", stage: "qa", label: `QA vurderer (runde ${round + 1})…`, round: round + 1 });
          const lint = lintArtifact(clean, {
            coverUrl: input.coverImageUrl,
            coverSize: input.coverSize,
            praise,
            sourceText,
          });
          const lintErrors = lint.filter((f) => f.severity === "error");

          let verdict: QaVerdict | null = null;
          try {
            const res = await ai.models.generateContent({
              model: GENERATION_MODEL,
              contents: [{ role: "user", parts: [{ text: buildQaPrompt(input, brief, clean, lint) }] }],
              config: {
                temperature: 0.4,
                maxOutputTokens: 4000,
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                responseMimeType: "application/json",
                responseJsonSchema: QA_SCHEMA,
              },
            });
            if (res.text) verdict = JSON.parse(res.text) as QaVerdict;
          } catch {
            // If the critic fails to produce a verdict, don't block shipping —
            // the deterministic lint still gates, and MAX_RENDERS bounds us.
            verdict = null;
          }

          const verdictIssues = verdict?.issues ?? [];
          const passed = lintErrors.length === 0 && (verdict ? verdict.passed : true);

          send({
            type: "qa",
            round: round + 1,
            passed,
            findings: [
              ...lint.map((f) => ({ severity: f.severity, message: f.message })),
              ...verdictIssues.map((i) => ({ severity: i.severity, message: `${i.area}: ${i.what}` })),
            ],
          });

          if (passed || round === MAX_RENDERS - 1) break;
          reviseIssues = [...lint, ...verdictIssues.map(qaIssueToFinding)];
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
