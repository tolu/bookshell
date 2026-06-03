"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./generate.module.css";
import { useSearchParams } from "next/navigation";
import type { Brief } from "@/lib/gemini/brief";
import type { QaVerdict } from "@/lib/gemini/qa";

type FormState = {
  title: string;
  author: string;
  imageUrl: string;
  genre: string;
  description: string;
  longText: string;
  editorNotes: string;
  praise: string;
};

const EMPTY: FormState = {
  title: "",
  author: "",
  imageUrl: "",
  genre: "",
  description: "",
  longText: "",
  editorNotes: "",
  praise: "",
};

const LONG_LIMIT = 2000;

// Fallback status messages cycled while a stage hasn't sent its own.
const FALLBACK_MESSAGES = [
  "Strekker fingrene…",
  "Tenker på fargepaletten…",
  "Skisser ut komposisjonen…",
  "Velger typografisk hovedgrep…",
  "Vekter hierarkiet…",
  "Lager hover-animasjoner…",
  "Skrur til kontrastene…",
  "Polerer kantene…",
];

// The flow is a linear, human-gated state machine:
//   idle → briefing → briefReview → building → buildReview → saving → saved
// with briefReview looping on feedback and buildReview looping on revisions.
type Phase =
  | "idle"
  | "briefing"
  | "briefReview"
  | "building"
  | "buildReview"
  | "saving"
  | "saved";

type QaState = { passed: boolean; findings: { severity: string; message: string }[]; critic: QaVerdict | null };

// Strip a fenced code block iff the ENTIRE response is wrapped, and trim any
// stray characters past the closing </html>.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const opening = /^```(?:html)?\s*\n/i;
  const closing = /\n```\s*$/;
  if (opening.test(trimmed) && closing.test(trimmed)) {
    return trimmed.replace(opening, "").replace(closing, "").trim();
  }
  const end = trimmed.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) return trimmed.slice(0, end + "</html>".length);
  return trimmed;
}

const DEMO: FormState = {
  title: "Gardens of the Moon",
  author: "Steven Erikson",
  genre: "Dark Fantasy",
  imageUrl: "https://prod-bb-images.akamaized.net/book-covers/coverimage-9781473565531-coresourceprhuk-2025-02-19t15-02.jpg?w=640",
  description: `Erikson drops you into the deep end of a 300,000-year history. You will feel lost at first, but the thrill of piecing together the world yourself is unmatched.`,
  longText: `
Bled dry by interminable warfare, infighting and bloody confrontations with Lord Anomander Rake and his Tiste Andii, the vast, sprawling Malazan empire simmers with discontent.

Even its imperial legions yearn for some respite. For Sergeant Whiskeyjack and his Bridgeburners and for Tattersail, sole surviving sorceress of the Second Legion, the aftermath of the siege of Pale should have been a time to mourn the dead. But Darujhistan, last of the Free Cities of Genabackis, still holds out - and Empress Lasseen's ambition knows no bounds.

However, it seems the empire is not alone in this great game. Sinister forces gather as the gods themselves prepare to play their hand...

