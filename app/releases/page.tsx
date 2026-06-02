import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedReleases } from "@/lib/sanity/releases";
import styles from "./releases.module.css";

export const metadata: Metadata = {
  title: "Utgivelser",
  description: "Alle aktuelle bokutgivelser fra Elate Bok.",
};

export default async function ReleasesPage() {
  const releases = await getPublishedReleases();

  return (
    <main className="container">
      <header className={styles.head}>
        <h1 className={styles.title}>Utgivelser</h1>
        <p className={styles.sub}>
          Hver utgivelse får sin egen side — generert automatisk, vist i vårt
          eget skall med kjøpsknapp og deling.
        </p>
      </header>

      <ul className={styles.grid}>
        {releases.map((r) => (
          <li key={r._id}>
            <Link href={`/releases/${r.slug}`} className={styles.card}>
              <div
                className={styles.cover}
                style={{ background: r.book.coverColor }}
              >
                <span>{r.book.title}</span>
              </div>
              <p className={styles.author}>{r.book.author}</p>
              <h2 className={styles.cardTitle}>{r.book.title}</h2>
              <p className={styles.cardSub}>{r.book.subtitle}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
