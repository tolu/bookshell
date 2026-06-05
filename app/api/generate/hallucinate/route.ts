import { NextResponse } from "next/server";
import { generateHallucinatedForm } from "@/lib/agent/run-hallucinate";

export const runtime = "nodejs";
// One Gemini call, structured JSON — no request body, no cover, nothing to
// validate. Invents a fictional book to seed the form for demos.
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  try {
    const form = await generateHallucinatedForm();
    return NextResponse.json({ form });
  } catch (err) {
    return NextResponse.json(
      { error: `Klarte ikke hallusinere: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
