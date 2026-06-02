# Elate Bok — Next.js shell + AI-generated release pages

A Next.js (App Router) demo of one way to do hybrid AI-rendered pages:

- **Sanity holds the index.** Slugs, the pointer to each generated HTML file, SEO fields, status.
- **Next.js owns the shell.** Site header, sticky buy bar, footer, page metadata, JSON-LD, canonical URL. Everything search engines and the buy flow care about.
- **The generated page is rendered server-side into `<main>`**, with its CSS scoped so it can't reach the shell.

Sanity is faked with a static JSON file so the demo runs without external services.

## Run

```bash
npm install
cp .env.local.example .env.local   # add GEMINI_API_KEY (only needed for /generate)
npm run dev                        # or: npm run build && npm start
```

- `/` — minimal home page with one featured release
- `/releases` — listing of published releases (drafts excluded)
- `/releases/alt-starter-med-en-droem` — the main example: shell + injected artifact
- `/releases/under-nordlyset` — second example with different artifact styling
- `/releases/fjellet-som-husket` — 404 (this one is a draft)
- `/generate` — form that asks Gemini to produce a fresh marketing artifact and save it as a new release

## How it maps to the real thing

| Demo (this repo) | Production |
|---|---|
| `lib/sanity/dataset.json` + `releases.ts` | `@sanity/client` GROQ queries (CDN endpoint). The GROQ equivalents are in comments in `releases.ts`. |
| `content/artifacts/*.html` read from disk | `artifactRef` is a Vercel Blob URL or Sanity file asset URL; `loadRawArtifact` already branches on `http(s)://` and does `fetch()`. |
| Regex sanitization + native `@scope` CSS wrapper in `lib/releases/body.ts` | Same approach if the generator is trusted; swap to `sanitize-html` + PostCSS + CSP if not. See "Sanitization" below. |
| Build-time `generateStaticParams` | Same, plus on-demand ISR: a Sanity publish webhook calls `revalidatePath('/releases/[slug]')`. |

## Who owns what

- **Sanity is the index, not the page.** A `bookRelease` record holds the slug, the book it points at, the artifact filename, status, publish date, template, version, and SEO fields. The HTML body is something it points at — never something it contains.
- **The shell owns SEO and the buy flow.** `generateMetadata`, the Book/Offer/Person JSON-LD, the canonical URL, and the sticky buy bar are all rendered from the Sanity record. A broken artifact can't break any of this, because none of it depends on what the generator produced.
- **The artifact owns just the visual body.** It's fetched, sanitized, and CSS-scoped server-side in `getReleaseBody`, then dropped into `<main>`. The "Sanitization" section below has the details.

## CSS scoping

Each artifact's `<style>` block is wrapped in native [`@scope`](https://developer.mozilla.org/en-US/docs/Web/CSS/@scope):

```css
@scope (.release-artifact) { /* artifact CSS, untouched */ }
```

The browser handles every selector, at-rule, and inheritance boundary correctly — no regex, no parser, no edge cases. The only fixup is remapping the artifact's own `:root`/`html`/`body` selectors to `:scope` so their custom-property declarations land on the wrapper instead of the document root. Shipped in all evergreen browsers (Chrome 118+, Safari 17.4+, Firefox 128+).

Drop to Shadow DOM only if you also need to block inherited fonts and colors from the shell — `@scope` doesn't stop inheritance, just selector matching.

## Sanitization — what we do and don't

What we do, in [`lib/releases/body.ts`](lib/releases/body.ts):

- **Extract `<style>` blocks and wrap them in `@scope`** — keeps the artifact's CSS away from the shell.
- **Strip every `<script>…</script>`** — removes both inline and remote scripts in one pass.
- **Strip inline event handlers** (`onclick`, `onerror`, `onload`, …) — closes the most common inline XSS path.
- **Rewrite `javascript:` URLs in `href`/`src` to `"#"`** — neutralizes the classic link-based vector.
- **Extract `<body>…</body>`** — drops `<head>`, removing `<meta http-equiv="refresh">`, `<link rel="preload" as="script">`, base-tag hijacks.
- **Wrap the result in `<div class="release-artifact">`** — gives the `@scope` CSS something to target.

What we don't, and why — the trust model is a generator we own pointed at by Sanity records our editors control:

- **No HTML parser; regex against raw HTML.** Defeatable by nested or malformed tags, but unnecessary against a generator we own.
- **No tag or attribute allowlist.** Things like `<iframe srcdoc>`, `<object>`, `<form action="javascript:">`, `<svg><script>` would pass; same reason.
- **No CSS content filter.** `@import url(…)` and `url("data:…")` inside artifact CSS survive scoping.
- **No URL or domain allowlist, timeout, or size cap on remote `artifactRef` fetches.** The ref is editor-controlled, not user-controlled.
- **No `Content-Security-Policy` header on the route.** Would be the strongest backstop, deliberately left out to keep the demo minimal.

