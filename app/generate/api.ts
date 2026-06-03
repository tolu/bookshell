import type { Brief } from "@/lib/gemini/brief";
import type { QaVerdict } from "@/lib/gemini/qa";
import type { FormState, QaState } from "./types";

// NDJSON frames the build route streams. Mirrors the server's Frame union, but
// kept here so the client owns its own wire contract.
export type BuildFrame =
  | { type: "status"; label: string }
  | { type: "token"; text: string }
  | { type: "qa"; passed: boolean; findings: QaState["findings"]; critic: QaVerdict | null }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Stage 1: brief (initial + feedback iterations) ────────────────────────
export async function postBrief(
  form: FormState,
  opts: { feedback?: string; priorBrief?: Brief | null; signal?: AbortSignal }
): Promise<Brief> {
  const res = await fetch("/api/generate/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify(
      opts.feedback ? { ...form, feedback: opts.feedback, priorBrief: opts.priorBrief } : form
    ),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.brief as Brief;
}

// ── Stage 2/3: build (fresh) or revise → streamed NDJSON frames ───────────
// Async generator: each yielded frame is one parsed NDJSON line.
export async function* streamBuild(
  form: FormState,
  brief: Brief,
  opts: { revise?: { html: string; notes: string }; signal?: AbortSignal }
): AsyncGenerator<BuildFrame> {
  const res = await fetch("/api/generate/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      ...form,
      brief,
      ...(opts.revise ? { html: opts.revise.html, notes: opts.revise.notes } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as BuildFrame;
      } catch {
        // Ignore malformed lines (partial flush, keep-alive noise).
      }
    }
  }
}

// ── Persist the finished artifact + provenance ────────────────────────────
export async function saveArtifact(args: {
  form: FormState;
  html: string;
  brief: Brief | null;
  qa: QaState | null;
  techNotes: string;
}): Promise<{ previewUrl: string }> {
  const { form, html, brief, qa, techNotes } = args;
  const res = await fetch("/api/save-artifact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: form.title,
      author: form.author,
      genre: form.genre,
      description: form.description,
      html,
      designBrief: brief ? JSON.stringify(brief) : undefined,
      qaReport: qa ? JSON.stringify(qa) : undefined,
      editorNotes: form.editorNotes.trim() || undefined,
      praise: form.praise.trim() || undefined,
      technicalNotes: techNotes.trim() || undefined,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Save failed");
  return { previewUrl: json.previewUrl as string };
}
