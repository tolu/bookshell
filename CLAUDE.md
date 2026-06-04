# Project notes for Claude

## Docs + deck stay in sync with the code

When opening a PR, re-read `README.md` and `slides/slides.md` against the diff. Update one or both if the change touches any of:

- a route added / removed (under `app/`, including the `/slides` path)
- an agent prompt edited (`lib/agent/stages/{brief,build,qa}.ts`) — the deck quotes them verbatim, README cites them
- the NDJSON wire protocol (`lib/generate/protocol.ts`) — deck quotes the union and `readFrames`
- the storage facade (`lib/storage/*`) — README has a table; the deck has the "back into the shell" slide
- the shell-injection mechanic (`lib/releases/body.ts` sanitiser / `@scope` / `isolation: isolate`) — central to slide 16-17
- the deterministic lint (`lib/releases/lint.ts`) — deck enumerates the rules
- the streaming iframe primitives (`app/generate/flow/useStreamingIframe.ts`, `phase.ts`) — diagrammed on slide 13

If the diff is doc- and deck-irrelevant (small refactor, dependency bump, test-only change), note that explicitly in the PR description — saves reviewers wondering.

## Slides

Deck is Slidev, source at `slides/slides.md`. Iterate with `npm run slides:dev` (port 3030). The `prebuild` npm script runs `slides:build` before every `next build`, so deploys never ship without slides. `public/slides/` is gitignored — built fresh.

Screenshots in `slides/public/slides-assets/` are real Gemini-generated captures driven through `/generate`. Re-capture only when the UI changes meaningfully.

## Working in worktrees

This repo is checked out as a git worktree. `node_modules/` doesn't follow — run `npm install` in any new worktree before scripts work. `.env.local` doesn't follow either — copy from the main checkout if you need Gemini / Blob keys.
