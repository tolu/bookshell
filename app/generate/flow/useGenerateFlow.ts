"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Brief } from "@/lib/agent/stages/brief";
import { stripArtifactHtml } from "@/lib/releases/strip";
import {
  DEMO,
  EMPTY,
  FALLBACK_MESSAGES,
  LONG_LIMIT,
  type FormState,
  type QaState,
} from "./model";
import { type Phase, deriveStep, isBusy, isStreaming } from "./phase";
import { postBrief, saveArtifact, streamBuild } from "./requests";
import { useStreamingIframe } from "./useStreamingIframe";

// All state, side effects, and handlers for the generation flow. The view
// (GenerateForm + ui/*) is markup-only; everything that isn't JSX lives here.
// The phases and their transitions are documented in ./phase.ts.
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
  const stream = useStreamingIframe();

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
    stream.reset();
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
    stream.reset();
    stream.start();
    setPhase("building");

    // Throttle setHtml so the React tree doesn't re-render per token. The
    // iframe is fed directly by the stream hook; the accumulator only needs
    // occasional sync for save/QA/openInNewTab/character display.
    let acc = "";
    let lastHtmlSync = 0;
    const syncHtml = (force = false) => {
      if (typeof performance === "undefined") {
        if (force) setHtml(acc);
        return;
      }
      const now = performance.now();
      if (force || now - lastHtmlSync >= 150) {
        lastHtmlSync = now;
        setHtml(acc);
      }
    };
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
          stream.append(frame.text);
          syncHtml();
        } else if (frame.type === "qa") {
          setQa({ passed: frame.passed, findings: frame.findings, critic: frame.critic });
        } else if (frame.type === "error") {
          stream.complete();
          setError(frame.message);
          setHtml(stripArtifactHtml(acc));
          setPhase(acc ? "buildReview" : "briefReview");
          return;
        } else if (frame.type === "done") {
          stream.complete();
          setHtml(stripArtifactHtml(acc));
          setTechNotes("");
          setPhase("buildReview");
          return;
        }
      }
      // Stream ended without an explicit done.
      stream.complete();
      if (acc) {
        setHtml(stripArtifactHtml(acc));
        setPhase("buildReview");
      } else {
        setPhase("briefReview");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        stream.reset();
        return;
      }
      stream.complete();
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
    stream.reset();
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
  const longRemaining = LONG_LIMIT - form.longText.length;

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
    // streaming iframe (bind to the preview <iframe>)
    iframeRef: stream.iframeRef,
    onIframeLoad: stream.onIframeLoad,
    // derived
    streaming: isStreaming(phase),
    busy: isBusy(phase),
    longRemaining,
    step: deriveStep(phase),
  };
}

export type GenerateFlow = ReturnType<typeof useGenerateFlow>;
