"use client";

import { useEffect, useRef, useState } from "react";
import { useStreamingIframe } from "../generate/flow/useStreamingIframe";

// Dev/test-only mock harness for the streaming-iframe hook. Mounts the iframe
// outside the generate flow and feeds it hand-crafted chunks at a fixed
// cadence — no Gemini call. Iterate the hook against this page.
//
// Gated by the route's server wrapper (./page.tsx) on ENABLE_PREVIEW_DEV so
// it doesn't ship to real production deployments.
//
// BUILD_VERSION is hardcoded; the spec checks data-testid="build-version" to
// confirm the server has actually served the latest code before asserting
// anything else.
const BUILD_VERSION = "v5-2026-06-04";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Streaming demo</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; padding: 2rem; background: #fef9f3; color: #1a1a1a; }
  h1 { color: #c0392b; margin-bottom: 0.2rem; }
  .meta { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
  p { line-height: 1.6; margin: 0 0 1rem; }
  .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; background: #c0392b; color: white; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>Gardens of the Moon</h1>
<p class="meta">Steven Erikson · <span class="badge">Dark Fantasy</span></p>
<p>Bled dry by interminable warfare, infighting and bloody confrontations with Lord Anomander Rake and his Tiste Andii, the vast, sprawling Malazan empire simmers with discontent.</p>
<p>Even its imperial legions yearn for some respite.</p>
<p>However, it seems the empire is not alone in this great game. Sinister forces gather as the gods themselves prepare to play their hand.</p>
<p>Conceived and written on an epic scale, Gardens of the Moon is a breathtaking achievement.</p>
</body>
</html>`;

// Split the sample into ~8 chunks of roughly equal size. Mirrors how the
// agent yields token bursts.
function chunkHtml(html: string, n: number): string[] {
  const len = Math.ceil(html.length / n);
  const out: string[] = [];
  for (let i = 0; i < html.length; i += len) out.push(html.slice(i, i + len));
  return out;
}

const CHUNKS = chunkHtml(SAMPLE_HTML, 8);

type State = "idle" | "streaming" | "done";

export function PreviewDevHarness() {
  const stream = useStreamingIframe();
  const [phase, setPhase] = useState<State>("idle");
  const [step, setStep] = useState(0);
  const [docLen, setDocLen] = useState(0);
  const [withFence, setWithFence] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Poll the iframe contentDocument length so we can show it live in the UI.
  useEffect(() => {
    const id = window.setInterval(() => {
      const doc = stream.iframeRef.current?.contentDocument;
      setDocLen(doc?.documentElement?.outerHTML.length ?? 0);
    }, 200);
    return () => window.clearInterval(id);
  }, [stream.iframeRef]);

  function startStream() {
    if (timerRef.current != null) return;
    setPhase("streaming");
    setStep(0);
    stream.reset();
    stream.start();
    const chunks = withFence ? ["```html\n", ...CHUNKS, "\n```"] : CHUNKS;
    let i = 0;
    const tick = () => {
      if (i >= chunks.length) {
        stream.complete();
        setPhase("done");
        timerRef.current = null;
        return;
      }
      const chunk = chunks[i++];
      if (chunk != null) stream.append(chunk);
      setStep(i);
      timerRef.current = window.setTimeout(tick, 250);
    };
    tick();
  }

  function resetAll() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stream.reset();
    setPhase("idle");
    setStep(0);
  }

  return (
    <div style={{ display: "grid", gap: "1rem", padding: "1.5rem", maxWidth: "60rem", margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Preview-stream dev harness</h1>
      <p data-testid="build-version" style={{ margin: 0, color: "#888", fontFamily: "ui-monospace, monospace" }}>
        build: {BUILD_VERSION}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button data-testid="btn-start" onClick={startStream} disabled={phase === "streaming"}>
          Stream sample HTML
        </button>
        <button data-testid="btn-reset" onClick={resetAll}>Reset</button>
        <button data-testid="btn-complete" onClick={() => { stream.complete(); setPhase("done"); }}>
          Complete now
        </button>
        <label style={{ marginInlineStart: "0.75rem", fontSize: "0.9rem", alignSelf: "center" }}>
          <input
            type="checkbox"
            data-testid="opt-fence"
            checked={withFence}
            onChange={(e) => setWithFence(e.target.checked)}
            disabled={phase === "streaming"}
          />{" "}
          Prepend ```html fence
        </label>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.25rem 1rem",
          margin: 0,
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.85rem",
        }}
      >
        <dt>phase</dt><dd data-testid="phase">{phase}</dd>
        <dt>step</dt><dd data-testid="step">{step} / {CHUNKS.length}</dd>
        <dt>iframe docLen</dt><dd data-testid="doc-len">{docLen}</dd>
      </dl>

      <div
        data-testid="frame-wrap"
        style={{
          position: "relative",
          border: "1px solid #ccc",
          borderRadius: 8,
          overflow: "hidden",
          aspectRatio: "4 / 5",
          background: "#fff",
        }}
      >
        <iframe
          ref={stream.iframeRef}
          onLoad={stream.onIframeLoad}
          data-testid="preview-iframe"
          sandbox="allow-same-origin"
          title="Stream test iframe"
          style={{ width: "100%", height: "100%", border: 0, background: "white" }}
        />
      </div>
    </div>
  );
}
