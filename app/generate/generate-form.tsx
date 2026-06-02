"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./generate.module.css";

type FormState = {
  title: string;
  author: string;
  imageUrl: string;
  genre: string;
  description: string;
  longText: string;
};

const EMPTY: FormState = {
  title: "",
  author: "",
  imageUrl: "",
  genre: "",
  description: "",
  longText: "",
};

const LONG_LIMIT = 2000;

// Fallback status messages cycled while the route hasn't sent its own.
// Real status events from the route (cover fetch, prompt, first tokens)
// take precedence — these only fill silent gaps so the user doesn't think
// the request stalled.
const FALLBACK_MESSAGES = [
  "Strekker fingrene…",
  "Tenker på fargepaletten…",
  "Skisser ut komposisjonen…",
  "Velger typografisk hovedgrep…",
  "Vekter hierarkiet…",
  "Lager hover-animasjoner…",
  "Skrur til kontrastene…",
  "Polerer kantene…",
];

type Status =
  | { kind: "idle" }
  | { kind: "streaming"; label: string; html: string }
  | { kind: "generated"; html: string; warnings: string[] }
  | { kind: "saving"; html: string }
  | { kind: "saved"; html: string; previewUrl: string }
  | { kind: "error"; message: string; html?: string };

// Strip a fenced code block if and only if the ENTIRE response is wrapped in
// one. A loose regex would happily eat content between any two backticks the
// model emits inside the page (e.g. a code example for a book about JS), so
// we anchor to start+end. Also trims any garbage past the closing </html>
// (the model sometimes adds a stray ">" trying to satisfy "end with `>`").
function stripFences(text: string): string {
  const trimmed = text.trim();
  const opening = /^```(?:html)?\s*\n/i;
  const closing = /\n```\s*$/;
  if (opening.test(trimmed) && closing.test(trimmed)) {
    return trimmed.replace(opening, "").replace(closing, "").trim();
  }
  const end = trimmed.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) return trimmed.slice(0, end + "</html>".length);
  return trimmed;
}

// Catch hallucinated URLs that survived the prompt's hard rule. We check the
// final output (not the streaming buffer) so partial chunks don't trip it.
function checkHtml(html: string, allowedCoverUrl: string | null): string[] {
  const warnings: string[] = [];
  if (!html.toLowerCase().includes("<!doctype html")) warnings.push("Mangler <!DOCTYPE>.");
  if (!html.includes("<article")) warnings.push("Mangler <article>.");
  if (/<script\b/i.test(html)) warnings.push("Inneholder <script> (vil bli fjernet).");
  if (/<link\b/i.test(html)) warnings.push("Inneholder <link> (vil ikke laste).");

  const urlPattern = /https?:\/\/[^\s"'()<>]+/gi;
  const seen = new Set<string>();
  const allowed = allowedCoverUrl ?? "";
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(html)) !== null) {
    const url = m[0].replace(/[.,;)]+$/, "");
    if (url === allowed) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    warnings.push(`Ukjent ekstern URL: ${url}`);
  }
  return warnings;
}

