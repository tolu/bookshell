import type { QaVerdict } from "@/lib/agent/stages/qa";
import type { QaFinding } from "@/lib/generate/protocol";

// The data model for the generation flow: the editable form, the QA verdict the
// server hands back, and the seed/limit constants the UI reads. (The flow's
// phase machine lives next door in phase.ts; the network calls in requests.ts.)

export type FormState = {
  title: string;
  author: string;
  imageUrl: string;
  genre: string;
  description: string;
  longText: string;
  editorNotes: string;
  praise: string;
};

export const EMPTY: FormState = {
  title: "",
  author: "",
  imageUrl: "",
  genre: "",
  description: "",
  longText: "",
  editorNotes: "",
  praise: "",
};

export const LONG_LIMIT = 2000;

// The QA verdict as the UI holds it — the build endpoint's `qa` frame minus its
// `type` tag. Built off the shared protocol types so it can't drift.
export type QaState = {
  passed: boolean;
  findings: QaFinding[];
  critic: QaVerdict | null;
};

// Fallback status messages cycled while a stage hasn't sent its own.
export const FALLBACK_MESSAGES = [
  "Strekker fingrene…",
  "Tenker på fargepaletten…",
  "Skisser ut komposisjonen…",
  "Velger typografisk hovedgrep…",
  "Vekter hierarkiet…",
  "Lager hover-animasjoner…",
  "Skrur til kontrastene…",
  "Polerer kantene…",
];

export const DEMO: FormState = {
  title: "Gardens of the Moon",
  author: "Steven Erikson",
  genre: "Dark Fantasy",
  imageUrl:
    "https://prod-bb-images.akamaized.net/book-covers/coverimage-9781473565531-coresourceprhuk-2025-02-19t15-02.jpg?w=640",
  description: `Erikson drops you into the deep end of a 300,000-year history. You will feel lost at first, but the thrill of piecing together the world yourself is unmatched.`,
  longText: `
Bled dry by interminable warfare, infighting and bloody confrontations with Lord Anomander Rake and his Tiste Andii, the vast, sprawling Malazan empire simmers with discontent.

Even its imperial legions yearn for some respite. For Sergeant Whiskeyjack and his Bridgeburners and for Tattersail, sole surviving sorceress of the Second Legion, the aftermath of the siege of Pale should have been a time to mourn the dead. But Darujhistan, last of the Free Cities of Genabackis, still holds out - and Empress Lasseen's ambition knows no bounds.

However, it seems the empire is not alone in this great game. Sinister forces gather as the gods themselves prepare to play their hand...

Conceived and written on an epic scale, Gardens of the Moon is a breathtaking achievement - a novel in which grand design, a dark and complex mythology, wild and wayward magic and a host of enduring characters combine with thrilling, powerful storytelling to resounding effect. Acclaimed by writers, critics and readers alike, here is the opening chapter in what has been hailed a landmark of epic fantasy: the awesome 'The Malazan Book of the Fallen'.
`,
  editorNotes: "",
  praise: `★★★★★ "A landmark of epic fantasy." — SFX\n"Grand, dark and magnificent." — Glen Cook`,
};