Conceived and written on an epic scale, Gardens of the Moon is a breathtaking achievement - a novel in which grand design, a dark and complex mythology, wild and wayward magic and a host of enduring characters combine with thrilling, powerful storytelling to resounding effect. Acclaimed by writers, critics and readers alike, here is the opening chapter in what has been hailed a landmark of epic fantasy: the awesome 'The Malazan Book of the Fallen'.
`,
  editorNotes: "",
  praise: `★★★★★ "A landmark of epic fantasy." — SFX\n"Grand, dark and magnificent." — Glen Cook`,
}

export function GenerateForm() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState<FormState>(searchParams.get("demo") != null ? DEMO : EMPTY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [html, setHtml] = useState("");
  const [qa, setQa] = useState<QaState | null>(null);
  const [streamLabel, setStreamLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [techNotes, setTechNotes] = useState("");
  const [fallbackIdx, setFallbackIdx] = useState(0);

  const streaming = phase === "building";

  // Cycle fallback messages while a stage is working.
  useEffect(() => {
    if (phase !== "briefing" && phase !== "building") return;
    const id = setInterval(() => setFallbackIdx((i) => (i + 1) % FALLBACK_MESSAGES.length), 2600);
    return () => clearInterval(id);
  }, [phase]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const abortRef = useRef<AbortController | null>(null);

  // ── Stage 1: brief (initial + feedback iterations) ──────────────────────
  async function generateBrief(feedbackText?: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("briefing");

    try {
      const res = await fetch("/api/generate/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify(
          feedbackText ? { ...form, feedback: feedbackText, priorBrief: brief } : form
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setPhase(brief ? "briefReview" : "idle");
        return;
      }
      setBrief(json.brief as Brief);
      setFeedback("");
      setPhase("briefReview");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setPhase(brief ? "briefReview" : "idle");
    }
  }

  // ── Stage 2/3: build (fresh) or revise, then QA ─────────────────────────
  async function build(revise: boolean) {
    if (!brief) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setQa(null);
    setHtml("");
    setStreamLabel("Starter…");
    setPhase("building");

    let res: Response;
    try {
      res = await fetch("/api/generate/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          ...form,
          brief,
          ...(revise ? { html, notes: techNotes } : {}),
        }),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setPhase("briefReview");
      return;
    }
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? `HTTP ${res.status}`);
      setPhase("briefReview");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";
    let qaResult: QaState | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let frame: { type: string; [k: string]: unknown };
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        if (frame.type === "status" && typeof frame.label === "string") {
          setStreamLabel(frame.label);
        } else if (frame.type === "token" && typeof frame.text === "string") {
          acc += frame.text;
          setHtml(acc);
        } else if (frame.type === "qa") {
          qaResult = {
            passed: Boolean(frame.passed),
            findings: Array.isArray(frame.findings) ? (frame.findings as QaState["findings"]) : [],
            critic: (frame.critic as QaVerdict) ?? null,
          };
          setQa(qaResult);
        } else if (frame.type === "error" && typeof frame.message === "string") {
          setError(frame.message);
          setHtml(stripFences(acc));
          setPhase(acc ? "buildReview" : "briefReview");
          return;
        } else if (frame.type === "done") {
          setHtml(stripFences(acc));
          setTechNotes("");
          setPhase("buildReview");
          return;
        }
      }
    }
    // Stream ended without an explicit done.
    if (acc) {
      setHtml(stripFences(acc));
      setPhase("buildReview");
    } else {
      setPhase("briefReview");
    }
  }

  async function onSave() {
    if (!html) return;
    setPhase("saving");
    try {
      const res = await fetch("/api/save-artifact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          author: form.author,
          genre: form.genre,
          description: form.description,
          html,
          designBrief: brief ? JSON.stringify(brief) : undefined,
          qaReport: qa ? JSON.stringify(qa) : undefined,
          editorNotes: form.editorNotes.trim() || undefined,
          praise: form.praise.trim() || undefined,
          technicalNotes: techNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        setPhase("buildReview");
        return;
      }
      setPreviewUrl(json.previewUrl);
      setPhase("saved");
    } catch (err) {
      setError((err as Error).message);
      setPhase("buildReview");
    }
  }

  function startOver() {
    abortRef.current?.abort();
    setPhase("idle");
    setBrief(null);
    setHtml("");
    setQa(null);
    setError(null);
    setFeedback("");
    setTechNotes("");
  }

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), w ? 60_000 : 0);
  }

  const busy = phase === "briefing" || phase === "building" || phase === "saving";
  const longRemaining = LONG_LIMIT - form.longText.length;
  const step = phase === "idle" || phase === "briefing" || phase === "briefReview" ? 1
    : phase === "building" || phase === "buildReview" ? 2 : 3;

  return (
    <div className={styles.layout}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          generateBrief();
        }}
      >
        <label className={styles.field}>
          <span>Tittel</span>
          <input required disabled={busy || phase !== "idle"} value={form.title}
            onChange={(e) => update("title", e.target.value)} placeholder="Alt starter med en drøm" />
        </label>
        <label className={styles.field}>
          <span>Forfatter</span>
          <input required disabled={busy || phase !== "idle"} value={form.author}
            onChange={(e) => update("author", e.target.value)} placeholder="Antonio Nusa" />
        </label>
        <label className={styles.field}>
          <span>Sjanger</span>
          <input required disabled={busy || phase !== "idle"} value={form.genre}
            onChange={(e) => update("genre", e.target.value)} placeholder="Biografi · Idrett" />
        </label>
        <label className={styles.field}>
          <span>Forside (URL)</span>
          <input type="url" disabled={busy || phase !== "idle"} value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
            placeholder="https://… (valgfritt — brukes for fargepalett)" />
        </label>
        <label className={styles.field}>
          <span>Pitch (en setning)</span>
          <input required disabled={busy || phase !== "idle"} value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Reisen bak suksessen til Antonio Nusa" />
        </label>
        <label className={styles.field}>
          <span>
            Sammendrag / brødtekst{" "}
            <em className={longRemaining < 0 ? styles.over : styles.count}>{longRemaining} tegn igjen</em>
          </span>
          <textarea required disabled={busy || phase !== "idle"} rows={10} maxLength={LONG_LIMIT}
            value={form.longText} onChange={(e) => update("longText", e.target.value)}
            placeholder="2000 tegn med synopsis, utdrag eller pressetekst…" />
        </label>
        <label className={styles.field}>
          <span>Redaktørens føringer (valgfritt)</span>
          <textarea rows={3} disabled={busy || phase !== "idle"} value={form.editorNotes}
            onChange={(e) => update("editorNotes", e.target.value)}
            placeholder={"Du sitter i førersetet — sett retningen før vi starter. Tone, vinkling, hva du vil fremheve eller unngå. F.eks. «Hold det stramt og elegant», «spill på havet og ensomheten», «unngå sjangerklisjeer»."} />
        </label>
        <label className={styles.field}>
          <span>Omtale / sitater (valgfritt)</span>
          <textarea rows={3} disabled={busy || phase !== "idle"} value={form.praise}
            onChange={(e) => update("praise", e.target.value)}
            placeholder={'Ekte sitater og terningkast, ett per linje. F.eks.\n★★★★★ «Mesterlig.» — VG'} />
        </label>

        <div className={styles.actions}>
          {phase === "idle" ? (
            <button type="submit" className={styles.primary} disabled={busy}>
              Lag design-brief
            </button>
          ) : (
            <button type="button" className={styles.secondary} onClick={startOver} disabled={busy}>
              Start på nytt
            </button>
          )}
        </div>

        {error && <p className={styles.error}>Feil: {error}</p>}
        {phase === "saved" && (
          <p className={styles.success}>
            Lagret. <a href={previewUrl ?? "#"}>Åpne utgivelsessiden →</a>
          </p>
        )}
      </form>

      <aside className={styles.preview}>
        <header className={styles.previewHead}>
          <ol className={styles.steps}>
            <li className={step === 1 ? styles.stepOn : ""}>1 Brief</li>
            <li className={step === 2 ? styles.stepOn : ""}>2 Side</li>
            <li className={step === 3 ? styles.stepOn : ""}>3 Lagre</li>
          </ol>
          <div className={styles.previewActions}>
            {(phase === "buildReview" || phase === "saving" || phase === "saved") && html && (
              <>
                <button type="button" className={styles.previewBtn} onClick={openInNewTab} title="Åpne i ny fane">
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
              <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)}
                placeholder={"Du bestemmer retningen — det du skriver styrer neste utkast. Vær konkret:\n• «Mørkere og mer urovekkende»\n• «Bygg alt rundt fyrtårnet som motiv»\n• «Dropp det maritime, gjør det mer klaustrofobisk»\n• «Dristigere, mye større typografi»"} />
              <small className={styles.hint}>Jo mer konkret regi, jo større effekt på resultatet.</small>
            </label>
            <div className={styles.reviewActions}>
              <button type="button" className={styles.primary} onClick={() => build(false)}>
                Godkjenn brief → bygg side
              </button>
              <button type="button" className={styles.secondary} disabled={!feedback.trim()}
                onClick={() => generateBrief(feedback.trim())}>
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
                {qa.findings.map((f, i) => (
                  <li key={`l${i}`}>{f.severity === "error" ? "✕" : "⚠"} {f.message}</li>
                ))}
                {qa.critic?.issues.map((f, i) => (
                  <li key={`c${i}`}>• [{f.area}] {f.what}</li>
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

        {/* ── Build review actions ───────────────────────────────────── */}
        {phase === "buildReview" && (
          <div className={styles.briefReviewPane}>
            <label className={styles.field}>
              <span>Dine endringer til frontend-utvikleren (valgfritt)</span>
              <textarea rows={3} value={techNotes} onChange={(e) => setTechNotes(e.target.value)}
                placeholder={"Pek på det du vil ha endret — dette går rett inn i ombyggingen. Vær spesifikk:\n• «Mindre tittel så den ikke kuttes på kanten»\n• «Mer luft rundt sitatet»\n• «Sterkere kontrast i brødteksten»\n• «La forsiden fylle mindre på mobil»"} />
              <small className={styles.hint}>Konkrete, spesifikke notater gir best resultat — du styrer ombyggingen.</small>
            </label>
            <div className={styles.reviewActions}>
              <button type="button" className={styles.primary} onClick={onSave}>
                Lagre som utgivelse
              </button>
              <button type="button" className={styles.secondary} onClick={() => build(true)}>
                Be om endringer
              </button>
              <button type="button" className={styles.ghost} onClick={() => setPhase("briefReview")}>
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
