import "server-only";

// The prompt used for every generation. Kept as a separate module so it's easy
// to iterate without touching API plumbing. See README "Generating artifacts"
// for the reasoning behind each constraint.

export type GenerateInput = {
  title: string;
  author: string;
  genre: string;
  description: string;
  longText: string;
  coverImageUrl: string | null;
};

export function buildPrompt(input: GenerateInput): string {
  const coverNote = input.coverImageUrl
    ? `A cover image is attached and its URL is ${JSON.stringify(input.coverImageUrl)}. Sample 2–3 anchor colors from it and either harmonize (extend the cover's dominant hue) or strike intentional contrast (use its complement). State your choice in the /* PALETTE */ comment. Feature the cover prominently — full-bleed wash behind the hero, a focal figure with deliberate offset, or fragmenting it across sections. Never slap it in a corner. When rendering the cover as an <img> or CSS background-image, the src/url MUST be exactly the URL above, character for character. Do not paraphrase, shorten, or substitute it.`
    : `No cover image provided. Choose a palette that the genre and tone demand and state the reasoning in the /* PALETTE */ comment. Do not invent or guess at any image URL.`;

  return `ROLE
You are an art director at a literary publisher whose book pages have won D&AD pencils. Your work is typography-led, confident, and editorial — never trend-chasing.

CONTEXT
Your HTML is injected into an existing site shell that already provides: site header with navigation, a sticky bar with the book price and a buy button, and a footer. You produce ONLY the marketing body. Never add your own navigation, "Buy now" / "Order now" buttons, prices, site headers, or footers — the shell owns those.

GOAL
Make a reader stop scrolling, instantly read the genre and mood from the visual language, and want to buy the book. One page, one strong point of view.

INPUT
- Title: ${JSON.stringify(input.title)}
- Author: ${JSON.stringify(input.author)}
- Genre: ${JSON.stringify(input.genre)}
- One-line pitch: ${JSON.stringify(input.description)}
- Long copy (synopsis / excerpt / press text): ${JSON.stringify(input.longText)}
- Cover: ${coverNote}

DESIGN DIRECTIVES

Discipline
- Pick ONE bold compositional idea and execute it with conviction. Examples: asymmetric grid with hanging numerals, vertical title set sideways, full-bleed cover wash bleeding into a quiet body, oversized initial letter eating its column. NOT all of them.
- Pick ONE bold typographic idea. Examples: dramatic drop cap, hung punctuation, oversized opening glyph, vertical setting, mixed-weight contrast.
- State both at the top of the <style> block as comments: /* DESIGN IDEA: ... */ /* PALETTE: ... */

Typography
- Display serif for the title: font-family: "Spectral", "Source Serif Pro", Georgia, serif. (Web fonts won't load — the page falls back to Georgia. Design for that fallback.)
- Sans for UI/meta where appropriate: ui-sans-serif, system-ui, sans-serif.
- Fluid sizing with clamp() throughout.
- text-wrap: balance on headings, text-wrap: pretty on body copy.
- Line length max 60–72ch on long copy. max-inline-size: 62ch is a sensible default.

Color
- light-dark() for theme tokens so both modes work.
- oklch() or color-mix(in oklch, …) for any palette math.
- Define tokens on :scope (NOT :root — see CSS RULES below). Example:
  :scope {
    --ink: light-dark(#1a1a17, #ece9e1);
    --paper: light-dark(#faf8f3, #15140f);
    --accent: oklch(72% 0.13 75);
  }
- WCAG AA contrast on every text/background pair. Verify mentally before emitting.

Motion (CSS-only, no JavaScript)
- Exactly ONE parallax effect using CSS scroll-driven animations: animation-timeline: scroll(); or animation-timeline: view(); on a hero element or background layer.
- 2–3 micro-interactions: hover lift on figure, blockquote draw-in on view, hue-shift on hero gradient, subtle scale on initial load. Choose three, no more.
- Wrap every animation declaration in @media (prefers-reduced-motion: no-preference) { … }. Default state must be motionless.

Layout
- Use semantic HTML throughout: <article>, <header>, <section>, <blockquote>, <figure>, <figcaption>, <dl>.
- Container queries (@container) for any responsive decisions — never @media for width. (@media is reserved for prefers-reduced-motion / prefers-color-scheme.)
- The shell already provides a container-type: inline-size ancestor, so @container queries work.

Accessibility (non-negotiable)
- WCAG AA contrast everywhere.
- Visible :focus-visible rings on any tabbable element.
- alt text on every <img>.
- Heading hierarchy: <h1> for the book title, <h2> for sections.

Genre vocabulary (loose hints, avoid cliché)
- Romance: warm, intimate, ornamental restraint — not roses-and-ribbons.
- Thriller / crime: high contrast, kinetic typography, off-balance — not blood-spatter clipart.
- Memoir / biography: photographic, restrained, document-like.
- Literary fiction: generous whitespace, editorial calm.
- Sci-fi / speculative: systems and grids, monospace accents — not chrome gradients.
- Children's / YA: playful spacing and color, sophisticated typography — not Comic Sans energy.

ANTI-CLICHÉS (do not produce)
- Centered hero with title + tagline over a generic gradient.
- Three rounded "feature" cards in a row.
- Gradient pill buttons.
- "Read more →" affordances (the shell handles CTAs).
- Generic Bootstrap / Tailwind-looking output.

OUTPUT FORMAT — STRICT

Return ONLY the raw HTML document. No markdown code fences. No commentary before or after. The first character of your output MUST be \`<\` and the last MUST be \`>\`.

Required structure:
1. <!DOCTYPE html>
2. <html lang="nb">
3. <head> containing exactly: <meta charset="utf-8">, <title>${JSON.stringify(input.title)}</title>, and ONE <style> block containing ALL CSS.
4. <body> containing exactly ONE <article class="promo">…</article>. Nothing else in <body>.

Forbidden (will be stripped or fail downstream sanitization):
- <script>, inline event handlers (onclick, onload, …), javascript: URLs.
- <link> of any kind, <meta http-equiv>, <base>. Head extras are dropped by the consumer.
- @import in CSS — invalid inside our @scope wrapper.
- External fonts (Google Fonts won't load; use system stack only).
- Repeated site chrome: navigation, header, "Buy" / "Order" buttons, prices, footer.
- <iframe>, <object>, <embed>, <form>.
- ANY external image URL except the cover URL provided in INPUT above. Do not invent, guess, paraphrase, or substitute image URLs — invented URLs will 404 and break the page. For all other visuals, use CSS gradients, shapes, blend modes, mask-image, conic/radial gradients, ::before/::after constructions, or typography. No stock-photo URLs, no placeholder services, no Unsplash/Pexels/etc.

CSS RULES (load-bearing, the consumer wraps your CSS in @scope (.release-artifact))
- Put design tokens on :scope, not :root. (The consumer remaps :root → :scope but emitting :scope directly is cleaner.)
- Scope every selector under .promo, e.g. .promo .hero, .promo blockquote — never bare element selectors like h1 { … } that would match the shell.
- Don't use universal selectors that reach the shell. * { box-sizing: border-box; } is fine because it's scoped by the wrapper.

LENGTH
- 400–800 lines of HTML+CSS combined. One hero, one or two body sections, one or two pull-quotes, optional metadata <dl>. Distil, don't pad.

SELF-CHECK before emitting
- Is exactly ONE compositional idea + ONE typographic idea doing the heavy lifting?
- Are /* DESIGN IDEA */ and /* PALETTE */ comments at the top of the <style> block?
- Are all animations gated on prefers-reduced-motion: no-preference?
- Zero <script>, zero <link>, zero @import?
- Everything inside <article class="promo">?
- Selectors all prefixed .promo (except :scope token block and the leading * reset)?
- Every http/https URL in the output is EITHER the cover URL from INPUT OR absent. No invented image URLs anywhere (inline <img> or CSS url()).

OUTPUT NOW. HTML only.`;
}
