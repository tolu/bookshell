"use client";

import { useCallback, useRef } from "react";

// Drive the preview iframe imperatively. The agent streams HTML token-by-token;
// instead of re-rendering React (which would force the iframe to re-navigate
// every token and end up blank — see commit 17b1663), we feed the browser's
// own incremental HTML parser via contentDocument.open/write/close. The iframe
// shell mounts once; chunks land outside the React tree.
//
// Quirks-mode note: the agent always emits <!DOCTYPE html> first, but a tiny
// fence ("```html\n") may precede it (mirrors stripArtifactHtml). We swallow
// that, then pass everything through. A missing/late DOCTYPE only means quirks
// mode, which is fine for preview — don't "fix" by buffering.

type IframeState = "idle" | "open" | "closed";

const FENCE_RE = /^\s*```(?:html)?\s*\n/i;
const FENCE_SCAN_LIMIT = 32;

export function useStreamingIframe() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<IframeState>("idle");
  const queueRef = useRef<string[]>([]);
  const pendingPreOpenRef = useRef<string>("");
  const rafRef = useRef<number | null>(null);
  const fenceBufRef = useRef<string>("");
  const fenceDecidedRef = useRef<boolean>(false);

  const doc = (): Document | null => iframeRef.current?.contentDocument ?? null;

  const flushQueue = useCallback(() => {
    rafRef.current = null;
    if (stateRef.current !== "open") return;
    const d = doc();
    if (!d || queueRef.current.length === 0) return;
    const chunk = queueRef.current.join("");
    queueRef.current = [];
    d.write(chunk);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    if (typeof window === "undefined") return;
    rafRef.current = window.requestAnimationFrame(flushQueue);
  }, [flushQueue]);

  // Strip a leading ```html fence if present. Returns the text with fence
  // removed, or null when we don't have enough bytes yet to decide.
  const consumeFence = useCallback((text: string): string | null => {
    if (fenceDecidedRef.current) return text;
    fenceBufRef.current += text;
    const buf = fenceBufRef.current;
    // No leading backtick at all → no fence; emit everything.
    if (!buf.trimStart().startsWith("`")) {
      fenceDecidedRef.current = true;
      const out = buf;
      fenceBufRef.current = "";
      return out;
    }
    // Have a backtick; wait for the closing newline of the opening fence.
    const m = buf.match(FENCE_RE);
    if (m) {
      fenceDecidedRef.current = true;
      const out = buf.slice(m[0].length);
      fenceBufRef.current = "";
      return out;
    }
    // Give up scanning if it's clearly not a fence.
    if (buf.length >= FENCE_SCAN_LIMIT) {
      fenceDecidedRef.current = true;
      const out = buf;
      fenceBufRef.current = "";
      return out;
    }
    return null;
  }, []);

  const start = useCallback(() => {
    // Idempotent within a generation — StrictMode mounts effects twice.
    if (stateRef.current === "open") return;
    const d = doc();
    if (!d) {
      // Iframe not yet loaded — chunks queued via append() into pendingPreOpenRef
      // will be flushed in onLoad-driven start (called again from append).
      return;
    }
    d.open();
    stateRef.current = "open";
    if (pendingPreOpenRef.current) {
      queueRef.current.push(pendingPreOpenRef.current);
      pendingPreOpenRef.current = "";
      scheduleFlush();
    }
  }, [scheduleFlush]);

  const append = useCallback(
    (chunk: string) => {
      if (stateRef.current === "closed") return;
      const piece = consumeFence(chunk);
      if (piece == null || piece === "") return;
      if (stateRef.current === "idle") {
        // Iframe shell exists but contentDocument may not be ready yet, or
        // start() hasn't been called. Buffer; start()/onLoad will flush.
        pendingPreOpenRef.current += piece;
        // Best-effort: if the iframe is actually ready, transition now.
        if (doc()) start();
        return;
      }
      queueRef.current.push(piece);
      scheduleFlush();
    },
    [consumeFence, scheduleFlush, start],
  );

  const complete = useCallback(() => {
    if (stateRef.current === "closed") return;
    if (rafRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const d = doc();
    if (d) {
      if (queueRef.current.length > 0) {
        d.write(queueRef.current.join(""));
        queueRef.current = [];
      }
      // Flush any remaining pre-open buffer too (rare: completed before load).
      if (pendingPreOpenRef.current) {
        if (stateRef.current === "idle") d.open();
        d.write(pendingPreOpenRef.current);
        pendingPreOpenRef.current = "";
      }
      if (stateRef.current !== "idle") d.close();
    }
    stateRef.current = "closed";
  }, []);

  const reset = useCallback(() => {
    // Cancel any pending flush, blank the iframe, return to idle.
    if (rafRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    queueRef.current = [];
    pendingPreOpenRef.current = "";
    fenceBufRef.current = "";
    fenceDecidedRef.current = false;
    const d = doc();
    if (d) {
      d.open();
      d.close();
    }
    stateRef.current = "idle";
  }, []);

  // Bound to the iframe's onLoad — flushes any chunks buffered before the
  // about:blank document was ready.
  const onIframeLoad = useCallback(() => {
    if (stateRef.current !== "idle") return;
    if (!pendingPreOpenRef.current) return;
    start();
  }, [start]);

  return { iframeRef, start, append, complete, reset, onIframeLoad };
}

export type StreamingIframe = ReturnType<typeof useStreamingIframe>;
