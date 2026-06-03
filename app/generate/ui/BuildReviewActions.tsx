import styles from "../generate.module.css";

// Stage-2 gate: the editor reviews the rendered page and either saves it,
// requests changes (technical notes → revise), or steps back to the brief.
// This is the other half of the human feedback loop.
type Props = {
  techNotes: string;
  onTechNotesChange: (value: string) => void;
  onSave: () => void;
  onRevise: () => void;
  onBackToBrief: () => void;
};

export function BuildReviewActions({
  techNotes,
  onTechNotesChange,
  onSave,
  onRevise,
  onBackToBrief,
}: Props) {
  return (
    <div className={styles.briefReviewPane}>
      <label className={styles.field}>
        <span>Dine endringer til frontend-utvikleren (valgfritt)</span>
        <textarea rows={3} value={techNotes} onChange={(e) => onTechNotesChange(e.target.value)}
          placeholder={"Pek på det du vil ha endret — dette går rett inn i ombyggingen. Vær spesifikk:\n• «Mindre tittel så den ikke kuttes på kanten»\n• «Mer luft rundt sitatet»\n• «Sterkere kontrast i brødteksten»\n• «La forsiden fylle mindre på mobil»"} />
        <small className={styles.hint}>Konkrete, spesifikke notater gir best resultat — du styrer ombyggingen.</small>
      </label>
      <div className={styles.reviewActions}>
        <button type="button" className={styles.primary} onClick={onSave}>
          Lagre som utgivelse
        </button>
        <button type="button" className={styles.secondary} onClick={onRevise}>
          Be om endringer
        </button>
        <button type="button" className={styles.ghost} onClick={onBackToBrief}>
          Tilbake til brief
        </button>
      </div>
    </div>
  );
}
