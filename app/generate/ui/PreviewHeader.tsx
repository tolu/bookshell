import styles from "../generate.module.css";

// The preview column's header: the 1·2·3 progress steps, plus the
// open-in-new-tab / copy-HTML actions once a finished render exists.
type Props = {
  step: 1 | 2 | 3;
  showArtifactActions: boolean;
  html: string;
  onOpenInNewTab: () => void;
};

export function PreviewHeader({ step, showArtifactActions, html, onOpenInNewTab }: Props) {
  return (
    <header className={styles.previewHead}>
      <ol className={styles.steps}>
        <li className={step === 1 ? styles.stepOn : ""}>1 Brief</li>
        <li className={step === 2 ? styles.stepOn : ""}>2 Side</li>
        <li className={step === 3 ? styles.stepOn : ""}>3 Lagre</li>
      </ol>
      <div className={styles.previewActions}>
        {showArtifactActions && (
          <>
            <button type="button" className={styles.previewBtn} onClick={onOpenInNewTab} title="Åpne i ny fane">
              Full størrelse ↗
            </button>
            <button type="button" className={styles.previewBtn} onClick={() => navigator.clipboard.writeText(html)}>
              Kopier HTML
            </button>
          </>
        )}
      </div>
    </header>
  );
}
