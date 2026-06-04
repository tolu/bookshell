import type { Brief } from "@/lib/agent/stages/brief";
import { readFrames, type BuildFrame } from "@/lib/generate/protocol";
import type { FormState, QaState } from "./model";

// The client side of the generation API: one function per endpoint. The wire
// frame type (BuildFrame) is owned by lib/generate/protocol and shared with the
// route handler, so the two ends can't drift.

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
  yield* readFrames(res.body);
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
