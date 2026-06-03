"use client";

import styles from "./generate.module.css";
import { useGenerateFlow } from "./flow/useGenerateFlow";
import { BookMetadataForm } from "./ui/BookMetadataForm";
import { PreviewHeader } from "./ui/PreviewHeader";
import { BriefReview } from "./ui/BriefReview";
import { QaReport } from "./ui/QaReport";
import { PreviewPane } from "./ui/PreviewPane";
import { BuildReviewActions } from "./ui/BuildReviewActions";

// Orchestrator only: it holds the flow state (useGenerateFlow), lays out the two
// columns, and routes each phase to the right review pane. All markup lives in
// the ui/* components; all behaviour lives in flow/*.
export function GenerateForm() {
  const f = useGenerateFlow();
  const { phase, brief, html, qa, busy } = f;
  const formLocked = busy || phase !== "idle";
  const hasArtifact = (phase === "buildReview" || phase === "saving" || phase === "saved") && Boolean(html);

  return (
    <div className={styles.layout}>
      <BookMetadataForm
        form={f.form}
        locked={formLocked}
        busy={busy}
        phase={phase}
        error={f.error}
        previewUrl={f.previewUrl}
        longRemaining={f.longRemaining}
        onUpdate={f.update}
        onSubmit={() => f.generateBrief()}
        onStartOver={f.startOver}
      />

      <aside className={styles.preview}>
        <PreviewHeader
          step={f.step}
          showArtifactActions={hasArtifact}
          html={html}
          onOpenInNewTab={f.openInNewTab}
        />

        {phase === "briefReview" && brief && (
          <BriefReview
            brief={brief}
            feedback={f.feedback}
            onFeedbackChange={f.setFeedback}
            onApprove={() => f.build(false)}
            onSendFeedback={() => f.generateBrief(f.feedback.trim())}
          />
        )}

        {phase === "buildReview" && qa && <QaReport qa={qa} />}

        <PreviewPane
          phase={phase}
          html={html}
          busy={busy}
          streaming={f.streaming}
          streamLabel={f.streamLabel}
          fallbackIdx={f.fallbackIdx}
        />

        {phase === "buildReview" && (
          <BuildReviewActions
            techNotes={f.techNotes}
            onTechNotesChange={f.setTechNotes}
            onSave={f.onSave}
            onRevise={() => f.build(true)}
            onBackToBrief={() => f.setPhase("briefReview")}
          />
        )}

        {phase === "saving" && <p className={styles.savingNote}>Lagrer utgivelse…</p>}
      </aside>
    </div>
  );
}
