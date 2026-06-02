import "server-only";

// Single storage facade. The release pages, the artifact-body reader, and the
// save endpoint all go through here so we can flip between disk-backed (local
// dev, writable filesystem) and Vercel Blob-backed (production, read-only FS)
// without any caller changes.
//
// Mode is picked at module load by env: BLOB_READ_WRITE_TOKEN present →
// Blob mode. Unset → disk mode. Vercel injects the token automatically when
// a Blob store is connected to the project, so production "just works"
// once that's set up. Locally you can set it in .env.local to test the Blob
// path against the same store, OR leave it unset for pure-disk dev.
//
// BLOB_STORE_ID is set by the Vercel UI for reference but isn't consumed by
// the SDK — the token embeds the store identifier.

import * as disk from "./disk";
import * as blob from "./blob";

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const impl = useBlob ? blob : disk;

export const STORAGE_MODE: "blob" | "disk" = useBlob ? "blob" : "disk";

export const getDataset = impl.getDataset;
export const saveDataset = impl.saveDataset;
export const getArtifact = impl.getArtifact;
export const saveArtifact = impl.saveArtifact;
