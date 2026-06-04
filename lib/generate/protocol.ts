import type { QaVerdict } from "@/lib/agent/stages/qa";

// The wire contract for the streaming build endpoint, shared by both ends so
// they can never drift. The server (app/api/generate/build) emits these frames
// as newline-delimited JSON; the client (app/generate/flow) reads them back.
//
// Frame order over one build: zero+ `status`, many `token`, one `qa`, one
// `done` — or a single `error` that ends the stream early.
//
// This module is import-safe on the client: the QaVerdict reference is a
// type-only import (erased at build time), so it pulls none of the server-only
// agent code into the browser bundle.

export type QaFinding = { severity: string; message: string };

export type BuildFrame =
  | { type: "status"; label: string }
  | { type: "token"; text: string }
  | { type: "qa"; passed: boolean; findings: QaFinding[]; critic: QaVerdict | null }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Server: encode one frame as an NDJSON line ──────────────────────────────
export function encodeFrame(frame: BuildFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(frame) + "\n");
}

// ── Client: decode an NDJSON byte stream into frames ────────────────────────
// Each yielded value is one parsed line; partial flushes and keep-alive noise
// are tolerated (malformed lines are skipped).
export async function* readFrames(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<BuildFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as BuildFrame;
      } catch {
        // Ignore malformed lines (partial flush, keep-alive noise).
      }
    }
  }
}
