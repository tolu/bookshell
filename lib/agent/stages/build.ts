import "server-only";
import { type GenerateInput, coverNote, inputBlock, factsRule } from "../input";
import { type Brief } from "./brief";
import { type Finding } from "@/lib/releases/lint";

// STAGE 2 — the frontend specialist. Executes the AD brief as a single
// self-contained HTML document, and (in the QA loop) revises it against
// concrete findings. This prompt owns the mechanical rules — output contract,
// CSS scoping, the scroll-timeline footguns, contrast pairing, responsive
// cover sizing — that the brief stage doesn't deal with.

function briefBlock(brief: Brief): string {
  const acts = brief.scrollActs
    .map((a, i) => `   ${i + 1}. ${a.title} — ${a.purpose} (transition: ${a.transition})`)
    .join("\n");
  const quotes = brief.pullQuotes.length
    ? brief.pullQuotes.map((q) => `   - "${q.text}" [${q.source}]`).join("\n")
    : "   (none)";
  return `THE BRIEF (your art director's direction — execute it faithfully)
- Concept: ${brief.concept}
- Motif: ${brief.motif}
- Visual system: ${brief.visualSystem}
- Composition: ${brief.composition}
- Typography: ${brief.typography}
- Palette: ${brief.paletteDirection}
- Cover treatment: ${brief.coverTreatment}
- Marketing hook: ${brief.marketingHook}
- Scroll acts:
${acts}
- Pull-quotes to feature verbatim (do not alter or invent others):
${quotes}`;
}

// The mechanical spec — identical between a fresh build and a revise, so it
// lives in one constant.
function mechanicalRules(input: GenerateInput): string {
  return `DESIGN DIRECTIVES (execution)

Discipline
- Realise the brief's three bold moves (composition + typography + visual system) — commit, don't pile on extras.
- State them at the top of the <style> block as comments: /* MOTIF: ... */ /* DESIGN IDEA: ... */ /* VISUAL: ... */ /* PALETTE: ... */

Typography
- Display serif for the title: font-family: "Spectral", "Source Serif Pro", Georgia, serif. (Web fonts won't load — the page falls back to Georgia. Design for that fallback.)
- Sans for UI/meta where appropriate: ui-sans-serif, system-ui, sans-serif.
- Fluid sizing with clamp() throughout. text-wrap: balance on headings, text-wrap: pretty on body copy.
- Line length max 60–72ch on long copy. max-inline-size: 62ch is a sensible default.

Color
- Go immersive, not timid. Full-bleed coloured backgrounds are encouraged; let the colour world shift between scroll acts. Layer radial/conic gradient meshes, blend modes, and CSS grain for depth.
- Commit to ONE deliberate palette and own it. Do NOT use light-dark() and do NOT design for light/dark mode — this is a self-contained art-directed world with fixed colours.
- Set an explicit background on the root .promo surface (and on each act) so the page owns its colours end to end.
- oklch() or color-mix(in oklch, …) for palette math. Define tokens on :scope (NOT :root), e.g.
  :scope { --ink: #1a1a17; --paper: #faf8f3; --accent: oklch(72% 0.13 75); }

CONTRAST — non-negotiable, the #1 failure to prevent (no black-on-black, no white-on-white)
- Pair foreground to background, always. Every element that sets its own background MUST also set its own color in the SAME rule — never inherit a token meant for a different surface. Light background → dark text; dark/saturated background → near-white text.
- Pattern: .promo .act--dark { background: <dark gradient>; color: oklch(96% 0.02 90); } / .promo .act--paper { background: var(--paper); color: var(--ink); }.
- Text over a gradient/image: ensure the worst point under the text still clears contrast, or lay a scrim via ::before. Targets: body ≥ 4.5:1, large/display ≥ 3:1.

Scroll & motion (CSS-only, no JavaScript)
- Build the brief's 3–5 scroll ACTS. Drive transitions with scroll-driven animations: animation-timeline: view() for per-element reveals, animation-timeline: scroll() for background parallax and colour shifts. Pin with position: sticky. Micro-interactions throughout — as many as serve the story.
- CRITICAL fallback — animations only ENHANCE, never gate content. The static, no-animation state must be the complete, readable page. Never leave content at opacity:0 as a default that "only the scroll timeline reveals" — reduced-motion users and browsers without scroll-timeline support would see nothing. Start from a visible baseline, or hide ONLY inside @media (prefers-reduced-motion: no-preference) with a guaranteed reveal.
- Wrap every animation declaration in @media (prefers-reduced-motion: no-preference) { … }.

Scroll-timeline rules (get these exactly right — they silently break animations)
- NEVER put overflow: hidden / auto / scroll (any axis) on .promo or any ancestor of a scroll-animated element. overflow-x: hidden forces the other axis to auto, making it a scroll container; scroll()/view() then bind to it and the animation freezes at frame one. Use overflow-x: clip to crop, or stop overflow at its source.
- animation-range keywords are a CLOSED set: cover, contain, entry, exit, entry-crossing, exit-crossing. There is NO center/middle/start/end — one invalid keyword makes the declaration invalid and the animation won't run. e.g. animation-range: entry 20% cover 60%; or omit it for the default.

Layout
- Semantic HTML: <article>, <header>, <section>, <blockquote>, <figure>, <figcaption>, <dl>.
- Container queries (@container) for responsive decisions — never @media for width (@media is for prefers-reduced-motion only here). The shell provides a container-type: inline-size ancestor.
- Mobile-first (single column, stacked acts), reflow UP at @container breakpoints. Deliberate at ~360px AND ~1440px.

Responsive cover image (a common failure)
- The cover is a fixed-resolution asset. On an <img>: height: auto and cap width so it is NEVER rendered above its natural pixel size. Reserve space with aspect-ratio.
- Mobile: don't let it fill the screen — cap (e.g. max-block-size: 60svh) with object-fit: cover so it crops, not stretches.
- Desktop: when the column is wider than the cover's natural size, STOP scaling — frame the leftover space with colour/shape. Never plain-stretch (no distorting width+height pair).

Accessibility (non-negotiable)
- WCAG AA contrast everywhere. Visible :focus-visible rings on tabbable elements. alt text on every <img>. <h1> for the title, <h2> for sections.

${factsRule(input)}

OUTPUT FORMAT — STRICT
Return ONLY the raw HTML document. No markdown code fences. No commentary before or after. Begin with \`<!DOCTYPE html>\` and end with \`</html>\` — nothing before or after.
Required structure:
1. <!DOCTYPE html>
2. <html lang="nb">
3. <head> containing exactly: <meta charset="utf-8">, <title>${JSON.stringify(input.title)}</title>, and ONE <style> block with ALL CSS.
4. <body> containing exactly ONE <article class="promo">…</article>. Nothing else in <body>.

Forbidden (stripped or breaks downstream):
- <script>, inline event handlers, javascript: URLs. <link>, <meta http-equiv>, <base>. @import. External fonts.
- Repeated site chrome: navigation, header, buy/order buttons, prices, footer. <iframe>, <object>, <embed>, <form>.
- ANY external image URL except the cover URL from INPUT. For all other visuals use CSS gradients, shapes, blend modes, mask-image, conic/radial gradients, ::before/::after, or typography. No stock-photo/placeholder URLs.

CSS RULES (the consumer wraps your CSS in @scope (.release-artifact))
- Tokens on :scope, not :root. Scope every selector under .promo (e.g. .promo .hero) — never bare element selectors. * { box-sizing: border-box; } is fine (scoped by the wrapper).

LENGTH
- A rich, multi-act page: roughly 600–1200 lines of HTML+CSS across the 3–5 acts plus pull-quotes and optional metadata <dl>. Every act earns its scroll — distil, don't pad.`;
}

