import "server-only";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "./client";
import {
  buildHallucinatePrompt,
  HALLUCINATE_SCHEMA,
  GENRE_POOL,
  type HallucinatedForm,
} from "./stages/hallucinate";

// Demo helper: invent a whole book in one structured-JSON call. A random seed
// genre is injected so repeated calls roam across genres instead of clustering;
// high temperature + low thinking keeps it bold, varied and fast (no reasoning
// to do here — just commit to the tropes).
export async function generateHallucinatedForm(): Promise<HallucinatedForm> {
  const seed = GENRE_POOL[Math.floor(Math.random() * GENRE_POOL.length)] ?? "Cosy Mystery";
  const res = await getGenAI().models.generateContent({
    model: GENERATION_MODEL,
    contents: [{ role: "user", parts: [{ text: buildHallucinatePrompt(seed) }] }],
    config: {
      temperature: 1.1,
      maxOutputTokens: 4000,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseJsonSchema: HALLUCINATE_SCHEMA,
    },
  });
  if (!res.text) throw new Error("tomt svar fra modellen");
  return JSON.parse(res.text) as HallucinatedForm;
}
