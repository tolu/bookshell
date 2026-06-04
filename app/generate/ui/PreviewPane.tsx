import { useEffect, useState, type RefObject } from "react";
import styles from "../generate.module.css";
import { FALLBACK_MESSAGES } from "../flow/model";
import type { Phase } from "../flow/phase";

// The preview surface. Once streaming begins we mount the sandboxed iframe and
// keep it mounted through buildReview/saving/saved — content is written into
// it imperatively by useStreamingIframe (see ../flow/useStreamingIframe.ts).
//
// Overlay variants while streaming:
//   - body still empty (<head>/<style> bytes streaming): centered overlay with
//     dot + status label + fallback message — paint hasn't started yet, so
//     the user needs copy to read.
//   - body has children: small corner pill with just the pulsing dot, so the
//     overlay doesn't obscure the live preview.
// The switch is gated on iframe.contentDocument.body.firstElementChild rather
// than html.length, because head-only bytes paint nothing and the overlay
// shouldn't disappear while the iframe is still blank.
//
// During the `briefing` phase the iframe isn't shown (no html yet), and the
// same dot+label+fallback runs in the empty container. `briefReview` skips
// rendering this pane entirely (handled by the parent).
type Props = {
  phase: Phase;
  html: string;
  busy: boolean;
  streaming: boolean;
  streamLabel: string;
  fallbackIdx: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onIframeLoad: () => void;
};

function useHasVisibleBodyContent(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  streaming: boolean,
): boolean {
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    if (!streaming) {
      setHasContent(false);
      return;
    }
    let raf = 0;
    const check = () => {
      const body = iframeRef.current?.contentDocument?.body;
      if (body && body.firstElementChild) {
        setHasContent(true);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [streaming, iframeRef]);

  return hasContent;
}

export function PreviewPane({
  phase,
  html,
  busy,
  streaming,
  streamLabel,
  fallbackIdx,
  iframeRef,
  onIframeLoad,
}: Props) {
  const hasVisibleBody = useHasVisibleBodyContent(iframeRef, streaming);
  const showFrame =
    streaming || ((phase === "buildReview" || phase === "saving" || phase === "saved") && Boolean(html));
  const waitingForFirstPaint = streaming && !hasVisibleBody;

  return (
    <div className={styles.frameWrap}>
      {showFrame ? (
        <>
          <iframe
            ref={iframeRef}
            onLoad={onIframeLoad}
            className={styles.frame}
            sandbox="allow-same-origin"
            title="Forhåndsvisning av generert side"
          />
          {streaming && (waitingForFirstPaint ? (
            <div className={styles.streamOverlayWaiting} aria-hidden="true">
              <span className={styles.streamDot} />
              <span key={streamLabel} className={styles.streamLabel}>
                {streamLabel || "Arbeider…"}
              </span>
              <span key={`fallback-${fallbackIdx}`} className={styles.streamFallback}>
                {FALLBACK_MESSAGES[fallbackIdx]}
              </span>
            </div>
          ) : (
            <div className={styles.streamOverlay} aria-hidden="true">
              <span className={styles.streamDot} />
            </div>
          ))}
        </>
      ) : (
        <div className={styles.empty}>
          {busy ? (
            <>
              <span className={styles.streamDot} aria-hidden="true" />
              <span key={streamLabel} className={styles.streamLabel}>{streamLabel || "Arbeider…"}</span>
              <span key={`fallback-${fallbackIdx}`} className={styles.streamFallback}>
                {FALLBACK_MESSAGES[fallbackIdx]}
              </span>
            </>
          ) : (
            "Fyll inn skjemaet og lag en design-brief."
          )}
        </div>
      )}
    </div>
  );
}
