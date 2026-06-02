import type { Book } from "@/lib/sanity/releases";

// All structured data is emitted by the shell from the Sanity record —
// never trusted to the generated artifact. This is what guarantees correct
// Book/Offer schema on every release regardless of what the generator output.
export function BookJsonLd({ book, slug }: { book: Book; slug: string }) {
  const availabilityUrl = {
    InStock: "https://schema.org/InStock",
    PreOrder: "https://schema.org/PreOrder",
    OutOfStock: "https://schema.org/OutOfStock",
  }[book.availability];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: book.author },
    isbn: book.isbn,
    description: book.subtitle,
    offers: {
      "@type": "Offer",
      price: book.priceNOK,
      priceCurrency: book.currency,
      availability: availabilityUrl,
      url: `https://elatebok.no/releases/${slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
