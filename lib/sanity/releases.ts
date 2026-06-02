import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

// ── Types ────────────────────────────────────────────────────────────────
// These mirror what a real GROQ projection would return after dereferencing.

export type Book = {
  _id: string;
  title: string;
  subtitle: string;
  author: string;
  isbn: string;
  priceNOK: number;
  currency: string;
  availability: "InStock" | "PreOrder" | "OutOfStock";
  coverColor: string;
};

export type ReleaseSeo = {
  title: string;
  description: string;
  ogImage: string;
};

export type BookRelease = {
  _id: string;
  slug: string;
  status: "published" | "draft";
  publishedAt: string | null;
  template: string;
  version: number;
  artifactRef: string; // filename of the generated HTML artifact
  book: Book; // dereferenced
  seo: ReleaseSeo;
};

type RawRelease = {
  _id: string;
  slug: string;
  status: BookRelease["status"];
  publishedAt: string | null;
  template: string;
  version: number;
  bookRef: string;
  artifactRef: string;
  seo: ReleaseSeo;
};

// ── "Client" ─────────────────────────────────────────────────────────────
// Stands in for @sanity/client. In production these functions would issue
// GROQ queries against the CDN endpoint. Here we read the static dataset
// FROM DISK at request time — not via a static `import` — so that records
// added via /api/save-artifact at runtime are immediately visible without
// a rebuild. `cache()` keeps the read + parse deduped within a single
// request (same dedupe behaviour real Sanity benefits from).

const DATASET_PATH = path.join(process.cwd(), "lib", "sanity", "dataset.json");

const loadDataset = cache(
  async (): Promise<{ books: Book[]; bookReleases: RawRelease[] }> => {
    const raw = await readFile(DATASET_PATH, "utf8");
    return JSON.parse(raw) as { books: Book[]; bookReleases: RawRelease[] };
  }
);

function dereference(raw: RawRelease, books: Book[]): BookRelease {
  const book = books.find((b) => b._id === raw.bookRef);
  if (!book) throw new Error(`Dangling bookRef: ${raw.bookRef}`);
  const { bookRef, ...rest } = raw;
  return { ...rest, book };
}

// GROQ equivalent:
//   *[_type == "bookRelease" && slug.current == $slug][0]{
//     ..., "book": bookRef->{...}, seo
//   }
export const getReleaseBySlug = cache(
  async (slug: string): Promise<BookRelease | null> => {
    const { books, bookReleases } = await loadDataset();
    const raw = bookReleases.find((r) => r.slug === slug);
    return raw ? dereference(raw, books) : null;
  }
);

// GROQ equivalent:
//   *[_type == "bookRelease" && status == "published"]{ "slug": slug.current }
export const getAllReleaseSlugs = cache(async (): Promise<string[]> => {
  const { bookReleases } = await loadDataset();
  return bookReleases.filter((r) => r.status === "published").map((r) => r.slug);
});

// GROQ equivalent (listing, newest first):
//   *[_type == "bookRelease" && status == "published"] | order(publishedAt desc){
//     ..., "book": bookRef->{title, author, subtitle, coverColor}
//   }
export const getPublishedReleases = cache(async (): Promise<BookRelease[]> => {
  const { books, bookReleases } = await loadDataset();
  return bookReleases
    .filter((r) => r.status === "published")
    .map((r) => dereference(r, books))
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? 0).getTime() -
        new Date(a.publishedAt ?? 0).getTime()
    );
});
