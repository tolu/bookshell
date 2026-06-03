import "server-only";
import { type GenerateInput, inputBlock } from "./prompt";
import { type Brief } from "./brief";
import { type Finding } from "@/lib/releases/lint";

// STAGE 3 (the judgement half) — a UX/art critic that scores what the
// deterministic linter CAN'T: is the design actually compelling and sellable,
// does the motif land, is the hierarchy strong. It's handed the linter's
// findings as ground truth so its critique stays concrete, and returns a
// machine-readable verdict the orchestrator uses to pass or revise.

export type QaIssue = {
  severity: "error" | "warn";
  area: string;
  what: string;
  fix: string;
};

export type QaVerdict = {
  passed: boolean;
  scores: {
    conceptMotif: number;
    sellability: number;
    hierarchyLegibility: number;
    genreRead: number;
    copy: number;
    craft: number;
  };
  issues: QaIssue[];
  summary: string;
};

export const QA_SCHEMA = {
  type: "object",
  properties: {
    passed: {
      type: "boolean",
      description: "True only if this is a strong, sellable, on-brief page with no blocking issues.",
    },
    scores: {
      type: "object",
      description: "1 (poor) to 5 (excellent).",
      properties: {
        conceptMotif: { type: "integer", description: "Is there one strong idea, drawn from THIS book?" },
        sellability: { type: "integer", description: "Does it stop the scroll, create desire, lead toward buying?" },
        hierarchyLegibility: { type: "integer", description: "Clear visual hierarchy and readable type?" },
        genreRead: { type: "integer", description: "Genre/mood readable within ~3 seconds?" },
        copy: { type: "integer", description: "Strong hook, and ZERO fabricated facts/quotes?" },
        craft: { type: "integer", description: "Immersive visuals beyond type + a real scroll narrative?" },
      },
      required: ["conceptMotif", "sellability", "hierarchyLegibility", "genreRead", "copy", "craft"],
    },
    issues: {
      type: "array",
      description: "Concrete, actionable problems for the builder to fix. Empty if none.",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["error", "warn"] },
          area: { type: "string", description: "e.g. 'contrast', 'hierarchy', 'copy', 'motion', 'concept'." },
          what: { type: "string", description: "The specific problem, located precisely." },
          fix: { type: "string", description: "The concrete change to make." },
        },
        required: ["severity", "area", "what", "fix"],
      },
    },
    summary: { type: "string", description: "1–3 sentence verdict." },
  },
  required: ["passed", "scores", "issues", "summary"],
} as const;

function findingsBlock(findings: Finding[]): string {
  if (!findings.length) return "(The deterministic linter found no violations.)";
  return findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n");
}

export function buildQaPrompt(
  input: GenerateInput,
  brief: Brief,
  html: string,
  findings: Finding[]
): string {
  return `ROLE
You are a demanding design & UX critic reviewing a book-marketing page before it ships. Your job is to judge whether it will actually SELL the book — stop a scroll, create desire, read instantly — and whether it honours the brief. Be honest and specific; vague praise is useless.

THE BOOK
${inputBlock(input)}

THE BRIEF IT WAS BUILT FROM
- Concept: ${brief.concept}
- Motif: ${brief.motif}
- Marketing hook: ${brief.marketingHook}
- Visual system: ${brief.visualSystem}

DETERMINISTIC LINT FINDINGS (already verified by a static checker — treat as ground truth; fold any errors here into your issues so the builder fixes them)
${findingsBlock(findings)}

THE HTML TO REVIEW
${JSON.stringify(html)}

EVALUATE on a 1–5 scale each, then decide pass/fail:
- conceptMotif: one strong idea, drawn from THIS book (not generic genre dressing)?
- sellability: does it stop the scroll, build desire, and lead the eye toward buying?
- hierarchyLegibility: clear hierarchy, readable type, nothing fighting for attention?
- genreRead: can a stranger read the genre/mood in ~3 seconds?
- copy: strong hook AND zero fabricated facts/quotes (quotes only from excerpt/pitch or the supplied praise)?
- craft: a real visual world beyond typography, and a genuine multi-act scroll narrative?

GUIDANCE
- passed = true ONLY if there are no error-severity issues (yours or the lint's) AND the design is genuinely strong (no score below 3, sellability and craft at least 4). Hold a high bar — "fine" is not "sellable".
- issues must be concrete and located ("the hero subtitle is grey-on-grey", not "improve contrast"). Each needs an actionable fix. Include every lint error above as an issue.
- Do NOT rewrite the HTML. Return ONLY the JSON object matching the schema — no prose, no code fences.`;
}
