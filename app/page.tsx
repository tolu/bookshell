import Link from "next/link";
import { getPublishedReleases } from "@/lib/sanity/releases";
import styles from "./home.module.css";

export default async function HomePage() {
  const releases = await getPublishedReleases();
  const featured = releases[0];

  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.kicker}>Leseglede siden i fjor</p>
          <h1 className={styles.title}>
            Bøker verdt å <em>vente</em> på.
          </h1>
          <p className={styles.lede}>
            En digital bokhandel og boksirkel. Vi følger hver utgivelse fra
            første idé til den ligger i hyllen din.
          </p>
          <Link href="/releases" className={styles.cta}>
            Se alle utgivelser →
          </Link>
        </div>
      </section>

      {featured && (
        <section className="container">
          <h2 className={styles.sectionTitle}>Aktuell utgivelse</h2>
          <Link href={`/releases/${featured.slug}`} className={styles.feature}>
            <div
              className={styles.featureCover}
              style={{ background: featured.book.coverColor }}
            >
              <span>{featured.book.title}</span>
            </div>
            <div className={styles.featureBody}>
              <p className={styles.featureAuthor}>{featured.book.author}</p>
              <h3 className={styles.featureTitle}>{featured.book.title}</h3>
              <p className={styles.featureSub}>{featured.book.subtitle}</p>
              <span className={styles.featureLink}>Les mer om boken →</span>
            </div>
          </Link>
        </section>
      )}
    </main>
  );
}
