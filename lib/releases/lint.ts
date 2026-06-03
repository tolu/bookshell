// Deterministic validator for generated artifact HTML — the single source of
// truth for the "footgun spec" we otherwise only hope the prompt enforces.
// Pure and client-safe (no server-only, no Buffer): the generate route's QA
// gate and the client's post-generation warnings both call this, so a rule
// added here is enforced everywhere at once.
//
// Errors are spec violations that break the page or its contract (fed back to
// the revise loop). Warns are heuristic smells the LLM critic weighs — we are
// honest that contrast/upscaling can't be statically proven, so those never
// claim certainty.

import type { ImageSize } from "@/lib/images/dimensions";

export type Finding = {
  id: string;
  severity: "error" | "warn";
  message: string;
  fix?: string;
};

export type LintContext = {
  coverUrl?: string | null;
  coverSize?: ImageSize | null;
  /** Editor-supplied real quotes/reviews — allowlists otherwise-fabricated-looking praise. */
  praise?: string | null;
  /** Excerpt + pitch + title + author. When provided, enables the fabrication heuristic. */
  sourceText?: string | null;
};

const VALID_RANGE_KEYWORDS = new Set([
  "cover",
  "contain",
  "entry",
  "exit",
  "entry-crossing",
  "exit-crossing",
  "normal",
]);

// Selectors that, as the artifact root, must not become scroll containers.
const ROOT_SELECTORS = new Set([".promo", ":scope", "html", "body", "*"]);

// Words that imply external acclaim — fabrication unless they appear in the
// editor's own inputs.
const ACCLAIM_WORDS =
  /\b(bestsell\w*|best-?sell\w*|award[- ]?winning|prisbelønt|prizewinning|finalist|shortlist\w*|#1|nr\.?\s?1|no\.?\s?1|critically acclaimed|new york times|sunday times|the guardian|booker)\b/gi;

function styleText(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? "")
    .join("\n")
    // Drop CSS comments so they can't leak into selector/value parsing.
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

// W3C namespace identifiers (inline SVG/MathML/xlink) are XML namespaces, not
// fetched resources — they must not be mistaken for hallucinated image URLs.
function isNamespaceUrl(url: string): boolean {
  return /^https?:\/\/www\.w3\.org\//i.test(url);
}

// Flat (selector, body) pairs. Innermost rules of @media/@scope blocks still
// match individually, which is all our block-scoped checks need.
function cssBlocks(css: string): Array<{ selector: string; body: string }> {
  const blocks: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    blocks.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
  }
  return blocks;
}

function selectorParts(selector: string): string[] {
  return selector.split(",").map((s) => s.trim());
}

