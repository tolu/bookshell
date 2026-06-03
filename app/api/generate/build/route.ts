import { NextResponse } from "next/server";
import { parseGenerateRequest, buildInput } from "@/lib/agent/input";
import { fetchImagePart, type CoverPart } from "@/lib/agent/cover";
import { runBuild } from "@/lib/agent/run-build";
import { type Brief } from "@/lib/agent/stages/brief";
import { encodeFrame, type BuildFrame } from "@/lib/generate/protocol";

export const runtime = "nodejs";
// One build (or revise) + one QA pass — no auto-loop; the editor drives any
// further revision. A single render fits comfortably under the limit.
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseGenerateRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  if (!body.brief) return NextResponse.json({ error: "brief is required" }, { status: 400 });

  const brief = body.brief as Brief;
  const priorHtml = typeof body.html === "string" ? body.html.trim() : "";
  const revise = priorHtml
    ? { html: priorHtml, notes: typeof body.notes === "string" ? body.notes.trim() || null : null }
    : null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (f: BuildFrame) => controller.enqueue(encodeFrame(f));
      try {
        // The response has already committed to streaming, so a cover failure
        // here is reported as an error frame rather than an HTTP status.
        let cover: CoverPart | null = null;
        if (parsed.fields.imageUrl) {
          send({ type: "status", label: "Henter omslagsbilde…" });
          try {
            cover = await fetchImagePart(parsed.fields.imageUrl);
          } catch (err) {
            send({ type: "error", message: `Omslagsbildet kunne ikke lastes: ${(err as Error).message}` });
            controller.close();
            return;
          }
        }

        const input = buildInput(parsed.fields, cover);
        for await (const frame of runBuild(input, cover, brief, revise)) {
          send(frame);
        }
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
