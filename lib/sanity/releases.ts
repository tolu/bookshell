import "server-only";
import { cache } from "react";
import { getDataset } from "@/lib/storage";

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

// Pipeline provenance stored alongside a release so a generation can be
// inspected or reproduced later. All optional — pre-pipeline records lack them.
export type ReleaseProvenance = {
  designBrief?: string; // serialized Brief JSON
  qaReport?: string; // serialized QA verdict JSON
  editorNotes?: string; // the editor's steering input, if any
  praise?: string; // the editor's supplied praise, if any
  technicalNotes?: string; // the editor's build-review revision notes, if any
};

export type BookRelease = ReleaseProvenance & {
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

type RawRelease = ReleaseProvenance & {
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
// GROQ queries against the CDN endpoint. Here we go through lib/storage,
// which transparently dispatches to disk (local dev) or Vercel Blob
// (production, when BLOB_READ_WRITE_TOKEN is set). `cache()` dedupes
// across accessors within a single request.

const loadDataset = cache(
  async (): Promise<{ books: Book[]; bookReleases: RawRelease[] }> => {
    return (await getDataset()) as { books: Book[]; bookReleases: RawRelease[] };
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
