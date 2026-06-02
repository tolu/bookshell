import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getReleaseBySlug,
  getAllReleaseSlugs,
} from "@/lib/sanity/releases";
import { getReleaseBody } from "@/lib/releases/body";
import { ReleaseShell } from "@/components/release-shell";
import { BookJsonLd } from "@/components/book-json-ld";

type Params = { slug: string };

// Pre-render published releases at build. New ones can fill in via ISR /
// on-demand revalidation triggered by a Sanity publish webhook.
export async function generateStaticParams() {
  const slugs = await getAllReleaseSlugs();
  return slugs.map((slug) => ({ slug }));
}

// SEO surface — owned by the shell, sourced from Sanity, never the artifact.
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) return {};

  return {
    title: release.seo.title,
    description: release.seo.description,
    alternates: { canonical: `/releases/${slug}` },
    openGraph: {
      title: release.seo.title,
      description: release.seo.description,
      type: "book",
      images: release.seo.ogImage ? [release.seo.ogImage] : undefined,
    },
  };
}

export default async function ReleasePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  const release = await getReleaseBySlug(slug);
  if (!release || release.status !== "published") notFound();

  // Fetch the generated artifact (file-based here; a Blob/Sanity URL in prod),
  // sanitize it, and scope its CSS — all server-side. The page receives back
  // only safe, scoped HTML ready to drop into the shell.
  const body = await getReleaseBody(release.artifactRef);

  return (
    <ReleaseShell book={release.book}>
      <BookJsonLd book={release.book} slug={slug} />
      <main dangerouslySetInnerHTML={{ __html: body.html }} />
    </ReleaseShell>
  );
}
