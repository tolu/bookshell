import type { Metadata } from "next";
import { GenerateForm } from "./generate-form";
import styles from "./generate.module.css";

export const metadata: Metadata = {
  title: "Generer utgivelse",
  description: "AI-generert markedsføringsside for en bokutgivelse.",
};

export default function GeneratePage() {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  return (
    <main className={`container ${styles.wrap}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>Generer utgivelse</h1>
        <p className={styles.sub}>
          Fyll inn boken — Gemini lager en frittstående, visuelt distinkt
          markedsføringsside som limes inn i utgivelsesskallet.
        </p>
      </header>
      {!hasKey ? (
        <p className={styles.keyWarn}>
          <strong>GEMINI_API_KEY mangler.</strong> Kopier{" "}
          <code>.env.local.example</code> til <code>.env.local</code> og legg inn
          en nøkkel fra{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          .
        </p>
      ) : (
        <GenerateForm />
      )}
    </main>
  );
}
