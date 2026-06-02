import "server-only";
import { head, put, BlobNotFoundError } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

// Vercel Blob-backed storage. Used whenever BLOB_READ_WRITE_TOKEN is set in
// the environment (Vercel sets this automatically when a Blob store is
// connected to the project).
//
// First-boot behavior: if dataset.json doesn't exist in Blob yet, we seed it
// from the bundled lib/sanity/dataset.json that ships with the deployment.
// Subsequent requests read from Blob exclusively. After the first seed,
// locally committed changes to lib/sanity/dataset.json do NOT propagate to
// the deployment — Blob is the source of truth. To re-seed, delete the
// dataset.json blob via the Vercel dashboard.

const DATASET_BLOB_PATH = "dataset.json";
const SEED_PATH = path.join(process.cwd(), "lib", "sanity", "dataset.json");
const BUNDLED_ARTIFACT_DIR = path.join(process.cwd(), "content", "artifacts");

async function readBlobJson(url: string): Promise<unknown> {
  // cache: "no-store" bypasses the CDN — dataset.json is mutable and we
  // always want a fresh read.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  return res.json();
}

export const getDataset = cache(async (): Promise<unknown> => {
  try {
    const meta = await head(DATASET_BLOB_PATH);
    return await readBlobJson(meta.url);
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) throw err;
    // First boot — seed Blob from the bundled static dataset. If two cold
    // starts race this, both will write identical content; last-write-wins
    // is harmless when the content is identical.
    const raw = await readFile(SEED_PATH, "utf8");
    const seed: unknown = JSON.parse(raw);
    await put(DATASET_BLOB_PATH, JSON.stringify(seed, null, 2), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });
    return seed;
  }
});

export async function saveDataset(dataset: unknown): Promise<void> {
  await put(DATASET_BLOB_PATH, JSON.stringify(dataset, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  });
}

export async function getArtifact(ref: string): Promise<string> {
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    // Default cache headers are fine here — each artifact URL is immutable
    // per slug (we overwrite the same path on regenerate but the URL stays
    // stable, so we accept stale-while-revalidate behavior).
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`Artifact fetch failed: ${res.status}`);
    return res.text();
  }
  // Bare filename → bundled artifact still on the deployment filesystem
  // (read-only on Vercel, but reads work fine). Lets old releases keep
  // working without re-uploading them to Blob.
  return readFile(path.join(BUNDLED_ARTIFACT_DIR, ref), "utf8");
}

export async function saveArtifact(slug: string, html: string): Promise<string> {
  const { url } = await put(`artifacts/${slug}.html`, html, {
    access: "public",
    addRandomSuffix: false,
    contentType: "text/html; charset=utf-8",
    allowOverwrite: true,
  });
  return url;
}
