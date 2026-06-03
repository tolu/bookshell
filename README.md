# Elate Bok — Next.js shell + AI-generated release pages

A Next.js (App Router) demo of one way to do hybrid AI-rendered pages:

- **Sanity holds the index.** Slugs, the pointer to each generated HTML file, SEO fields, status.
- **Next.js owns the shell.** Site header, sticky buy bar, footer, page metadata, JSON-LD, canonical URL. Everything search engines and the buy flow care about.
- **The generated page is rendered server-side into `<main>`**, with its CSS scoped so it can't reach the shell and its stacking context isolated so it can't paint over it.

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
| `lib/storage` — disk locally, Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set | Same module; could swap the Blob impl for any object store with the same four-method API. |
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

## Stacking context — the artifact stays under the shell

`@scope` limits *selector matching*; it does **not** create a [stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context) or contain positioning. So an artifact's own `position: sticky` pins, scroll-driven layers, or large `z-index` values resolve in the **root** stacking context — and because the artifact is injected *after* the shell chrome in the DOM, they will paint over the sticky site header (`.shell-header`, `z-index: 10`) and the buy bar (`.bar`, `z-index: 8`) instead of scrolling underneath them.

The fix is one rule on the shell-owned artifact wrapper `<main>` ([`app/globals.css`](app/globals.css)):

```css
.release-body { isolation: isolate; }
```

