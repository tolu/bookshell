import styles from "../generate.module.css";
import { FALLBACK_MESSAGES } from "../flow/model";
import type { Phase } from "../flow/phase";

// The preview surface: the sandboxed iframe once a render exists, otherwise the
// streaming progress display (while busy) or a prompt to move the flow forward.
type Props = {
  phase: Phase;
  html: string;
  busy: boolean;
  streaming: boolean;
  streamLabel: string;
  fallbackIdx: number;
};

export function PreviewPane({ phase, html, busy, streaming, streamLabel, fallbackIdx }: Props) {
  const showFrame = (phase === "buildReview" || phase === "saving" || phase === "saved") && Boolean(html);

  return (
    <div className={styles.frameWrap}>
      {showFrame ? (
        <iframe key={`final-${html.length}`} className={styles.frame} sandbox="" srcDoc={html}
          title="Forhåndsvisning av generert side" />
      ) : (
        <div className={styles.empty}>
          {busy ? (
            <>
              <span className={styles.streamDot} aria-hidden="true" />
              <span key={streamLabel} className={styles.streamLabel}>{streamLabel || "Arbeider…"}</span>
              {streaming && (
                <span className={styles.streamMeta}>
                  {html.length > 0 ? `${html.length.toLocaleString("nb-NO")} tegn mottatt` : ""}
                </span>
              )}
              <span key={`fallback-${fallbackIdx}`} className={styles.streamFallback}>
                {FALLBACK_MESSAGES[fallbackIdx]}
              </span>
            </>
          ) : phase === "idle" ? (
            "Fyll inn skjemaet og lag en design-brief."
          ) : (
            "Gjennomgå design-briefen til venstre for forhåndsvisning."
          )}
        </div>
      )}
    </div>
  );
}
