import styles from "../generate.module.css";
import type { QaState } from "../flow/model";

// The QA verdict shown above the finished render: the pass/fail badge, the
// critic's summary, and the merged list of lint findings + critic issues.
// Reported only — the editor decides whether to act on it.
type Props = { qa: QaState };

export function QaReport({ qa }: Props) {
  const hasIssues = qa.findings.length > 0 || (qa.critic?.issues?.length ?? 0) > 0;
  return (
    <section className={styles.qa}>
      <span className={`${styles.qaBadge} ${qa.passed ? styles.qaPass : styles.qaFail}`}>
        QA-vurdering {qa.passed ? "✓ godkjent" : "— se funn"}
        {qa.critic && ` · selger ${qa.critic.scores.sellability}/5`}
      </span>
      {qa.critic?.summary && <p className={styles.qaSummary}>{qa.critic.summary}</p>}
      {hasIssues && (
        <ul className={styles.qaFindings}>
          {qa.findings.map((finding, i) => (
            <li key={`l${i}`}>{finding.severity === "error" ? "✕" : "⚠"} {finding.message}</li>
          ))}
          {qa.critic?.issues.map((issue, i) => (
            <li key={`c${i}`}>• [{issue.area}] {issue.what}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
