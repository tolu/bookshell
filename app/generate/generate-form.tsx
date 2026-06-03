"use client";

import styles from "./generate.module.css";
import { FALLBACK_MESSAGES, LONG_LIMIT } from "./types";
import { useGenerateFlow } from "./use-generate-flow";

export function GenerateForm() {
  const f = useGenerateFlow();
  const { form, phase, brief, html, qa, busy } = f;
  const formLocked = busy || phase !== "idle";

  return (
    <div className={styles.layout}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          f.generateBrief();
        }}
      >
        <label className={styles.field}>
          <span>Tittel</span>
          <input required disabled={formLocked} value={form.title}
            onChange={(e) => f.update("title", e.target.value)} placeholder="Alt starter med en drøm" />
        </label>
        <label className={styles.field}>
          <span>Forfatter</span>
          <input required disabled={formLocked} value={form.author}
            onChange={(e) => f.update("author", e.target.value)} placeholder="Antonio Nusa" />
        </label>
        <label className={styles.field}>
          <span>Sjanger</span>
          <input required disabled={formLocked} value={form.genre}
            onChange={(e) => f.update("genre", e.target.value)} placeholder="Biografi · Idrett" />
        </label>
        <label className={styles.field}>
          <span>Forside (URL)</span>
          <input type="url" disabled={formLocked} value={form.imageUrl}
            onChange={(e) => f.update("imageUrl", e.target.value)}
            placeholder="https://… (valgfritt — brukes for fargepalett)" />
        </label>
        <label className={styles.field}>
          <span>Pitch (en setning)</span>
          <input required disabled={formLocked} value={form.description}
            onChange={(e) => f.update("description", e.target.value)}
            placeholder="Reisen bak suksessen til Antonio Nusa" />
        </label>
        <label className={styles.field}>
          <span>
            Sammendrag / brødtekst{" "}
            <em className={f.longRemaining < 0 ? styles.over : styles.count}>{f.longRemaining} tegn igjen</em>
          </span>
          <textarea required disabled={formLocked} rows={10} maxLength={LONG_LIMIT}
            value={form.longText} onChange={(e) => f.update("longText", e.target.value)}
            placeholder="2000 tegn med synopsis, utdrag eller pressetekst…" />
        </label>
        <label className={styles.field}>
          <span>Redaktørens føringer (valgfritt)</span>
          <textarea rows={3} disabled={formLocked} value={form.editorNotes}
            onChange={(e) => f.update("editorNotes", e.target.value)}
            placeholder={"Du sitter i førersetet — sett retningen før vi starter. Tone, vinkling, hva du vil fremheve eller unngå. F.eks. «Hold det stramt og elegant», «spill på havet og ensomheten», «unngå sjangerklisjeer»."} />
        </label>
        <label className={styles.field}>
          <span>Omtale / sitater (valgfritt)</span>
          <textarea rows={3} disabled={formLocked} value={form.praise}
            onChange={(e) => f.update("praise", e.target.value)}
            placeholder={'Ekte sitater og terningkast, ett per linje. F.eks.\n★★★★★ «Mesterlig.» — VG'} />
        </label>

        <div className={styles.actions}>
          {phase === "idle" ? (
            <button type="submit" className={styles.primary} disabled={busy}>
              Lag design-brief
            </button>
          ) : (
            <button type="button" className={styles.secondary} onClick={f.startOver} disabled={busy}>
              Start på nytt
            </button>
          )}
        </div>

        {f.error && <p className={styles.error}>Feil: {f.error}</p>}
        {phase === "saved" && (
          <p className={styles.success}>
            Lagret. <a href={f.previewUrl ?? "#"}>Åpne utgivelsessiden →</a>
          </p>
        )}
      </form>

      <aside className={styles.preview}>
        <header className={styles.previewHead}>
          <ol className={styles.steps}>
            <li className={f.step === 1 ? styles.stepOn : ""}>1 Brief</li>
            <li className={f.step === 2 ? styles.stepOn : ""}>2 Side</li>
            <li className={f.step === 3 ? styles.stepOn : ""}>3 Lagre</li>
          </ol>
          <div className={styles.previewActions}>
            {(phase === "buildReview" || phase === "saving" || phase === "saved") && html && (
              <>
                <button type="button" className={styles.previewBtn} onClick={f.openInNewTab} title="Åpne i ny fane">
                  Full størrelse ↗
                </button>
                <button type="button" className={styles.previewBtn} onClick={() => navigator.clipboard.writeText(html)}>
                  Kopier HTML
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Brief review ───────────────────────────────────────────── */}
        {phase === "briefReview" && brief && (
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
              <textarea rows={3} value={f.feedback} onChange={(e) => f.setFeedback(e.target.value)}
                placeholder={"Du bestemmer retningen — det du skriver styrer neste utkast. Vær konkret:\n• «Mørkere og mer urovekkende»\n• «Bygg alt rundt fyrtårnet som motiv»\n• «Dropp det maritime, gjør det mer klaustrofobisk»\n• «Dristigere, mye større typografi»"} />
              <small className={styles.hint}>Jo mer konkret regi, jo større effekt på resultatet.</small>
            </label>
            <div className={styles.reviewActions}>
              <button type="button" className={styles.primary} onClick={() => f.build(false)}>
                Godkjenn brief → bygg side
              </button>
              <button type="button" className={styles.secondary} disabled={!f.feedback.trim()}
                onClick={() => f.generateBrief(f.feedback.trim())}>
                Send tilbakemelding
              </button>
            </div>
          </section>
        )}

        {/* ── Build review: QA + technical notes ─────────────────────── */}
        {phase === "buildReview" && qa && (
          <section className={styles.qa}>
            <span className={`${styles.qaBadge} ${qa.passed ? styles.qaPass : styles.qaFail}`}>
              QA-vurdering {qa.passed ? "✓ godkjent" : "— se funn"}
              {qa.critic && ` · selger ${qa.critic.scores.sellability}/5`}
            </span>
            {qa.critic?.summary && <p className={styles.qaSummary}>{qa.critic.summary}</p>}
            {(qa.findings.length > 0 || (qa.critic?.issues?.length ?? 0) > 0) && (
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
        )}

        <div className={styles.frameWrap}>
          {(phase === "buildReview" || phase === "saving" || phase === "saved") && html ? (
            <iframe key={`final-${html.length}`} className={styles.frame} sandbox="" srcDoc={html}
              title="Forhåndsvisning av generert side" />
          ) : (
            <div className={styles.empty}>
              {busy ? (
                <>
                  <span className={styles.streamDot} aria-hidden="true" />
                  <span key={f.streamLabel} className={styles.streamLabel}>{f.streamLabel || "Arbeider…"}</span>
                  {f.streaming && (
                    <span className={styles.streamMeta}>
                      {html.length > 0 ? `${html.length.toLocaleString("nb-NO")} tegn mottatt` : ""}
                    </span>
                  )}
                  <span key={`fallback-${f.fallbackIdx}`} className={styles.streamFallback}>
                    {FALLBACK_MESSAGES[f.fallbackIdx]}
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

        {/* ── Build review actions ───────────────────────────────────── */}
        {phase === "buildReview" && (
          <div className={styles.briefReviewPane}>
            <label className={styles.field}>
              <span>Dine endringer til frontend-utvikleren (valgfritt)</span>
              <textarea rows={3} value={f.techNotes} onChange={(e) => f.setTechNotes(e.target.value)}
                placeholder={"Pek på det du vil ha endret — dette går rett inn i ombyggingen. Vær spesifikk:\n• «Mindre tittel så den ikke kuttes på kanten»\n• «Mer luft rundt sitatet»\n• «Sterkere kontrast i brødteksten»\n• «La forsiden fylle mindre på mobil»"} />
              <small className={styles.hint}>Konkrete, spesifikke notater gir best resultat — du styrer ombyggingen.</small>
            </label>
            <div className={styles.reviewActions}>
              <button type="button" className={styles.primary} onClick={f.onSave}>
                Lagre som utgivelse
              </button>
              <button type="button" className={styles.secondary} onClick={() => f.build(true)}>
                Be om endringer
              </button>
              <button type="button" className={styles.ghost} onClick={() => f.setPhase("briefReview")}>
                Tilbake til brief
              </button>
            </div>
          </div>
        )}

        {phase === "saving" && <p className={styles.savingNote}>Lagrer utgivelse…</p>}
      </aside>
    </div>
  );
}
