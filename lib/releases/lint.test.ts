// Run: node --test lib/releases/lint.test.ts   (Node 24 strips types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintArtifact, type Finding } from "./lint.ts";

// A clean artifact that must produce zero findings — every failing case below
// is this baseline with one defect injected.
const BASE = `<!DOCTYPE html>
<html lang="nb">
<head><meta charset="utf-8"><title>T</title>
<style>
.promo { background: #faf8f3; color: #1a1a17; }
.promo .hero { animation-timeline: view(); animation-range: entry 20% cover 60%; }
@media (prefers-reduced-motion: no-preference) { .promo .hero { animation: fade 1s; } }
</style></head>
<body><article class="promo"><h1>T</h1></article></body>
</html>`;

const ids = (fs: Finding[]) => fs.map((f) => f.id);
const errors = (fs: Finding[]) => fs.filter((f) => f.severity === "error");

test("clean baseline → zero findings", () => {
  assert.deepEqual(lintArtifact(BASE), []);
});

test("missing doctype → error", () => {
  const html = BASE.replace("<!DOCTYPE html>\n", "");
  assert.ok(ids(lintArtifact(html)).includes("structure-doctype"));
});

test("missing <article class=promo> → error", () => {
  const html = BASE.replace('<article class="promo">', "<section>").replace("</article>", "</section>");
  assert.ok(ids(lintArtifact(html)).includes("structure-article"));
});

test("<script> → error", () => {
  const html = BASE.replace("</body>", "<script>alert(1)</script></body>");
  assert.ok(ids(lintArtifact(html)).includes("forbidden-script"));
});

test("light-dark() → error", () => {
  const html = BASE.replace("color: #1a1a17;", "color: light-dark(#1a1a17, #eee);");
  assert.ok(ids(lintArtifact(html)).includes("css-light-dark"));
});

test("overflow:hidden on .promo root → error", () => {
  const html = BASE.replace(".promo { background", ".promo { overflow-x: hidden; background");
  assert.ok(ids(lintArtifact(html)).includes("overflow-scroll-container"));
});

test("overflow on a non-root selector is fine", () => {
  const html = BASE.replace(".promo .hero {", ".promo .hero { overflow-x: hidden;");
  assert.ok(!ids(lintArtifact(html)).includes("overflow-scroll-container"));
});

test("invalid animation-range keyword (center) → error", () => {
  const html = BASE.replace("entry 20% cover 60%", "entry 20% center 80%");
  assert.ok(ids(lintArtifact(html)).includes("animation-range-keyword"));
});

test("hallucinated image URL → error; cover URL is allowed", () => {
  const url = "https://images.example.com/cover.jpg";
  const html = BASE.replace("<h1>T</h1>", `<img src="${url}" alt="x"><h1>T</h1>`);
  assert.ok(ids(lintArtifact(html)).includes("hallucinated-url"));
  assert.ok(!ids(lintArtifact(html, { coverUrl: url })).includes("hallucinated-url"));
});

test("inline SVG namespace is NOT a hallucinated URL", () => {
  const html = BASE.replace(
    "<h1>T</h1>",
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect/></svg><h1>T</h1>'
  );
  assert.ok(!ids(lintArtifact(html)).includes("hallucinated-url"));
});

test("CSS comments don't leak into selector parsing", () => {
  const html = BASE.replace(
    ".promo .hero {",
    "/* ACT 1 */ .promo .hero--surface { background: #222; font-size: 1rem; } /* x */ .promo .hero {"
  );
  const found = lintArtifact(html);
  // The background-without-color warn fires, but its message must name the bare
  // selector, not the preceding comment.
  const warn = found.find((f) => f.id === "contrast-surface-no-color");
  assert.ok(warn && !warn.message.includes("/*"));
});

test("'javascript:' in book copy is NOT a forbidden URL; in href/src it is", () => {
  // Regression: the book "JavaScript: The Good Parts" must not trip the JS-URL
  // check just because its title contains "javascript:".
  const copy = BASE
    .replace("<title>T</title>", "<title>JavaScript: The Good Parts</title>")
    .replace("<h1>T</h1>", "<h1>JavaScript: The Good Parts</h1>");
  assert.ok(!ids(lintArtifact(copy)).includes("forbidden-js-url"));

  const realUrl = BASE.replace("<h1>T</h1>", '<a href="javascript:void(0)">x</a><h1>T</h1>');
  assert.ok(ids(lintArtifact(realUrl)).includes("forbidden-js-url"));
});

test("decorative background-only layer is NOT a contrast warn; text surface is", () => {
  // A gradient wash / scrim with no text legitimately sets no color.
  const deco = BASE.replace(
    ".promo .hero {",
    ".promo .wave { background: linear-gradient(#012, #024); } .promo .hero {"
  );
  assert.ok(!ids(lintArtifact(deco)).includes("contrast-surface-no-color"));

  // A surface that sets a background AND text but no paired color is flagged.
  const textSurface = BASE.replace(
    ".promo .hero {",
    ".promo .card { background: #111; font-size: 2rem; } .promo .hero {"
  );
  assert.ok(ids(lintArtifact(textSurface)).includes("contrast-surface-no-color"));
});

test("animations without reduced-motion guard → warn", () => {
  const html = BASE.replace(
    "@media (prefers-reduced-motion: no-preference) { .promo .hero { animation: fade 1s; } }",
    ".promo .hero { animation: fade 1s; }"
  );
  assert.ok(ids(lintArtifact(html)).includes("motion-reduced-guard"));
});

test("cover rendered above intrinsic size → warn", () => {
  const url = "https://images.example.com/cover.jpg";
  const html = BASE.replace("<h1>T</h1>", `<img src="${url}" style="width: 9999px" alt="x"><h1>T</h1>`);
  const found = lintArtifact(html, { coverUrl: url, coverSize: { width: 800, height: 1200 } });
  assert.ok(ids(found).includes("cover-upscaled"));
});

test("fabrication: stars/acclaim flagged unless present in praise (allowlist)", () => {
  const html = BASE.replace("<h1>T</h1>", "<h1>T</h1><p>★★★★★ — VG. An award-winning debut.</p>");
  const src = { sourceText: "A quiet novel about the sea." };

  const flagged = lintArtifact(html, src);
  assert.ok(ids(flagged).includes("fabricated-stars"));
  assert.ok(ids(flagged).includes("fabricated-acclaim"));

  // Editor supplies the same praise verbatim → allowlisted, no fabrication warns.
  const ok = lintArtifact(html, { ...src, praise: "★★★★★ — VG. An award-winning debut." });
  assert.ok(!ids(ok).includes("fabricated-stars"));
  assert.ok(!ids(ok).includes("fabricated-acclaim"));
});

test("fabrication heuristic stays off when no allowlist text is provided", () => {
  const html = BASE.replace("<h1>T</h1>", "<h1>T</h1><p>★★★★★ bestseller</p>");
  assert.deepEqual(
    ids(lintArtifact(html)).filter((id) => id.startsWith("fabricated")),
    []
  );
});

test("errors() helper surfaces only blocking issues", () => {
  const html = BASE.replace("</body>", "<script></script></body>");
  assert.ok(errors(lintArtifact(html)).every((f) => f.severity === "error"));
});
