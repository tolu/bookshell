import "server-only";

// DEMO HELPER — hallucinate a whole book out of thin air. Unlike the brief/build/
// qa stages (which are bound by the no-fabrication contract in lib/agent/input.ts),
// this stage's entire job IS to fabricate: it invents a fictional book so the
// /generate flow can be showcased in one click. It is deliberately self-contained
// and shares nothing with the real pipeline so the two can't entangle.
//
// Variety is forced by injecting a random seedGenre (picked in run-hallucinate)
// rather than trusting temperature alone — identical prompts otherwise cluster on
// the same handful of "safe" genres. Once a genre is chosen the model is told to
// commit relentlessly to its tropes, stereotypical to the point of being funny.

/** The fields Hallucinate fills. No imageUrl (no cover) and no editorNotes (the
 *  human's steering knob, left empty on purpose). Maps onto a subset of FormState. */
export type HallucinatedForm = {
  title: string;
  author: string;
  genre: string;
  description: string;
  longText: string;
  praise: string;
};

// JSON schema handed to Gemini (responseJsonSchema) so the result drops straight
// into the form with no scraping.
export const HALLUCINATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The book's title. Lean hard into the genre — make it unmistakable." },
    author: { type: "string", description: "A plausible, genre-appropriate author name (invented)." },
    genre: {
      type: "string",
      description: "The genre label, optionally with a subgenre, e.g. 'Cosy Mystery' or 'Grimdark Fantasy · Epic'.",
    },
    description: { type: "string", description: "A single punchy one-sentence pitch dripping with the genre." },
    longText: {
      type: "string",
      description:
        "120–250 words of jacket / synopsis copy. Full of the genre's signature beats, settings and stock characters — stereotypical to the point of being funny, but written straight.",
    },
    praise: {
      type: "string",
      description:
        "2–4 over-the-top blurb lines, one per line, format `★★★★★ «quote» — Source`. Invent the sources (genre-flavoured outlets/authors). Gleefully hyperbolic.",
    },
  },
  required: ["title", "author", "genre", "description", "longText", "praise"],
} as const;

// A wide spread of genres so repeated clicks visibly roam. The model picks none of
// this itself — run-hallucinate selects one at random and pins the prompt to it.
export const GENRE_POOL: string[] = [
  "Cosy Mystery",
  "Grimdark Fantasy",
  "Scandinavian Noir",
  "Hardboiled Sci-Fi Noir",
  "Regency Romance",
  "Cosmic Horror",
  "Literary Autofiction",
  "Cyberpunk Thriller",
  "YA Dystopia",
  "Airport Techno-Thriller",
  "Magical Realism",
  "Military Sci-Fi",
  "Gothic Romance",
  "Splatterpunk Horror",
  "Weird Western",
  "Climate Fiction",
  "Cold War Spy Thriller",
  "Epic High Fantasy",
  "Dark Academia",
  "Steamy Bodice-Ripper",
];

export function buildHallucinatePrompt(seedGenre: string): string {
  return `ROLE
You are a wildly over-caffeinated publishing intern with an encyclopaedic, slightly embarrassing knowledge of genre fiction. You LOVE a cliché.

TASK
Invent a brand-new fictional book in this exact genre: ${JSON.stringify(seedGenre)}.
Then commit to that genre RELENTLESSLY. The title, author, pitch, jacket copy and praise must all scream "${seedGenre}". Lean so hard into the genre's tropes, settings, character archetypes and stock phrasing that it becomes a little funny in how stereotypical it is — but write it completely straight, as if it were a real catalogue entry. No winking, no parody labels.

RULES
- This is fiction. Fabricate everything freely — that is the entire point. Invent the author, the world, the quotes, the review sources.
- Write the book's copy in ENGLISH.
- praise: invent the sources too, and make them genre-flavoured (the kind of outlet or author who would gush about THIS genre). Each line: ★★★★★ «quote» — Source.
- Do NOT mention a cover image or an editor.
- Stay inside ${JSON.stringify(seedGenre)} — do not drift to a neighbouring genre.

OUTPUT
Return ONLY the JSON object matching the provided schema — no prose, no code fences.`;
}
