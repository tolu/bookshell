// The human-gated state machine that drives the whole flow. Both feedback loops
// the app exists for live in this diagram:
//
//   idle ──generateBrief──▶ briefing ──▶ briefReview ──build(false)──▶ building
//                                          ▲     │                        │
//                            generateBrief─┘     │(feedback loop)         ▼
//                                                                      buildReview
//                                          ┌──────────────────────────────┤
//                              build(true)─┘ (revision loop)              │ onSave
//                                                                          ▼
//                                                              saving ──▶ saved
//
// - briefReview loops on itself while the editor sends feedback (generateBrief).
// - buildReview loops on itself while the editor requests changes (build(true)),
//   and can also step back to briefReview.
// Keeping the union and its derivations here (rather than scattered booleans in
// the hook) makes the reachable states explicit and easy to extend.

export type Phase =
  | "idle"
  | "briefing"
  | "briefReview"
  | "building"
  | "buildReview"
  | "saving"
  | "saved";

/** Which of the three progress steps (Brief · Side · Lagre) a phase belongs to. */
export function deriveStep(phase: Phase): 1 | 2 | 3 {
  if (phase === "idle" || phase === "briefing" || phase === "briefReview") return 1;
  if (phase === "building" || phase === "buildReview") return 2;
  return 3;
}

/** True while a stage is working and the form should be locked. */
export function isBusy(phase: Phase): boolean {
  return phase === "briefing" || phase === "building" || phase === "saving";
}

/** True only while HTML tokens are actively streaming in. */
export function isStreaming(phase: Phase): boolean {
  return phase === "building";
}
