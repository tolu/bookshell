import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "@/lib/gemini/client";
import { type GenerateInput } from "@/lib/gemini/prompt";
import { type Brief } from "@/lib/gemini/brief";
import { buildFrontendPrompt, buildRevisePrompt } from "@/lib/gemini/frontend";
import { buildQaPrompt, QA_SCHEMA, type QaVerdict } from "@/lib/gemini/qa";
import { lintArtifact } from "@/lib/releases/lint";
import { fetchImagePart, coverInlineParts } from "@/lib/gemini/cover";

export const runtime = "nodejs";
// One build (or revise) + one QA pass — no auto-loop; the editor drives any
// further revision. A single render fits comfortably under the limit.
export const maxDuration = 120;

type Body = {
  title?: string;
  author?: string;
  imageUrl?: string;
  genre?: string;
  description?: string;
  longText?: string;
  editorNotes?: string;
  praise?: string;
  brief?: Brief;
  html?: string; // present → revise the prior render
  notes?: string; // editor's technical notes for the revise
};

// NDJSON frames: status milestones, HTML tokens, then a single qa verdict.
type QaFinding = { severity: string; message: string };
type Frame =
  | { type: "status"; label: string }
  | { type: "token"; text: string }
  | { type: "qa"; passed: boolean; findings: QaFinding[]; critic: QaVerdict | null }
  | { type: "done" }
  | { type: "error"; message: string };

function frame(f: Frame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(f) + "\n");
}

// Server mirror of the client's fence-strip so lint/critic see clean HTML.
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
  const praise = body.praise?.trim() || null;
  const editorNotes = body.editorNotes?.trim() || null;
  const notes = body.notes?.trim() || null;

  if (!title || !author || !genre || !description || !longText) {
    return NextResponse.json(
      { error: "title, author, genre, description, longText are all required" },
      { status: 400 }
    );
  }
  if (!body.brief) {
    return NextResponse.json({ error: "brief is required" }, { status: 400 });
  }
  const brief = body.brief;
  const priorHtml = body.html?.trim() || null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (f: Frame) => controller.enqueue(frame(f));
      try {
        let cover = null;
        if (imageUrl) {
          send({ type: "status", label: "Henter omslagsbilde…" });
          try {
            cover = await fetchImagePart(imageUrl);
          } catch (err) {
            send({ type: "error", message: `Omslagsbildet kunne ikke lastes: ${(err as Error).message}` });
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
          coverImageUrl: cover && imageUrl ? imageUrl : null,
          coverSize: cover && imageUrl ? cover.size : null,
          editorNotes,
          praise,
        };

        const ai = getGenAI();
        const isRevise = Boolean(priorHtml);
        const sourceText = [title, author, description, longText, editorNotes ?? ""].join("\n");

        // On a revise, the prior render's own lint findings + the editor's notes
        // drive the change.
        const prompt = isRevise
          ? buildRevisePrompt(
              input,
              brief,
              priorHtml!,
              lintArtifact(priorHtml!, {
                coverUrl: input.coverImageUrl,
                coverSize: input.coverSize,
                praise,
                sourceText,
              }),
              notes
            )
          : buildFrontendPrompt(input, brief);

        send({ type: "status", label: isRevise ? "Bygger om siden…" : "Frontend bygger siden…" });

        const result = await ai.models.generateContentStream({
          model: GENERATION_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }, ...coverInlineParts(cover)] }],
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
        const clean = stripHtml(raw);

        // QA gate — deterministic lint + LLM critic, reported, not auto-acted.
        send({ type: "status", label: "QA vurderer siden…" });
        const lint = lintArtifact(clean, {
          coverUrl: input.coverImageUrl,
          coverSize: input.coverSize,
          praise,
          sourceText,
        });
        const lintErrors = lint.filter((f) => f.severity === "error");

        let critic: QaVerdict | null = null;
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
          if (res.text) critic = JSON.parse(res.text) as QaVerdict;
        } catch {
          critic = null;
        }

        send({
          type: "qa",
          passed: lintErrors.length === 0 && (critic ? critic.passed : true),
          findings: lint.map((f) => ({ severity: f.severity, message: f.message })),
          critic,
        });
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
      "x-accel-buffering": "no",
    },
  });
}
