import styles from "../generate.module.css";
import { LONG_LIMIT, type FormState } from "../flow/model";
import type { Phase } from "../flow/phase";

// The left column: the book metadata the editor fills in, the primary
// action (start the flow / start over), and inline error + success notices.
type Props = {
  form: FormState;
  locked: boolean;
  busy: boolean;
  phase: Phase;
  error: string | null;
  previewUrl: string | null;
  longRemaining: number;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: () => void;
  onStartOver: () => void;
};

export function BookMetadataForm({
  form,
  locked,
  busy,
  phase,
  error,
  previewUrl,
  longRemaining,
  onUpdate,
  onSubmit,
  onStartOver,
}: Props) {
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className={styles.field}>
        <span>Tittel</span>
        <input required disabled={locked} value={form.title}
          onChange={(e) => onUpdate("title", e.target.value)} placeholder="Alt starter med en drøm" />
      </label>
      <label className={styles.field}>
        <span>Forfatter</span>
        <input required disabled={locked} value={form.author}
          onChange={(e) => onUpdate("author", e.target.value)} placeholder="Antonio Nusa" />
      </label>
      <label className={styles.field}>
        <span>Sjanger</span>
        <input required disabled={locked} value={form.genre}
          onChange={(e) => onUpdate("genre", e.target.value)} placeholder="Biografi · Idrett" />
      </label>
      <label className={styles.field}>
        <span>Forside (URL)</span>
        <input type="url" disabled={locked} value={form.imageUrl}
          onChange={(e) => onUpdate("imageUrl", e.target.value)}
          placeholder="https://… (valgfritt — brukes for fargepalett)" />
      </label>
      <label className={styles.field}>
        <span>Pitch (en setning)</span>
        <input required disabled={locked} value={form.description}
          onChange={(e) => onUpdate("description", e.target.value)}
          placeholder="Reisen bak suksessen til Antonio Nusa" />
      </label>
      <label className={styles.field}>
        <span>
          Sammendrag / brødtekst{" "}
          <em className={longRemaining < 0 ? styles.over : styles.count}>{longRemaining} tegn igjen</em>
        </span>
        <textarea required disabled={locked} rows={10} maxLength={LONG_LIMIT}
          value={form.longText} onChange={(e) => onUpdate("longText", e.target.value)}
          placeholder="2000 tegn med synopsis, utdrag eller pressetekst…" />
      </label>
      <label className={styles.field}>
        <span>Redaktørens føringer (valgfritt)</span>
        <textarea rows={3} disabled={locked} value={form.editorNotes}
          onChange={(e) => onUpdate("editorNotes", e.target.value)}
          placeholder={"Du sitter i førersetet — sett retningen før vi starter. Tone, vinkling, hva du vil fremheve eller unngå. F.eks. «Hold det stramt og elegant», «spill på havet og ensomheten», «unngå sjangerklisjeer»."} />
      </label>
      <label className={styles.field}>
        <span>Omtale / sitater (valgfritt)</span>
        <textarea rows={3} disabled={locked} value={form.praise}
          onChange={(e) => onUpdate("praise", e.target.value)}
          placeholder={'Ekte sitater og terningkast, ett per linje. F.eks.\n★★★★★ «Mesterlig.» — VG'} />
      </label>

      <div className={styles.actions}>
        {phase === "idle" ? (
          <button type="submit" className={styles.primary} disabled={busy}>
            Lag design-brief
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={onStartOver} disabled={busy}>
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
  );
}
