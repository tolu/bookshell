import "server-only";
import { type GenerateInput, coverNote, inputBlock, factsRule } from "./prompt";

// STAGE 1 — the art director. Turns book metadata (+ optional editor steer and
// praise) into a structured design brief: the concept and creative decisions,
// inspectable and reusable, that the frontend stage then executes. Separating
// "what should this be" from "write the code" keeps each prompt short and lets
// the user see (and later edit) the thinking.

export type BriefPullQuote = { text: string; source: string };

export type BriefScrollAct = { title: string; purpose: string; transition: string };

export type Brief = {
  concept: string;
  motif: string;
  visualSystem: string;
  composition: string;
  typography: string;
  paletteDirection: string;
  coverTreatment: string;
  scrollActs: BriefScrollAct[];
  marketingHook: string;
  pullQuotes: BriefPullQuote[];
  humanSummary: string;
};

// JSON schema handed to Gemini (responseJsonSchema) so the brief comes back
// machine-parseable instead of as prose we'd have to scrape.
export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    concept: { type: "string", description: "The one-line big idea for the page." },
    motif: {
      type: "string",
      description: "ONE concrete, specific thing from THIS book's text (an object/image/tension), not a genre mood.",
    },
    visualSystem: {
      type: "string",
      description: "The dominant non-typographic system: colour field, gradient mesh, shapes, scale.",
    },
    composition: { type: "string", description: "The one bold layout idea." },
    typography: { type: "string", description: "The one bold typographic idea." },
    paletteDirection: {
      type: "string",
      description: "Palette intent and anchor colours (one committed palette, no light/dark modes).",
    },
    coverTreatment: { type: "string", description: "How the cover image is used, or palette plan if none." },
    scrollActs: {
      type: "array",
      description: "3–5 scroll scenes the reader moves through.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          purpose: { type: "string" },
          transition: { type: "string", description: "What pins/reveals/shifts between this act and the next." },
        },
        required: ["title", "purpose", "transition"],
      },
    },
    marketingHook: { type: "string", description: "The angle that makes a reader want to buy." },
    pullQuotes: {
      type: "array",
      description: "Verbatim fragments to feature, each tagged with its source (excerpt or the praise input).",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          source: { type: "string", description: "'excerpt', 'pitch', or the praise attribution." },
        },
        required: ["text", "source"],
      },
    },
    humanSummary: {
      type: "string",
      description: "2–4 sentence plain-language summary of the design for the user to read.",
    },
  },
  required: [
    "concept",
    "motif",
    "visualSystem",
    "composition",
    "typography",
    "paletteDirection",
    "coverTreatment",
    "scrollActs",
    "marketingHook",
    "pullQuotes",
    "humanSummary",
  ],
} as const;

export function buildBriefPrompt(
  input: GenerateInput,
  opts: { feedback?: string | null; priorBrief?: Brief | null } = {}
): string {
  // Brief iteration: when the editor sends feedback on a prior brief, refine it
  // rather than starting from scratch — keep what works, change per the note.
  const reviseBlock =
    opts.priorBrief && opts.feedback?.trim()
      ? `REVISE THIS BRIEF
You already produced the brief below. The editor has reviewed it and wants changes. Keep everything that works; change only what the feedback asks for (and whatever must follow from it). Return the FULL updated brief in the same schema.

Prior brief:
${JSON.stringify(opts.priorBrief, null, 2)}

Editor feedback (highest priority):
${JSON.stringify(opts.feedback.trim())}

`
      : "";

  return `${reviseBlock}ROLE
You are an art director at a literary publisher whose book pages have won D&AD pencils. Your work is typography-led AND visually immersive: you command colour, shape, scale and motion as much as type. Confident, editorial, art-directed. Bold and intentional — never trend-chasing, but never timid either.

TASK
Produce a DESIGN BRIEF (not code) for a one-page marketing site that makes a reader stop scrolling, instantly read the genre and mood, and want to buy this book. A frontend specialist will build the HTML from your brief, so be concrete and decisive. One page, one strong point of view.

INPUT
${inputBlock(input)}
- Cover: ${coverNote(input)}

THINK, THEN DECIDE
1. MOTIF — read the pitch and excerpt and name ONE concrete, specific thing from THIS book: an object, image, or tension in the actual text (a stopped watch, a tideline, a redacted letter). Not a genre mood. If an EDITOR DIRECTION is given, let it steer the motif and tone above genre defaults.
2. TRANSLATION — note how that motif could become a CSS technique (clip-path fragmentation, a tideline gradient mask, redaction bars), so the build has a concrete hook.
3. COMPOSITION — ONE bold layout idea. TYPOGRAPHY — ONE bold typographic idea. VISUAL SYSTEM — ONE dominant non-typographic system (full-bleed colour field, gradient mesh, big shapes, dramatic scale). Three bold moves working together, not ten.
4. PALETTE — ONE committed palette with anchor colours (NO light/dark modes). If a cover is attached, derive from it.
5. SCROLL — 3–5 acts (scenes) the reader moves through, each with a purpose and the transition that carries them to the next (what pins, reveals, shifts colour).
6. MARKETING HOOK — the single angle that creates desire.
7. PULL-QUOTES — pick verbatim fragments worth featuring.

DISCIPLINE
- Make the page immersive beyond typography: a real visual world (colour, shape, scale), not just nice type.
- Genre vocabulary is a fallback only — a real motif from the text always beats it. Avoid clichés: no centered-hero-over-lazy-gradient, no three feature cards, no generic Bootstrap look.

${factsRule(input)}
- For pullQuotes: every entry's text must be a VERBATIM fragment of the excerpt/pitch OR of the supplied praise. Tag its source. Do not write your own quotes.

OUTPUT
Return ONLY the JSON object matching the provided schema — no prose, no code fences. humanSummary is for the user to read; keep it plain and 2–4 sentences.`;
}