export function lintArtifact(html: string, ctx: LintContext = {}): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const css = styleText(html);
  const blocks = cssBlocks(css);

  // ---- Structure ---------------------------------------------------------
  if (!/<!doctype html/i.test(html)) {
    add({ id: "structure-doctype", severity: "error", message: "Mangler <!DOCTYPE html>." });
  }
  if (!/<html\b/i.test(html)) {
    add({ id: "structure-html", severity: "error", message: "Mangler <html>-element." });
  }
  if (!/<article[^>]*class\s*=\s*["'][^"']*\bpromo\b/i.test(html)) {
    add({
      id: "structure-article",
      severity: "error",
      message: "Mangler <article class=\"promo\"> som rot for innholdet.",
    });
  }
  if ((html.match(/<article\b/gi) ?? []).length > 1) {
    add({
      id: "structure-multiple-articles",
      severity: "warn",
      message: "Flere <article>-elementer — kontrakten forventer nøyaktig én.",
    });
  }

  // ---- Forbidden elements / constructs -----------------------------------
  const forbidden: Array<[string, RegExp, string]> = [
    ["forbidden-script", /<script\b/i, "Inneholder <script> (blir fjernet ved sanitering)."],
    ["forbidden-link", /<link\b/i, "Inneholder <link> (laster ikke)."],
    ["forbidden-import", /@import\b/i, "Inneholder @import (ugyldig inne i @scope-wrapper)."],
    [
      "forbidden-embed",
      /<(iframe|object|embed|form)\b/i,
      "Inneholder <iframe>/<object>/<embed>/<form> (forbudt).",
    ],
    [
      "forbidden-on-handler",
      /\son[a-z]+\s*=\s*["']?/i,
      "Inneholder inline event-handler (on…=) (blir fjernet).",
    ],
  ];
  for (const [id, re, message] of forbidden) {
    if (re.test(html)) add({ id, severity: "error", message });
  }

  // javascript: only matters as a URL — in an href/src attribute or a CSS
  // url(). Matching it anywhere in the document false-positives on book copy
  // like the title "JavaScript: The Good Parts". Mirror the sanitizer's
  // context-aware match in lib/releases/body.ts.
  if (
    /(?:href|src)\s*=\s*["']?\s*javascript:/i.test(html) ||
    /url\(\s*["']?\s*javascript:/i.test(css)
  ) {
    add({
      id: "forbidden-js-url",
      severity: "error",
      message: "Inneholder javascript:-URL i href/src/url() (blir nøytralisert).",
    });
  }

  // ---- Hallucinated image URLs -------------------------------------------
  {
    const allowed = ctx.coverUrl ?? "";
    const seen = new Set<string>();
    const urlRe = /https?:\/\/[^\s"'()<>]+/gi;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const url = m[0].replace(/[.,;)]+$/, "");
      if (url === allowed || isNamespaceUrl(url) || seen.has(url)) continue;
      seen.add(url);
      add({
        id: "hallucinated-url",
        severity: "error",
        message: `Ukjent ekstern URL: ${url}`,
        fix: "Bruk kun omslags-URL-en fra input, ellers CSS-genererte visuals.",
      });
    }
  }

  // ---- Banned CSS: light-dark() ------------------------------------------
  if (/light-dark\s*\(/i.test(css)) {
    add({
      id: "css-light-dark",
      severity: "error",
      message: "Bruker light-dark() — siden skal ha én fast palett, ikke to moduser.",
      fix: "Velg én palett og sett eksplisitt color + background per flate.",
    });
  }

  // ---- Root overflow that freezes scroll timelines -----------------------
  for (const { selector, body } of blocks) {
    const isRoot = selectorParts(selector).some((p) => ROOT_SELECTORS.has(p));
    if (isRoot && /overflow(-x|-y)?\s*:\s*(hidden|auto|scroll)\b/i.test(body)) {
      add({
        id: "overflow-scroll-container",
        severity: "error",
        message: `overflow: hidden/auto/scroll på rot-selektor «${selector}» lager en scroll-container og fryser scroll()/view()-animasjoner på første frame.`,
        fix: "Bruk overflow-x: clip, eller stopp overflowen ved kilden.",
      });
    }
  }

  // ---- Invalid animation-range keywords ----------------------------------
  {
    const re = /animation-range(?:-start|-end)?\s*:\s*([^;}]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      const value = m[1] ?? "";
      for (const token of value.match(/[a-z][a-z-]*/gi) ?? []) {
        if (!VALID_RANGE_KEYWORDS.has(token.toLowerCase())) {
          add({
            id: "animation-range-keyword",
            severity: "error",
            message: `Ugyldig animation-range-nøkkelord «${token}» — gjør hele deklarasjonen ugyldig.`,
            fix: "Bruk kun cover/contain/entry/exit/entry-crossing/exit-crossing.",
          });
        }
      }
    }
  }

  // ---- WARN: animations not gated on reduced-motion ----------------------
  if (
    /animation(-timeline|-name)?\s*:/i.test(css) &&
    !/prefers-reduced-motion/i.test(css)
  ) {
    add({
      id: "motion-reduced-guard",
      severity: "warn",
      message: "Animasjoner ser ikke ut til å være pakket i @media (prefers-reduced-motion: no-preference).",
    });
  }

  // ---- WARN: a TEXT-bearing surface sets background but no color ----------
  // Only flag rules that set both a background AND a text property (font/
  // line-height/…) yet no paired color — those genuinely risk inheriting a
  // mismatched colour. Decorative background-only layers (gradient washes,
  // scrims, lines) legitimately set no color and must not be flagged.
  for (const { selector, body } of blocks) {
    const setsBackground = /background(-color|-image)?\s*:/i.test(body);
    const setsColor = /(^|[;{\s])color\s*:/i.test(body);
    const setsText =
      /(^|[;{\s])(font|font-size|font-family|font-weight|line-height|letter-spacing|text-align|text-wrap)\s*:/i.test(
        body
      );
    if (setsBackground && setsText && !setsColor) {
      add({
        id: "contrast-surface-no-color",
        severity: "warn",
        message: `«${selector}» setter background og tekst men ingen color — risiko for arvet tekstfarge mot egen bakgrunn (sjekk kontrast).`,
      });
    }
  }

  // ---- WARN: cover rendered above intrinsic size -------------------------
  if (ctx.coverSize && ctx.coverUrl && html.includes(ctx.coverUrl)) {
    const { width, height } = ctx.coverSize;
    // Look near the cover URL for an explicit px width/height beyond intrinsic.
    const idx = html.indexOf(ctx.coverUrl);
    const around = html.slice(Math.max(0, idx - 400), idx + 400);
    const px = (prop: string) => {
      const mm = around.match(new RegExp(`${prop}\\s*[:=]\\s*["']?(\\d+)px`, "i"));
      return mm ? Number(mm[1]) : null;
    };
    const w = px("width");
    const h = px("height");
    if ((w && w > width) || (h && h > height)) {
      add({
        id: "cover-upscaled",
        severity: "warn",
        message: `Omslaget ser ut til å rendres over naturlig oppløsning (${width}×${height}) — blir uskarpt.`,
        fix: "Cap med max-inline-size: min(100%, naturlig bredde) og height: auto.",
      });
    }
  }

  // ---- WARN: fabricated acclaim ------------------------------------------
  {
    const allow = `${ctx.sourceText ?? ""}\n${ctx.praise ?? ""}`.toLowerCase();
    const hasAllowlist = allow.trim().length > 0;
    const praiseLower = (ctx.praise ?? "").toLowerCase();

    if (hasAllowlist) {
      // Star glyphs are praise — fine only if the editor supplied them.
      if (/★/.test(html) && !praiseLower.includes("★")) {
        add({
          id: "fabricated-stars",
          severity: "warn",
          message: "Stjerner (★) i markup, men ingen i omtale-input — mulig oppdiktet vurdering.",
        });
      }
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      ACCLAIM_WORDS.lastIndex = 0;
      while ((m = ACCLAIM_WORDS.exec(html)) !== null) {
        const word = m[0].toLowerCase();
        if (seen.has(word) || allow.includes(word)) continue;
        seen.add(word);
        add({
          id: "fabricated-acclaim",
          severity: "warn",
          message: `«${m[0]}» finnes ikke i utdrag eller omtale — mulig oppdiktet påstand.`,
        });
      }
    }
  }

  return findings;
}
