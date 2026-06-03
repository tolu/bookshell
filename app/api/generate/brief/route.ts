import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "@/lib/gemini/client";
import { type GenerateInput } from "@/lib/gemini/prompt";
import { buildBriefPrompt, BRIEF_SCHEMA, type Brief } from "@/lib/gemini/brief";
import { fetchImagePart, coverInlineParts } from "@/lib/gemini/cover";

export const runtime = "nodejs";
// One Gemini call, structured JSON — fast. Serves the initial brief and every
// freetext-feedback refinement.
export const maxDuration = 60;

type Body = {
  title?: string;
  author?: string;
  imageUrl?: string;
  genre?: string;
  description?: string;
  longText?: string;
  editorNotes?: string;
  praise?: string;
  feedback?: string;
  priorBrief?: Brief;
};

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

  let cover = null;
  if (imageUrl) {
    try {
      cover = await fetchImagePart(imageUrl);
    } catch (err) {
      return NextResponse.json(
        { error: `Omslagsbildet kunne ikke lastes: ${(err as Error).message}` },
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
    coverImageUrl: cover && imageUrl ? imageUrl : null,
    coverSize: cover && imageUrl ? cover.size : null,
    editorNotes: body.editorNotes?.trim() || null,
    praise: body.praise?.trim() || null,
  };

  try {
    const res = await getGenAI().models.generateContent({
      model: GENERATION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildBriefPrompt(input, { feedback: body.feedback, priorBrief: body.priorBrief }) },
            ...coverInlineParts(cover),
          ],
        },
      ],
      config: {
        temperature: 0.9,
        maxOutputTokens: 6000,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json",
        responseJsonSchema: BRIEF_SCHEMA,
      },
    });
    if (!res.text) throw new Error("tomt svar fra modellen");
    const brief = JSON.parse(res.text) as Brief;
    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json(
      { error: `Klarte ikke lage design-brief: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
