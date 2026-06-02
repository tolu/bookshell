import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

// Disk-backed storage: the local-dev default. Reads and writes the bundled
// dataset.json and content/artifacts/ files.
//
// Works on writable filesystems only — your laptop or a long-lived Node
// host with persistent disk. NOT used on Vercel serverless (read-only FS);
// the blob impl handles that.

const DATASET_PATH = path.join(process.cwd(), "lib", "sanity", "dataset.json");
const ARTIFACT_DIR = path.join(process.cwd(), "content", "artifacts");

// cache() dedupes within a single request so generateMetadata + the page +
// any other accessor only parse once per request.
export const getDataset = cache(async (): Promise<unknown> => {
  const raw = await readFile(DATASET_PATH, "utf8");
  return JSON.parse(raw);
});

export async function saveDataset(dataset: unknown): Promise<void> {
  await writeFile(DATASET_PATH, JSON.stringify(dataset, null, 2) + "\n", "utf8");
}

export async function getArtifact(ref: string): Promise<string> {
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`Artifact fetch failed: ${res.status}`);
    return res.text();
  }
  return readFile(path.join(ARTIFACT_DIR, ref), "utf8");
}

export async function saveArtifact(slug: string, html: string): Promise<string> {
  const filename = `${slug}.html`;
  await writeFile(path.join(ARTIFACT_DIR, filename), html, "utf8");
  return filename;
}