export function GenerateForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fallbackIdx, setFallbackIdx] = useState(0);

  // Cycle fallback messages every 2.6s while streaming.
  useEffect(() => {
    if (status.kind !== "streaming") return;
    const id = setInterval(
      () => setFallbackIdx((i) => (i + 1) % FALLBACK_MESSAGES.length),
      2600
    );
    return () => clearInterval(id);
  }, [status.kind]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Keep the abort handle around so a re-submit cancels an in-flight stream.
  const abortRef = useRef<AbortController | null>(null);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus({ kind: "streaming", label: "Starter…", html: "" });

    let res: Response;
    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
        signal: ctrl.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus({ kind: "error", message: (err as Error).message });
      return;
    }

    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      setStatus({ kind: "error", message: j.error ?? `HTTP ${res.status}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let html = "";
    let currentLabel = "Starter…";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let frame: { type: string; [k: string]: unknown };
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        if (frame.type === "status" && typeof frame.label === "string") {
          currentLabel = frame.label;
          setStatus({ kind: "streaming", label: currentLabel, html });
        } else if (frame.type === "token" && typeof frame.text === "string") {
          html += frame.text;
          setStatus({ kind: "streaming", label: currentLabel, html });
        } else if (frame.type === "error" && typeof frame.message === "string") {
          setStatus({ kind: "error", message: frame.message, html });
          return;
        } else if (frame.type === "done") {
          const final = stripFences(html);
          const warnings = checkHtml(final, form.imageUrl.trim() || null);
          setStatus({ kind: "generated", html: final, warnings });
          return;
        }
      }
    }

    // Stream ended without a `done` frame — treat what we have as final.
    if (html) {
      const final = stripFences(html);
      const warnings = checkHtml(final, form.imageUrl.trim() || null);
      setStatus({ kind: "generated", html: final, warnings });
    }
  }

  async function onSave() {
    const html = currentHtml();
    if (!html) return;
    setStatus({ kind: "saving", html });
    try {
      const res = await fetch("/api/save-artifact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          author: form.author,
          genre: form.genre,
          description: form.description,
          html,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? "Save failed", html });
        return;
      }
      setStatus({ kind: "saved", html, previewUrl: json.previewUrl });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message, html });
    }
  }

  function openInNewTab() {
    const html = currentHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    // Revoke after the new tab has had time to navigate. If `open` was
    // blocked, revoke immediately so we don't leak.
    setTimeout(() => URL.revokeObjectURL(url), w ? 60_000 : 0);
  }

  function currentHtml(): string | undefined {
    switch (status.kind) {
      case "streaming":
      case "generated":
      case "saving":
      case "saved":
        return status.html;
      case "error":
        return status.html;
      default:
        return undefined;
    }
  }

  const html = currentHtml();
  const streaming = status.kind === "streaming";
  const saving = status.kind === "saving";
  const longRemaining = LONG_LIMIT - form.longText.length;
  const warnings = status.kind === "generated" ? status.warnings : [];

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={onGenerate}>
        <label className={styles.field}>
          <span>Tittel</span>
          <input
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Alt starter med en drøm"
          />
        </label>
        <label className={styles.field}>
          <span>Forfatter</span>
          <input
            required
            value={form.author}
            onChange={(e) => update("author", e.target.value)}
            placeholder="Antonio Nusa"
          />
        </label>
        <label className={styles.field}>
          <span>Sjanger</span>
          <input
            required
            value={form.genre}
            onChange={(e) => update("genre", e.target.value)}
            placeholder="Biografi · Idrett"
          />
        </label>
        <label className={styles.field}>
          <span>Forside (URL)</span>
          <input
            type="url"
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
            placeholder="https://… (valgfritt — brukes for fargepalett)"
          />
        </label>
        <label className={styles.field}>
          <span>Pitch (en setning)</span>
          <input
            required
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Reisen bak suksessen til Antonio Nusa"
          />
        </label>
        <label className={styles.field}>
          <span>
            Sammendrag / brødtekst{" "}
            <em className={longRemaining < 0 ? styles.over : styles.count}>
              {longRemaining} tegn igjen
            </em>
          </span>
          <textarea
            required
            rows={10}
            maxLength={LONG_LIMIT}
            value={form.longText}
            onChange={(e) => update("longText", e.target.value)}
            placeholder="2000 tegn med synopsis, utdrag eller pressetekst…"
          />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={streaming || saving}>
            {streaming ? "Genererer…" : "Generer side"}
          </button>
          {html && status.kind !== "streaming" && (
            <button
              type="button"
              className={styles.secondary}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Lagrer…" : "Lagre som utgivelse"}
            </button>
          )}
        </div>
        {status.kind === "error" && (
          <p className={styles.error}>Feil: {status.message}</p>
        )}
        {status.kind === "saved" && (
          <p className={styles.success}>
            Lagret. <a href={status.previewUrl}>Åpne utgivelsessiden →</a>
          </p>
        )}
        {warnings.length > 0 && (
          <ul className={styles.warnings}>
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </form>

      <aside className={styles.preview}>
        <header className={styles.previewHead}>
          <span>Forhåndsvisning</span>
          <div className={styles.previewActions}>
            {html && (
              <>
                <button
                  type="button"
                  className={styles.previewBtn}
                  onClick={openInNewTab}
                  title="Åpne i ny fane for full bredde"
                >
                  Full størrelse ↗
                </button>
                <button
                  type="button"
                  className={styles.previewBtn}
                  onClick={() => navigator.clipboard.writeText(html)}
                >
                  Kopier HTML
                </button>
              </>
            )}
          </div>
        </header>
        <div className={styles.frameWrap}>
          {/* The iframe is only mounted when generation is COMPLETE. Updating
              srcDoc on every streaming token thrashed the iframe's internal
              navigation queue and left it blank at the end. The `key` ties
              to the final HTML length so a regeneration mounts a fresh
              iframe instance, guaranteeing a clean parse. */}
          {!streaming && html ? (
            <iframe
              key={`final-${html.length}`}
              className={styles.frame}
              sandbox=""
              srcDoc={html}
              title="Forhåndsvisning av generert side"
            />
          ) : (
            <div className={styles.empty}>
              {streaming ? (
                <>
                  <span className={styles.streamDot} aria-hidden="true" />
                  <span key={status.label} className={styles.streamLabel}>
                    {status.label}
                  </span>
                  <span className={styles.streamMeta}>
                    {status.html.length > 0
                      ? `${status.html.length.toLocaleString("nb-NO")} tegn mottatt`
                      : ""}
                  </span>
                  <span
                    key={`fallback-${fallbackIdx}`}
                    className={styles.streamFallback}
                  >
                    {FALLBACK_MESSAGES[fallbackIdx]}
                  </span>
                </>
              ) : (
                "Fyll inn skjemaet og trykk Generer."
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
