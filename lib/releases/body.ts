import "server-only";
import { cache } from "react";
import { getArtifact } from "@/lib/storage";

// The contract: given an artifactRef (bare filename for bundled artifacts,
// or a full http(s):// URL for Blob-hosted ones), return safe, scoped HTML
// ready to drop into <main>. Storage choice is absorbed by lib/storage.

// Scope the artifact's CSS using native @scope. The browser does all the work
// — every selector inside the block is implicitly rooted at .release-artifact,
// and cascading/inheritance stop at the scope edge. We only need to remap the
// artifact's own root-ish selectors (:root, html, body) onto :scope so their
// custom-property declarations land on the scope root.
function scopeCss(css: string, scope: string): string {
  const remapped = css.replace(/(^|[\s,{}])(:root|html|body)(?=[\s,{])/g, "$1:scope");
  return `@scope (.${scope}) {\n${remapped}\n}`;
}

// Extract <style> blocks, wrap each in @scope, and re-inline. Strip anything we
// never want in injected marketing content: scripts, event handlers, javascript:
// URLs. Marketing bodies are presentational — no JS needed.
function sanitizeAndScope(rawHtml: string, scope: string): string {
  let html = rawHtml;

  const styles: string[] = [];
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
    styles.push(scopeCss(css, scope));
    return "";
  });

  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1] !== undefined) html = bodyMatch[1];

  const scopedStyle = styles.length ? `<style>${styles.join("\n")}</style>` : "";

  return `${scopedStyle}<div class="${scope}">${html}</div>`;
}

export type ReleaseBody = { html: string; scope: string };

export const getReleaseBody = cache(
  async (artifactRef: string): Promise<ReleaseBody> => {
    const raw = await getArtifact(artifactRef);
    const scope = "release-artifact";
    const html = sanitizeAndScope(raw, scope);
    return { html, scope };
  }
);