`isolation: isolate` puts the whole artifact in its own stacking context beneath the chrome, so any internal `z-index` — even `9999` — is trapped below the header and bar. It's deliberately **not** `overflow` / `transform` / `contain`: each of those would create a scroll container or a new containing block and break the artifact's `animation-timeline: scroll()/view()` scroll-driven animations. Applied to the `<main>` (which the artifact can't restyle), so no generated page can override it.

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

## Storage — disk locally, Vercel Blob on production

The dataset and generated artifacts live behind a single module, [`lib/storage`](lib/storage). Four methods, two implementations:

| | `disk.ts` (local dev) | `blob.ts` (Vercel) |
|---|---|---|
| `getDataset()` | reads `lib/sanity/dataset.json` | reads `dataset.json` blob; seeds it from the bundled static JSON on first request if the blob is missing |
| `saveDataset(d)` | writes `lib/sanity/dataset.json` | writes the `dataset.json` blob with `cacheControlMaxAge: 0` |
| `getArtifact(ref)` | bare filename → disk; URL → fetch | same |
| `saveArtifact(slug, html)` | writes `content/artifacts/<slug>.html`, returns the filename | uploads to `artifacts/<slug>.html` blob, returns the public URL |

Mode is picked at module load: `BLOB_READ_WRITE_TOKEN` set → Blob, unset → disk. Vercel injects the token automatically when you connect a Blob store to the project; locally, set it in `.env.local` to test the Blob path against the same store, or leave it unset for pure-disk dev.

**Bundled artifacts stay on disk in both modes.** The five seed artifacts in `content/artifacts/` ship with the deployment (they're committed in the repo, included in the serverless function bundle). Their `artifactRef` is the bare filename — `getArtifact()` reads them from disk on Vercel too. Only artifacts generated against the deployed `/generate` go through Blob. Cheaper, faster, fewer round-trips.

**First-boot seed.** On the first request after a fresh deploy, `getDataset()` `head()`s the blob, gets a `BlobNotFoundError`, reads the bundled `lib/sanity/dataset.json`, and `put()`s it as the initial blob. Subsequent requests read from Blob exclusively. **After the first seed, locally committed changes to `dataset.json` do NOT propagate to the deployment** — Blob is the source of truth. To force a re-seed, delete the `dataset.json` blob via the Vercel dashboard.

Read-modify-write on `saveDataset` is **not atomic** — two concurrent `/api/save-artifact` calls could race and one save would be lost. Fine for the single-author demo behind a password; a real system would put the dataset in a DB with transactions.

**Side effect of the migration:** every route that reads from storage is now dynamic (`ƒ`) rather than statically prerendered (`○` / `●`). The dataset is mutable, so reads use `cache: "no-store"` to bypass the Blob CDN. Want CDN caching back? Switch to `next: { revalidate: 30 }` in `blob.ts` and rely on `revalidatePath` to invalidate the route cache on save.

## Generating artifacts

`/generate` is a form that asks Gemini for a fresh marketing artifact. The cover image (if you give a URL) is fetched server-side and sent to the model as inline data so it can read the palette.

**Model — `gemini-3-flash-preview`.** Picked over `gemini-2.5-flash` because the [Gemini 3 Flash release](https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/) reports 78% on SWE-bench Verified (above the 2.5 series and even Gemini 3 Pro), 30% fewer output tokens on average, and Google specifically positions it for "interactive applications" and UI iteration — which is exactly what we're doing. Pricing $0.50 / $3.00 per 1M tokens (in / out) → ~$0.026 per page, a touch above 2.5 Flash (~$0.021) but the token-efficiency claim narrows that gap and the code-gen improvement is the point. The `-preview` tag means no stability guarantee — fine for an experiment app. Swap to `gemini-2.5-flash` for a stable fallback or `gemini-3.5-flash` for the stable 3-series Flash once you want lock-in.

**It's a human-in-the-loop pipeline, not a single call** — split across two endpoints, [`app/api/generate/brief/route.ts`](app/api/generate/brief/route.ts) and [`app/api/generate/build/route.ts`](app/api/generate/build/route.ts). The editor gates every stage: they approve (or redirect) the creative brief before any HTML is built, and approve (or revise) the built page before it's saved. The spec the model must obey (forbidden elements, the scroll-timeline footguns, contrast pairing, no fabricated facts, cover sizing) lives once in a deterministic linter, [`lib/releases/lint.ts`](lib/releases/lint.ts), that both the prompts and the QA gate reference — so a rule is written and enforced in one place.

1. The form POSTs `{ title, author, genre, description, longText, imageUrl, editorNotes?, praise? }` to **`/api/generate/brief`**. `editorNotes` is optional free-text that steers the whole run; `praise` is optional editor-supplied quotes/reviews — the *only* legitimate source of review pull-quotes or star ratings (with both blank, none of that is allowed). The cover (if a URL is given) is fetched server-side — MIME-checked, 8 MB / 8 s capped, shared by both endpoints via [`lib/gemini/cover.ts`](lib/gemini/cover.ts) — and its intrinsic pixel size is decoded ([`lib/images/dimensions.ts`](lib/images/dimensions.ts)) so the prompt can forbid upscaling it.
2. **Stage 1 — AD brief.** [`lib/gemini/brief.ts`](lib/gemini/brief.ts) asks Gemini for a *structured-JSON* design brief (concept, motif, visual system, palette, 3–5 scroll acts, marketing hook, verbatim pull-quotes), returned as plain JSON (not streamed — it's small and fast). The brief is the inspectable creative direction; splitting it from the build keeps each prompt short and lets the editor steer before any expensive HTML is generated.
3. **Brief review loop.** The brief is shown human-readably under "Forhåndsvisning". The editor either **approves** it → build, or types **freetext feedback** → the form re-POSTs `{ …inputs, feedback, priorBrief }` to the same endpoint, which prepends a "REVISE THIS BRIEF" block and returns a refined brief. Repeat until approved. No HTML is built until the editor commits.
4. **Stage 2 — frontend build.** On approval the form POSTs `{ …inputs, brief }` to **`/api/generate/build`**, which executes the brief as one self-contained HTML document ([`lib/gemini/frontend.ts`](lib/gemini/frontend.ts)), **streamed token-by-token** as NDJSON. One render — no auto-loop.
5. **Stage 3 — QA gate (advisory).** The finished HTML is run through the deterministic linter *and* an LLM critic ([`lib/gemini/qa.ts`](lib/gemini/qa.ts)) that scores what the linter can't — concept, sellability, hierarchy, copy — grounded by the lint findings. The combined verdict is **shown to the editor, not auto-acted**: the human decides whether it's good enough. (The sanitizer still strips anything dangerous on render regardless of the verdict.)
6. **Build review loop.** The editor sees the preview iframe + QA panel + a box for their own **technical notes**. They either **save**, or type notes and **request changes** → the form re-POSTs `{ …inputs, brief, html, notes }` to the build endpoint, which lints the prior HTML, ranks the editor's notes above the lint findings ([`buildRevisePrompt`](lib/gemini/frontend.ts)), and streams a fresh render. Repeat until saved. Each request is a single build + QA — fast, and one editor decision per round.
7. The build run **streams as NDJSON frames** over a `ReadableStream`: `status` (cover fetch / build / QA milestones), `token` (HTML chunks), a single `qa` (lint findings + critic verdict), then `done` / `error`. The client reads frames via an async generator ([`app/generate/api.ts`](app/generate/api.ts)), accumulates tokens, drives the progress UI, and mounts the preview iframe **once** on `done`, keyed by `final-${html.length}` — rapid `srcDoc` updates during streaming thrashed the iframe's navigation queue and left it blank (see the `fix(generate): preview iframe blank after streaming completed` commit). It runs the same `lib/releases/lint.ts` as a client-side warning pass. "Full størrelse ↗" opens the HTML in a new tab via a Blob URL.
8. "Save as release" POSTs to `/api/save-artifact`, which calls `storage.saveArtifact(slug, html)` (disk → bare filename, Blob → public URL), reads the dataset, appends/updates the `book` + `bookRelease` records — now also persisting the run's `designBrief`, `qaReport`, `editorNotes`, `praise`, and the editor's `technicalNotes` for reproducibility — writes it back, and `revalidatePath`s `/releases` and the new slug. The release is live without a rebuild.

Latency: splitting the flow means each request is **one** Gemini render (build) or a single fast call (brief), so the build route sets `maxDuration = 120` and the brief route is well under the Hobby 60 s cap — no Vercel Pro required. Brief and build think at `thinkingLevel: HIGH`, the critic at `MEDIUM`. The client logic lives in a [`useGenerateFlow`](app/generate/use-generate-flow.ts) hook (state machine + handlers); [`generate-form.tsx`](app/generate/generate-form.tsx) is markup only.

The dataset is read at request time, never via a static import, so newly saved releases show up immediately. See [Storage](#storage--disk-locally-vercel-blob-on-production) above.

### Gating the generator behind a password

Generation costs Gemini credits, so `/generate`, `/api/generate/*`, and `/api/save-artifact` can be gated behind a shared password. Set `GENERATE_PASSWORD` in the deployment environment (Vercel → Project Settings → Environment Variables). If the env is unset, the gate is OFF — convenient for local dev.

How it works:

- `proxy.ts` (Next 16's renamed middleware) runs on every request that matches `/generate/:path*`, `/api/generate/:path*` (covers both the `brief` and `build` subroutes), or `/api/save-artifact`. It looks for a `bookshell_unlock` cookie and compares it to `GENERATE_PASSWORD` in constant time. Match → through. Mismatch → API requests get a `401 JSON`, browser requests redirect to `/generate/unlock?next=<original-path>`.
- `/generate/unlock` is a single-input form. It POSTs to `/api/unlock`, which validates the password (same constant-time compare), and if it matches sets `bookshell_unlock` as an `httpOnly + secure + sameSite=strict` cookie holding the password itself.
- The cookie value IS the password, so rotating `GENERATE_PASSWORD` invalidates every existing session on the next request. Cookie expiry is 30 days.

Threat model is "stop people who don't know the password from spending my credits" — not real authentication. For more, swap in an auth provider (Vercel Authentication on Pro, Auth.js, Clerk, etc.).

The prompts live in [`lib/gemini/`](lib/gemini), split by role — [`brief.ts`](lib/gemini/brief.ts) (creative direction → structured JSON), [`frontend.ts`](lib/gemini/frontend.ts) (the mechanical build + revise), [`qa.ts`](lib/gemini/qa.ts) (the critic) — sharing common fragments (the input block, cover handling, the no-fabrication contract) from [`prompt.ts`](lib/gemini/prompt.ts). What they enforce:

- **Role + shell awareness.** "Art director … D&AD pencils." The model is told its HTML is injected into a shell that already owns the nav, sticky buy bar, and footer, and not to add its own.
- **One committed idea, immersive beyond type.** One compositional + one typographic + one visual-system move, recorded in `/* MOTIF */ /* DESIGN IDEA */ /* VISUAL */ /* PALETTE */` comments. Bold colour fields, gradients, shape and scale are encouraged — not just nice typography.
- **One fixed palette, no `light-dark()`.** The page is a self-contained art-directed world, not theme-respecting chrome. Every self-coloured surface must set its own paired `color` in the same rule — the fix for inherited black-on-black. No dual-mode design.
- **A scroll narrative, with the footguns spelled out.** 3–5 scroll acts driven by `animation-timeline: view()/scroll()` and `position: sticky`; the static, no-animation state must be complete and readable. Two silent killers are called out explicitly: never `overflow: hidden/auto/scroll` on `.promo` or a scroll ancestor (it makes a scroll container and freezes the timeline at frame one — use `overflow-x: clip`), and `animation-range` keywords are a closed set (an invented `center` makes the whole declaration invalid).
- **Strict output contract.** Begins `<!doctype html>`, ends `</html>`; `<html lang="nb">`, one `<style>`, one `<article class="promo">`. Bans what the sanitizer would silently strip (`<script>`, `<link>`, `@import`, inline handlers) and any external image URL except the supplied cover.
- **Invent nothing.** Copy comes only from the inputs; quotes and ratings must be verbatim from the excerpt or the editor-supplied `praise` — no fictional critics, awards, or bios.
- **`@scope`-aware, responsive, cover never upscaled.** Tokens on `:scope`, selectors prefixed `.promo`; mobile-first with `@container` reflow; the cover is capped at its intrinsic size (decoded server-side) so it never blurs from upscaling.

Every one of these is *also* enforced deterministically by [`lib/releases/lint.ts`](lib/releases/lint.ts), so a violation that slips the prompt is caught by the QA gate and fed back into a revise round rather than relying on the model to self-check.

The prompt history is in git: `git log --follow lib/gemini/prompt.ts` covers the single mega-prompt era (vague → role+format → context/discipline/anti-clichés → `:scope`/`@import` → banning hallucinated URLs → the contrast / scroll-timeline / responsive-cover rules), before it was split into the `brief.ts` / `frontend.ts` / `qa.ts` pipeline above.

## Files worth reading first

- `app/releases/[slug]/page.tsx` — ties it together (thin: resolve → fetch → compose)
- `lib/sanity/releases.ts` — faked Sanity client; GROQ equivalents in comments; reads via the storage module
- `lib/storage/` — disk vs Blob dispatch (the storage facade)
- `lib/releases/body.ts` — sanitize + scope (the injection mechanic); stacking isolation lives in `app/globals.css`
- `lib/releases/lint.ts` — the deterministic artifact spec; shared by the prompts and the QA gate (tests alongside)
- `app/api/generate/brief/route.ts`, `build/route.ts` — the two human-gated stages (brief JSON; build NDJSON streaming over a ReadableStream)
- `lib/gemini/brief.ts`, `frontend.ts`, `qa.ts` — the three pipeline prompts (shared fragments in `prompt.ts`; cover handling in `cover.ts`)
- `lib/images/dimensions.ts` — dependency-free cover intrinsic-size decode (tests alongside)
- `app/generate/use-generate-flow.ts` + `generate-form.tsx` — the flow hook (state machine, stream consumer, abort-on-resubmit) and its markup-only view; wire calls in `api.ts`
- `proxy.ts` — password gate for the generation endpoints (Next 16 calls it "proxy", formerly "middleware")
- `components/release-shell.tsx` and `book-json-ld.tsx` — the SEO + buy surface
