// Strip a fenced code block iff the ENTIRE response is wrapped, and trim any
// stray characters past the closing </html>. Shared by the client (streaming
// accumulator) and the build route (so lint/critic see the same clean HTML).
export function stripArtifactHtml(text: string): string {
  const trimmed = text.trim();
  const opening = /^```(?:html)?\s*\n/i;
  const closing = /\n```\s*$/;
  let html = trimmed;
  if (opening.test(html) && closing.test(html)) {
    html = html.replace(opening, "").replace(closing, "").trim();
  }
  const end = html.toLowerCase().lastIndexOf("</html>");
  return end !== -1 ? html.slice(0, end + "</html>".length) : html;
}
