"use client";

import { useState } from "react";
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

type Status =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "generated"; html: string }
  | { kind: "saving"; html: string }
  | { kind: "saved"; html: string; previewUrl: string }
  | { kind: "error"; message: string; html?: string };

export function GenerateForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "generating" });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? "Generation failed", html: json.html });
        return;
      }
      setStatus({ kind: "generated", html: json.html });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  async function onSave() {
    if (status.kind !== "generated" && status.kind !== "error") return;
    const html = status.kind === "generated" ? status.html : status.html;
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

  const longRemaining = LONG_LIMIT - form.longText.length;
  const generating = status.kind === "generating";
  const saving = status.kind === "saving";
  const html =
    status.kind === "generated" || status.kind === "saving" || status.kind === "saved"
      ? status.html
      : status.kind === "error"
        ? status.html
        : undefined;

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
          <button type="submit" className={styles.primary} disabled={generating || saving}>
            {generating ? "Genererer…" : "Generer side"}
          </button>
          {html && (
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
      </form>

      <aside className={styles.preview}>
        <header className={styles.previewHead}>
          <span>Forhåndsvisning</span>
          {html && (
            <button
              type="button"
              className={styles.copy}
              onClick={() => navigator.clipboard.writeText(html)}
            >
              Kopier HTML
            </button>
          )}
        </header>
        <div className={styles.frameWrap}>
          {html ? (
            <iframe
              key={html.slice(0, 64)}
              className={styles.frame}
              sandbox=""
              srcDoc={html}
              title="Forhåndsvisning av generert side"
            />
          ) : (
            <div className={styles.empty}>
              {generating
                ? "Gemini jobber — dette tar 10–25 sekunder."
                : "Fyll inn skjemaet og trykk Generer."}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
