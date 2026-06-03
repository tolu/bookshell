import "server-only";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "./client";
import { type GenerateInput } from "./input";
import { coverInlineParts, type CoverPart } from "./cover";
import { buildBriefPrompt, BRIEF_SCHEMA, type Brief } from "./stages/brief";

// Stage 1 as one call: art-director brief from the book input. Serves both the
// initial brief and every feedback refinement (the prompt itself decides
// whether to start fresh or revise the prior brief). One structured-JSON Gemini
// call — fast enough to answer inline rather than stream.
export async function generateBrief(
  input: GenerateInput,
  cover: CoverPart | null,
  opts: { feedback?: string | null; priorBrief?: Brief | null } = {}
): Promise<Brief> {
  const res = await getGenAI().models.generateContent({
    model: GENERATION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: buildBriefPrompt(input, { feedback: opts.feedback, priorBrief: opts.priorBrief }) },
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
  return JSON.parse(res.text) as Brief;
}