If the trust model weakens (user-submitted artifacts, a third-party generator, etc.):

- Swap the regex sanitizer for `sanitize-html` or DOMPurify via `linkedom` — a real parsed-DOM allowlist.
- Filter the CSS with PostCSS — strip `@import`, validate `url()` schemes.
- Add a CSP on the dynamic route — `default-src 'self'; object-src 'none'; frame-ancestors 'none'`.
- Render in `<iframe sandbox>` — a real boundary, but you lose inline SSR and SEO.

## Generating artifacts

`/generate` is a form that asks Gemini for a fresh marketing artifact. The cover image (if you give a URL) is fetched server-side and sent to the model as inline data so it can read the palette.

**Model — `gemini-3-flash-preview`.** Picked over `gemini-2.5-flash` because the [Gemini 3 Flash release](https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/) reports 78% on SWE-bench Verified (above the 2.5 series and even Gemini 3 Pro), 30% fewer output tokens on average, and Google specifically positions it for "interactive applications" and UI iteration — which is exactly what we're doing. Pricing $0.50 / $3.00 per 1M tokens (in / out) → ~$0.026 per page, a touch above 2.5 Flash (~$0.021) but the token-efficiency claim narrows that gap and the code-gen improvement is the point. The `-preview` tag means no stability guarantee — fine for an experiment app. Swap to `gemini-2.5-flash` for a stable fallback or `gemini-3.5-flash` for the stable 3-series Flash once you want lock-in.

Pipeline:

1. Form POSTs `{ title, author, genre, description, longText, imageUrl }` to `/api/generate`.
2. The route fetches the cover (checks MIME, caps at 8 MB, 8 s timeout), builds the prompt, calls the model.
3. The response is stripped of code fences (in case the model adds markdown despite instructions) and checked for the required structure (`<!doctype html>`, `<article>`, no `<script>`, no `<link>`).
4. The result is shown in a `sandbox=""` iframe.
5. "Save as release" POSTs to `/api/save-artifact`, which writes the HTML to `content/artifacts/<slug>.html`, appends `book` + `bookRelease` (status: published) records to `dataset.json`, and calls `revalidatePath` for `/releases` and the new slug. The release is then live in the listing and shell-wrapped at `/releases/<slug>` without a rebuild.

The dataset is read from disk at request time (not via a static `import`), so newly saved releases show up immediately in both `next dev` and `next start`. See `lib/sanity/releases.ts`.

The prompt lives in [`lib/gemini/prompt.ts`](lib/gemini/prompt.ts). Notes on its design:

- **Sets the role.** "Art director at a literary publisher whose pages have won D&AD pencils." Gives the model a higher bar than "make it nice".
- **Explains the shell.** The model is told its HTML gets injected into a page that already has nav, a sticky buy bar, and a footer; it's told not to add its own.
- **Forces a single bold idea.** Pick ONE compositional idea and ONE typographic idea, and commit to both in `/* DESIGN IDEA */` and `/* PALETTE */` comments at the top of the style block.
- **Lists what to avoid.** A concrete anti-cliché list (centered hero on a gradient, three rounded feature cards, gradient pill buttons) steers harder than positive direction alone.
- **Strict output format.** First character `<`, last `>`, no code fences; required structure (`<!doctype>`, `<html lang="nb">`, `<head>` with ONE `<style>`, `<body>` with ONE `<article class="promo">`).
- **Bans the things the sanitizer would silently strip.** `<script>`, `<link>`, `@import`, inline event handlers — so the model emits clean output instead of decorated HTML that gets gutted.
- **`@scope`-aware.** Tells the model to put tokens on `:scope` (which matches our wrapper) and to prefix selectors with `.promo`, avoiding reliance on our `:root`→`:scope` remap.
- **Motion is gated.** Every animation rule must sit inside `@media (prefers-reduced-motion: no-preference)`; the default state is motionless.
- **Self-check before answering.** A short checklist at the end nudges the model to verify its own output.

The prompt went through four versions:

- v1 vague ("make it stunning") → generic output.
- v2 added role + format → still safe and Bootstrap-y.
- v3 added context, discipline, anti-clichés → a real jump in quality.
- v4 added `:scope` guidance, banned `@import`, and tightened the self-check.

## Files worth reading first

- `app/releases/[slug]/page.tsx` — ties it together (thin: resolve → fetch → compose)
- `lib/sanity/releases.ts` — faked Sanity client; GROQ equivalents in comments
- `lib/releases/body.ts` — fetch + sanitize + scope (the injection mechanic)
- `lib/gemini/prompt.ts` — the generation prompt
- `components/release-shell.tsx` and `book-json-ld.tsx` — the SEO + buy surface
