import styles from "../generate.module.css";
import type { Brief } from "@/lib/agent/stages/brief";

// Stage-1 gate: show the art director's brief and let the editor either approve
// it (→ build) or send regi (free-text direction) to refine it. This is one
// half of the human feedback loop.
type Props = {
  brief: Brief;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onApprove: () => void;
  onSendFeedback: () => void;
};

export function BriefReview({ brief, feedback, onFeedbackChange, onApprove, onSendFeedback }: Props) {
  return (
    <section className={styles.brief}>
      <div className={styles.briefHead}><span>Design-brief — gjennomgå og godkjenn</span></div>
      <p className={styles.briefSummary}>{brief.humanSummary}</p>
      <div className={styles.briefMeta}>
        <span><b>Motiv:</b> {brief.motif}</span>
        <span><b>Visuelt system:</b> {brief.visualSystem}</span>
        <span><b>Palett:</b> {brief.paletteDirection}</span>
        <span><b>Krok:</b> {brief.marketingHook}</span>
      </div>
      {brief.pullQuotes.length > 0 && (
        <ul className={styles.briefQuotes}>
          {brief.pullQuotes.map((q, i) => (
            <li key={i}>“{q.text}”<cite>{q.source}</cite></li>
          ))}
        </ul>
      )}
      <label className={styles.field}>
        <span>Din regi til art directoren (valgfritt)</span>
        <textarea rows={3} value={feedback} onChange={(e) => onFeedbackChange(e.target.value)}
          placeholder={"Du bestemmer retningen — det du skriver styrer neste utkast. Vær konkret:\n• «Mørkere og mer urovekkende»\n• «Bygg alt rundt fyrtårnet som motiv»\n• «Dropp det maritime, gjør det mer klaustrofobisk»\n• «Dristigere, mye større typografi»"} />
        <small className={styles.hint}>Jo mer konkret regi, jo større effekt på resultatet.</small>
      </label>
      <div className={styles.reviewActions}>
        <button type="button" className={styles.primary} onClick={onApprove}>
          Godkjenn brief → bygg side
        </button>
        <button type="button" className={styles.secondary} disabled={!feedback.trim()} onClick={onSendFeedback}>
          Send tilbakemelding
        </button>
      </div>
    </section>
  );
}
