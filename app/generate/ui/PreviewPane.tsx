import type { RefObject } from "react";
import styles from "../generate.module.css";
import { FALLBACK_MESSAGES } from "../flow/model";
import type { Phase } from "../flow/phase";

// The preview surface. Once streaming begins we mount the sandboxed iframe and
// keep it mounted through buildReview/saving/saved — content is written into
// it imperatively by useStreamingIframe (see ../flow/useStreamingIframe.ts).
//
// Overlay variants while streaming:
//   - html empty (pre-first-byte): centered overlay with dot + status label +
//     fallback message, so the user has copy to read while the model warms up
//     and the cover image is fetched.
//   - html populated: small corner pill with just the pulsing dot, so the
//     overlay doesn't obscure the live preview.
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
  const showFrame =
    streaming || ((phase === "buildReview" || phase === "saving" || phase === "saved") && Boolean(html));
  const waitingForFirstBytes = streaming && html.length === 0;

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
          {streaming && (waitingForFirstBytes ? (
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
