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

Pipeline:

1. Form POSTs `{ title, author, genre, description, longText, imageUrl }` to `/api/generate`.
2. The route fetches the cover (checks MIME, caps at 8 MB, 8 s timeout) and builds the prompt.
3. The response is **streamed** as NDJSON frames over a `ReadableStream`: `status` frames at real milestones (`"Henter omslagsbilde…"`, `"Sender prompt til Gemini…"`, `"Venter på første tokens…"`, `"Genererer markup…"`), then `token` frames carrying chunks of HTML, then `done` (or `error`).
4. The form reads frames via `getReader()`, accumulates the HTML, drives the progress UI (pulsing dot, current label, cycling fallback messages, monospace `X tegn mottatt` counter), and on `done` runs final cleanup: tighten code-fence stripping (only if the whole response is fenced), trim anything past the last `</html>`, scan for any `http(s)://` URL that isn't the supplied cover and surface those as warnings.
5. The preview iframe is mounted **once**, after streaming finishes, keyed by `final-${html.length}` so a regeneration triggers a fresh instance. Rapid `srcDoc` updates during streaming thrashed the iframe's navigation queue and left it blank at the end — see the `fix(generate): preview iframe blank after streaming completed` commit. "Full størrelse ↗" opens the same HTML in a new tab via a Blob URL for browser-width preview, dev tools, etc.
6. "Save as release" POSTs to `/api/save-artifact`, which calls `storage.saveArtifact(slug, html)` (disk → bare filename, Blob → public URL), reads the dataset via `storage.getDataset()`, appends `book` + `bookRelease` (status: published) records or updates an existing release's `artifactRef`, writes it back via `storage.saveDataset()`, and calls `revalidatePath` for `/releases` and the new slug. The release is then live in the listing and shell-wrapped at `/releases/<slug>` without a rebuild.

The dataset is read at request time, never via a static import, so newly saved releases show up immediately. See [Storage](#storage--disk-locally-vercel-blob-on-production) above.

### Gating the generator behind a password

Generation costs Gemini credits, so `/generate`, `/api/generate`, and `/api/save-artifact` can be gated behind a shared password. Set `GENERATE_PASSWORD` in the deployment environment (Vercel → Project Settings → Environment Variables). If the env is unset, the gate is OFF — convenient for local dev.

How it works:

- `proxy.ts` (Next 16's renamed middleware) runs on every request that matches `/generate/:path*`, `/api/generate`, or `/api/save-artifact`. It looks for a `bookshell_unlock` cookie and compares it to `GENERATE_PASSWORD` in constant time. Match → through. Mismatch → API requests get a `401 JSON`, browser requests redirect to `/generate/unlock?next=<original-path>`.
- `/generate/unlock` is a single-input form. It POSTs to `/api/unlock`, which validates the password (same constant-time compare), and if it matches sets `bookshell_unlock` as an `httpOnly + secure + sameSite=strict` cookie holding the password itself.
- The cookie value IS the password, so rotating `GENERATE_PASSWORD` invalidates every existing session on the next request. Cookie expiry is 30 days.

Threat model is "stop people who don't know the password from spending my credits" — not real authentication. For more, swap in an auth provider (Vercel Authentication on Pro, Auth.js, Clerk, etc.).

The prompt lives in [`lib/gemini/prompt.ts`](lib/gemini/prompt.ts). Notes on its design:

- **Sets the role.** "Art director at a literary publisher whose pages have won D&AD pencils." Gives the model a higher bar than "make it nice".
- **Explains the shell.** The model is told its HTML gets injected into a page that already has nav, a sticky buy bar, and a footer; it's told not to add its own.
- **Forces a single bold idea.** Pick ONE compositional idea and ONE typographic idea, and commit to both in `/* DESIGN IDEA */` and `/* PALETTE */` comments at the top of the style block.
- **Lists what to avoid.** A concrete anti-cliché list (centered hero on a gradient, three rounded feature cards, gradient pill buttons) steers harder than positive direction alone.
- **Strict output format.** Begins with `<!doctype html>`, ends with `</html>` — no code fences, no prose, no extra characters. Required structure inside: `<html lang="nb">`, `<head>` with ONE `<style>`, `<body>` with ONE `<article class="promo">`. (Earlier wording was "first char `<`, last `>`" — the model read that as "append a `>` to be safe" and produced `</html>>`.)
- **Bans the things the sanitizer would silently strip.** `<script>`, `<link>`, `@import`, inline event handlers — so the model emits clean output instead of decorated HTML that gets gutted.
- **No hallucinated URLs.** The cover URL (when supplied) is embedded in the prompt and required verbatim; every other external image URL is banned — no Unsplash, no stock-photo CDN, no Amazon-looking guesses. For other visuals the model is told to use CSS shapes, gradients, blend modes, mask-image, conic/radial gradients, `::before`/`::after`. The form runs a final URL audit on the streamed result and surfaces any stray external URL as a warning.
- **`@scope`-aware.** Tells the model to put tokens on `:scope` (which matches our wrapper) and to prefix selectors with `.promo`, avoiding reliance on our `:root`→`:scope` remap.
- **Motion is gated.** Every animation rule must sit inside `@media (prefers-reduced-motion: no-preference)`; the default state is motionless.
- **Self-check before answering.** A short checklist at the end nudges the model to verify its own output.

The prompt has been iterated as the demo got used:

- v1 vague ("make it stunning") → generic output.
- v2 added role + format → still safe and Bootstrap-y.
- v3 added context, discipline, anti-clichés → a real jump in quality.
- v4 added `:scope` guidance, banned `@import`, and tightened the self-check.
- v5 (after first real runs): banned any external image URL except the cover, pulled the cover URL into the prompt so the model has a real string to reproduce — model was inventing realistic-looking Amazon URLs that 404.
- v6: rewrote "first char `<`, last `>`" → "begin with `<!doctype html>`, end with `</html>`" — the literal-character rule was producing a stray `>` after `</html>`.

Run `git log --follow lib/gemini/prompt.ts` for the actual trail.

## Files worth reading first

- `app/releases/[slug]/page.tsx` — ties it together (thin: resolve → fetch → compose)
- `lib/sanity/releases.ts` — faked Sanity client; GROQ equivalents in comments; reads via the storage module
- `lib/storage/` — disk vs Blob dispatch (the storage facade)
- `lib/releases/body.ts` — sanitize + scope (the injection mechanic)
- `lib/gemini/prompt.ts` — the generation prompt
- `app/api/generate/route.ts` — NDJSON streaming pattern over a ReadableStream
- `app/generate/generate-form.tsx` — stream consumer, iframe mount strategy, abort-on-resubmit
- `proxy.ts` — password gate for the generation endpoints (Next 16 calls it "proxy", formerly "middleware")
- `components/release-shell.tsx` and `book-json-ld.tsx` — the SEO + buy surface
