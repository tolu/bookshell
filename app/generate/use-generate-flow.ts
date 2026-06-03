"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Brief } from "@/lib/gemini/brief";
import { stripArtifactHtml } from "@/lib/releases/strip";
import {
  DEMO,
  EMPTY,
  FALLBACK_MESSAGES,
  LONG_LIMIT,
  type FormState,
  type Phase,
  type QaState,
} from "./types";
import { postBrief, saveArtifact, streamBuild } from "./api";

// All state, side effects, and handlers for the generation flow. The component
// is markup-only; everything that isn't JSX lives here.
export function useGenerateFlow() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState<FormState>(searchParams.get("demo") != null ? DEMO : EMPTY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [html, setHtml] = useState("");
  const [qa, setQa] = useState<QaState | null>(null);
  const [streamLabel, setStreamLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [techNotes, setTechNotes] = useState("");
  const [fallbackIdx, setFallbackIdx] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // Cycle fallback messages while a stage is working.
  useEffect(() => {
    if (phase !== "briefing" && phase !== "building") return;
    const id = setInterval(() => setFallbackIdx((i) => (i + 1) % FALLBACK_MESSAGES.length), 2600);
    return () => clearInterval(id);
  }, [phase]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Stage 1: brief (initial + feedback iterations) ──────────────────────
  async function generateBrief(feedbackText?: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("briefing");
    try {
      const next = await postBrief(form, {
        feedback: feedbackText,
        priorBrief: brief,
        signal: ctrl.signal,
      });
      setBrief(next);
      setFeedback("");
      setPhase("briefReview");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setPhase(brief ? "briefReview" : "idle");
    }
  }

  // ── Stage 2/3: build (fresh) or revise, then QA ─────────────────────────
  async function build(revise: boolean) {
    if (!brief) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setQa(null);
    setHtml("");
    setStreamLabel("Starter…");
    setPhase("building");

    let acc = "";
    try {
      const frames = streamBuild(form, brief, {
        revise: revise ? { html, notes: techNotes } : undefined,
        signal: ctrl.signal,
      });
      for await (const frame of frames) {
        if (frame.type === "status") {
          setStreamLabel(frame.label);
        } else if (frame.type === "token") {
          acc += frame.text;
          setHtml(acc);
        } else if (frame.type === "qa") {
          setQa({ passed: frame.passed, findings: frame.findings, critic: frame.critic });
        } else if (frame.type === "error") {
          setError(frame.message);
          setHtml(stripArtifactHtml(acc));
          setPhase(acc ? "buildReview" : "briefReview");
          return;
        } else if (frame.type === "done") {
          setHtml(stripArtifactHtml(acc));
          setTechNotes("");
          setPhase("buildReview");
          return;
        }
      }
      // Stream ended without an explicit done.
      if (acc) {
        setHtml(stripArtifactHtml(acc));
        setPhase("buildReview");
      } else {
        setPhase("briefReview");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setHtml(acc ? stripArtifactHtml(acc) : "");
      setPhase(acc ? "buildReview" : "briefReview");
    }
  }

  async function onSave() {
    if (!html) return;
    setPhase("saving");
    try {
      const { previewUrl: url } = await saveArtifact({ form, html, brief, qa, techNotes });
      setPreviewUrl(url);
      setPhase("saved");
    } catch (err) {
      setError((err as Error).message);
      setPhase("buildReview");
    }
  }

  function startOver() {
    abortRef.current?.abort();
    setPhase("idle");
    setBrief(null);
    setHtml("");
    setQa(null);
    setError(null);
    setFeedback("");
    setTechNotes("");
  }

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), w ? 60_000 : 0);
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const streaming = phase === "building";
  const busy = phase === "briefing" || phase === "building" || phase === "saving";
  const longRemaining = LONG_LIMIT - form.longText.length;
  const step =
    phase === "idle" || phase === "briefing" || phase === "briefReview"
      ? 1
      : phase === "building" || phase === "buildReview"
        ? 2
        : 3;

  return {
    // state
    form,
    phase,
    brief,
    html,
    qa,
    streamLabel,
    error,
    previewUrl,
    feedback,
    techNotes,
    fallbackIdx,
    // setters used by markup
    update,
    setFeedback,
    setTechNotes,
    setPhase,
    // handlers
    generateBrief,
    build,
    onSave,
    startOver,
    openInNewTab,
    // derived
    streaming,
    busy,
    longRemaining,
    step,
  };
}
