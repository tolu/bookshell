import "server-only";

// Shared building blocks for the generation pipeline. The page is produced in
// stages — an AD brief (lib/gemini/brief.ts), a frontend build and revise
// (lib/gemini/frontend.ts), and a QA critic (lib/gemini/qa.ts). The fragments
// that every stage needs to agree on (the input data, the cover handling, the
// no-fabrication contract) live here so they can't drift apart.
// See README "Generating artifacts" for the reasoning behind each constraint.

export type GenerateInput = {
  title: string;
  author: string;
  genre: string;
  description: string;
  longText: string;
  coverImageUrl: string | null;
  coverSize: { width: number; height: number } | null;
  /** Optional free-text steering from an editor — weighted above genre defaults. */
  editorNotes?: string | null;
  /** Optional real quotes/reviews the editor supplies — the only legit source of praise. */
  praise?: string | null;
};

// The cover guidance, including the intrinsic-size cap that prevents the
// upscale-blur failure. Shared by brief (colour direction) and frontend (render).
export function coverNote(input: GenerateInput): string {
  const sizeNote = input.coverSize
    ? ` The cover's intrinsic pixel size is ${input.coverSize.width}×${input.coverSize.height}. NEVER render it larger than that on either axis — upscaling makes it soft and cheap-looking. Scale DOWN to fit only; cap the rendered size (e.g. max-inline-size: min(100%, ${input.coverSize.width}px)). On wide screens, when the column outgrows the cover's natural size, frame the leftover space with color/shape — do not stretch the image to fill it.`
    : ` Treat the cover as a fixed-resolution asset: never blow it past its natural size (it goes soft). Cap with max-inline-size and let height follow via height:auto.`;

  return input.coverImageUrl
    ? `A cover image is attached and its URL is ${JSON.stringify(input.coverImageUrl)}. Sample 2–3 anchor colors from it and either harmonize (extend the cover's dominant hue) or strike intentional contrast (use its complement). Feature the cover prominently — full-bleed wash behind the hero, a focal figure with deliberate offset, or fragmenting it across sections. Never slap it in a corner.${sizeNote} When rendering the cover as an <img> or CSS background-image, the src/url MUST be exactly the URL above, character for character. Do not paraphrase, shorten, or substitute it.`
    : `No cover image provided. Choose a palette that the genre and tone demand. Lean harder into a fully art-directed visual world — colour fields, gradient mesh, shape and scale — since there is no jacket to carry it. Do not invent or guess at any image URL.`;
}

// The core book data block, shared verbatim across stages.
export function inputBlock(input: GenerateInput): string {
  const lines = [
    `- Title: ${JSON.stringify(input.title)}`,
    `- Author: ${JSON.stringify(input.author)}`,
    `- Genre: ${JSON.stringify(input.genre)}`,
    `- One-line pitch: ${JSON.stringify(input.description)}`,
    `- Long copy (synopsis / excerpt / press text): ${JSON.stringify(input.longText)}`,
  ];
  if (input.editorNotes?.trim()) {
    lines.push(
      `- EDITOR DIRECTION (weight this heavily, above genre defaults — the editor is steering this campaign): ${JSON.stringify(input.editorNotes.trim())}`
    );
  }
  if (input.praise?.trim()) {
    lines.push(
      `- PRAISE / REVIEWS (real, editor-supplied — the ONLY legitimate source of external quotes/ratings; feature verbatim, attribute as given): ${JSON.stringify(input.praise.trim())}`
    );
  }
  return lines.join("\n");
}

// The no-fabrication contract, phrased so it adapts to whether praise was given.
export function factsRule(input: GenerateInput): string {
  const praiseClause = input.praise?.trim()
    ? `External quotes, star ratings and review pull-lines are allowed ONLY when they appear in the PRAISE / REVIEWS input above — render those verbatim with their given attribution.`
    : `No praise was supplied, so include NO review quotes, star ratings, blurbs, or named endorsers at all.`;
  return `FACTS — invent NOTHING (as important as the URL rule)
- Use ONLY the data in INPUT. Every word of copy must come from the title/author/genre/pitch/excerpt, the editor direction, the supplied praise, neutral framing ("A novel", "Roman"), or your own visual/structural labelling — nothing else.
- ${praiseClause}
- Do NOT fabricate award badges, bestseller/sales claims, author biography, publication date, page count, ISBN, or any fact not present in INPUT.
- Pull-quotes from the book must be VERBATIM fragments of the supplied pitch or excerpt. If the input doesn't support a section, don't invent one to fill space.`;
}
