import Link from "next/link";
import type { Book } from "@/lib/sanity/releases";
import { BuyButton } from "./buy-button";
import styles from "./release-shell.module.css";

export function ReleaseShell({
  book,
  children,
}: {
  book: Book;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/releases" className={styles.back}>
            ← Alle utgivelser
          </Link>
          <div className={styles.barBuy}>
            <span className={styles.price}>
              {book.priceNOK} {book.currency}
            </span>
            <BuyButton book={book} />
          </div>
        </div>
      </div>

      {/* Generated marketing body is injected here. It owns only presentation;
          everything around it (and all SEO) belongs to the shell. */}
      {children}
    </div>
  );
}
