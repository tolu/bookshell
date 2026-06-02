import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataset, saveDataset, saveArtifact } from "@/lib/storage";

export const runtime = "nodejs";

type Body = {
  title?: string;
  author?: string;
  genre?: string;
  description?: string;
  html?: string;
};

// Naive slug — collapses to ASCII-ish, dashes, lowercase. Enough for the demo;
// in production this would live in Sanity with collision handling.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

type Dataset = {
  books: Array<Record<string, unknown>>;
  bookReleases: Array<Record<string, unknown>>;
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const author = body.author?.trim();
  const genre = body.genre?.trim();
  const description = body.description?.trim();
  const html = body.html;

  if (!title || !author || !genre || !description || !html) {
    return NextResponse.json(
      { error: "title, author, genre, description, html are all required" },
      { status: 400 }
    );
  }

  const slug = slugify(title);
  if (!slug) {
    return NextResponse.json({ error: "Could not derive slug from title" }, { status: 400 });
  }

  // Write the artifact first. saveArtifact returns either a bare filename
  // (disk mode) or a Blob URL (blob mode) — whichever is appropriate for
  // dataset.artifactRef so the reader on the other side knows how to load it.
  const artifactRef = await saveArtifact(slug, html);

  // Read-modify-write the dataset. NB: not atomic — two concurrent generations
  // could race and one save would be lost. Acceptable for a single-author
  // demo; a real system would use a DB.
  const dataset = (await getDataset()) as Dataset;
  const bookId = `book.${slug}`;
  const releaseId = `release.${slug}`;

  if (!dataset.books.some((b) => b._id === bookId)) {
    dataset.books.push({
      _id: bookId,
      _type: "book",
      title,
      subtitle: description,
      author,
      isbn: "0000000000000",
      priceNOK: 399,
      currency: "NOK",
      availability: "PreOrder",
      coverColor: "#2f4a3c",
    });
  }
  const existingRelease = dataset.bookReleases.find((r) => r._id === releaseId);
  if (existingRelease) {
    // Idempotent regenerate: keep the record, just point at the new artifact.
    existingRelease.artifactRef = artifactRef;
    existingRelease.version = ((existingRelease.version as number) ?? 1) + 1;
  } else {
    dataset.bookReleases.push({
      _id: releaseId,
      _type: "bookRelease",
      slug,
      status: "published",
      publishedAt: new Date().toISOString(),
      template: "ai-generated",
      version: 1,
      bookRef: bookId,
      artifactRef,
      seo: {
        title: `${title} — ${author}`,
        description,
        ogImage: "",
      },
    });
  }

  await saveDataset(dataset);

  revalidatePath("/releases");
  revalidatePath(`/releases/${slug}`);

  return NextResponse.json({ slug, previewUrl: `/releases/${slug}` });
}
