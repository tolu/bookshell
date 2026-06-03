import "server-only";
import { ThinkingLevel } from "@google/genai";
import { getGenAI, GENERATION_MODEL } from "./client";
import { type GenerateInput } from "./input";
import { coverInlineParts, type CoverPart } from "./cover";
import { type Brief } from "./stages/brief";
import { buildFrontendPrompt, buildRevisePrompt } from "./stages/build";
import { buildQaPrompt, QA_SCHEMA, type QaVerdict } from "./stages/qa";
import { lintArtifact } from "@/lib/releases/lint";
import { stripArtifactHtml } from "@/lib/releases/strip";
import { type BuildFrame } from "@/lib/generate/protocol";

// Stage 2 + 3 as one streamable pass: build (or revise) the page, then QA it.
// Yields the wire frames in order — status milestones, HTML tokens, one QA
// verdict, done — so the route handler is just a pump from here to the socket.
// There's no auto-loop: QA is reported, never acted on; the editor drives any
// further revision. A single render fits comfortably under the route's limit.

export type ReviseContext = { html: string; notes: string | null };

export async function* runBuild(
  input: GenerateInput,
  cover: CoverPart | null,
  brief: Brief,
  revise: ReviseContext | null
): AsyncGenerator<BuildFrame> {
  const lintOpts = {
    coverUrl: input.coverImageUrl,
    coverSize: input.coverSize,
    praise: input.praise ?? null,
    sourceText: [input.title, input.author, input.description, input.longText, input.editorNotes ?? ""].join("\n"),
  };

  // Fresh build from the brief, or a revise driven by the prior render's own
  // lint findings plus the editor's technical notes.
  const prompt = revise
    ? buildRevisePrompt(input, brief, revise.html, lintArtifact(revise.html, lintOpts), revise.notes)
    : buildFrontendPrompt(input, brief);

  yield { type: "status", label: revise ? "Bygger om siden…" : "Frontend bygger siden…" };

  const ai = getGenAI();
  const result = await ai.models.generateContentStream({
    model: GENERATION_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }, ...coverInlineParts(cover)] }],
    config: {
      temperature: 0.95,
      maxOutputTokens: 36_000,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  let raw = "";
  for await (const chunk of result) {
    const text = chunk.text;
    if (!text) continue;
    raw += text;
    yield { type: "token", text };
  }
  const clean = stripArtifactHtml(raw);

  // QA gate — deterministic lint + LLM critic, reported, not auto-acted.
  yield { type: "status", label: "QA vurderer siden…" };
  const lint = lintArtifact(clean, lintOpts);
  const lintErrors = lint.filter((f) => f.severity === "error");

  let critic: QaVerdict | null = null;
  try {
    const res = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: [{ role: "user", parts: [{ text: buildQaPrompt(input, brief, clean, lint) }] }],
      config: {
        temperature: 0.4,
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: "application/json",
        responseJsonSchema: QA_SCHEMA,
      },
    });
    if (res.text) critic = JSON.parse(res.text) as QaVerdict;
  } catch {
    critic = null;
  }

  yield {
    type: "qa",
    passed: lintErrors.length === 0 && (critic ? critic.passed : true),
    findings: lint.map((f) => ({ severity: f.severity, message: f.message })),
    critic,
  };
  yield { type: "done" };
}
