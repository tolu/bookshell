"use client";

import { useState } from "react";
import type { Book } from "@/lib/sanity/releases";
import styles from "./release-shell.module.css";

// In the real app this would talk to your cart context / checkout.
// It's a client component precisely because the buy action is the
// conversion event and needs live state (cart, stock, price, analytics).
export function BuyButton({ book }: { book: Book }) {
  const [added, setAdded] = useState(false);
  const soldOut = book.availability === "OutOfStock";
  const label = soldOut
    ? "Utsolgt"
    : added
      ? "Lagt i kurv ✓"
      : book.availability === "PreOrder"
        ? "Forhåndsbestill"
        : "Kjøp boken";

  return (
    <button
      type="button"
      className={styles.buy}
      disabled={soldOut}
      data-added={added}
      onClick={() => setAdded(true)}
    >
      {label}
    </button>
  );
}
