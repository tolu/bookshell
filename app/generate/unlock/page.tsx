import type { Metadata } from "next";
import { UnlockForm } from "./unlock-form";
import styles from "./unlock.module.css";

export const metadata: Metadata = {
  title: "Lås opp generering",
  robots: { index: false, follow: false },
};

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const gateOff = !process.env.GENERATE_PASSWORD;

  return (
    <main className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Lås opp generering</h1>
        <p className={styles.sub}>
          Generering bruker Gemini-kreditt. Skriv inn passordet du fikk delt
          for å fortsette.
        </p>
        {gateOff && (
          <p className={styles.devNote}>
            <strong>Dev-modus:</strong> <code>GENERATE_PASSWORD</code> er ikke
            satt — alle har tilgang. Sett env-variabelen i Vercel før du deler
            URL-en.
          </p>
        )}
        <UnlockForm nextPath={next ?? "/generate"} />
      </div>
    </main>
  );
}
