import { NextResponse } from "next/server";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";

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

  const root = process.cwd();
  const artifactPath = path.join(root, "content", "artifacts", `${slug}.html`);
  const datasetPath = path.join(root, "lib", "sanity", "dataset.json");

  await writeFile(artifactPath, html, "utf8");

  const datasetRaw = await readFile(datasetPath, "utf8");
  const dataset = JSON.parse(datasetRaw) as {
    books: Array<Record<string, unknown>>;
    bookReleases: Array<Record<string, unknown>>;
  };

  const bookId = `book.${slug}`;
  const releaseId = `release.${slug}`;

  // Idempotent: if the slug already exists, update the artifact file but don't
  // duplicate the dataset entries. In a real Sanity setup this would be a
  // patch + new revision, not in-place mutation.
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
  if (!dataset.bookReleases.some((r) => r._id === releaseId)) {
    dataset.bookReleases.push({
      _id: releaseId,
      _type: "bookRelease",
      slug,
      status: "published",
      publishedAt: new Date().toISOString(),
      template: "ai-generated",
      version: 1,
      bookRef: bookId,
      artifactRef: `${slug}.html`,
      seo: {
        title: `${title} — ${author}`,
        description,
        ogImage: "",
      },
    });
  }

  await writeFile(datasetPath, JSON.stringify(dataset, null, 2) + "\n", "utf8");

  revalidatePath("/releases");
  revalidatePath(`/releases/${slug}`);

  return NextResponse.json({ slug, previewUrl: `/releases/${slug}` });
}