export function buildFrontendPrompt(input: GenerateInput, brief: Brief): string {
  return `ROLE
You are a master CSS/HTML frontend developer building a single self-contained marketing page from an art director's brief. Your HTML is injected into an existing site shell that provides the header/nav, a sticky price+buy bar, and a footer — you produce ONLY the marketing body, never that chrome.

INPUT
${inputBlock(input)}
- Cover: ${coverNote(input)}

${briefBlock(brief)}

${mechanicalRules(input)}

OUTPUT NOW. HTML only, starting with <!DOCTYPE html>.`;
}

export function buildRevisePrompt(
  input: GenerateInput,
  brief: Brief,
  currentHtml: string,
  issues: Finding[],
  editorNotes?: string | null
): string {
  const issueList = issues.length
    ? issues
        .map((f) => `- [${f.severity}] ${f.message}${f.fix ? ` → Fix: ${f.fix}` : ""}`)
        .join("\n")
    : "(none)";
  const editorBlock = editorNotes?.trim()
    ? `EDITOR'S NOTES (highest priority — a human reviewed the page and asked for these; satisfy them first)
${editorNotes.trim()}

`
    : "";
  return `ROLE
You are a master CSS/HTML frontend developer revising a marketing page to address the editor's notes and fix QA findings WITHOUT losing the design's quality or intent.

INPUT
${inputBlock(input)}
- Cover: ${coverNote(input)}

${briefBlock(brief)}

${editorBlock}QA FINDINGS (concrete defects — resolve every one, keep everything else that works)
${issueList}

${mechanicalRules(input)}

Return the COMPLETE revised HTML document (not a diff, not just the changed parts). OUTPUT NOW. HTML only, starting with <!DOCTYPE html>.`;
}
