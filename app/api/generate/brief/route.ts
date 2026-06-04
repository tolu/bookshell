import { NextResponse } from "next/server";
import { parseGenerateRequest, buildInput, type GenerateRequestBody } from "@/lib/agent/input";
import { fetchImagePart, type CoverPart } from "@/lib/agent/cover";
import { generateBrief } from "@/lib/agent/run-brief";
import { type Brief } from "@/lib/agent/stages/brief";

export const runtime = "nodejs";
// One Gemini call, structured JSON — fast. Serves the initial brief and every
// freetext-feedback refinement.
export const maxDuration = 60;

// Initial brief, plus every feedback refinement (feedback + the prior brief).
type BriefBody = GenerateRequestBody & { feedback?: string; priorBrief?: Brief };

export async function POST(req: Request): Promise<Response> {
  let body: BriefBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseGenerateRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  // The brief endpoint answers in plain JSON, so a cover failure is a 400.
  let cover: CoverPart | null = null;
  if (parsed.fields.imageUrl) {
    try {
      cover = await fetchImagePart(parsed.fields.imageUrl);
    } catch (err) {
      return NextResponse.json(
        { error: `Omslagsbildet kunne ikke lastes: ${(err as Error).message}` },
        { status: 400 }
      );
    }
  }

  try {
    const brief = await generateBrief(buildInput(parsed.fields, cover), cover, {
      feedback: body.feedback,
      priorBrief: body.priorBrief ?? null,
    });
    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json(
      { error: `Klarte ikke lage design-brief: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
