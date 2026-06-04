import "server-only";
import { GoogleGenAI } from "@google/genai";

// Single GoogleGenAI instance per server. The SDK is stateless and the client
// is cheap to construct, but keeping one means we read the env once and fail
// fast if it's missing on the first generation attempt.
let cached: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.local.example to .env.local and add a key from https://aistudio.google.com/apikey."
    );
  }
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

// Model used for generation. Gemini 3 Flash (preview) — picked over 2.5 Flash
// because the 3 Flash release notes report 78% on SWE-bench Verified (above
// the 2.5 series and even Gemini 3 Pro), 30% fewer output tokens on average,
// and Google specifically positions it for "interactive applications" and UI
// iteration — i.e. exactly our design-HTML use case. Pricing: $0.50/$3.00 per
// 1M tokens (text in / out), so ~$0.026/page — slightly above 2.5 Flash
// (~$0.021) but the token-efficiency claim narrows that gap and the code-gen
// uplift is the point.
//
// Caveat: -preview means no quality stability guarantee and possible breaking
// changes with two weeks' notice. This is an experiment app, so that's OK.
// Swap to "gemini-2.5-flash" for a stable fallback, or "gemini-3.5-flash"
// (the stable 3-series Flash) once we want lock-in.
export const GENERATION_MODEL = "gemini-3-flash-preview";
