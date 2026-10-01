import type { Answer, CellValue } from "./calendar";

export const ANSWERS = ["yes", "maybe", "no"] as const satisfies readonly Answer[];

/** State is never colour-only: every answer has a glyph. */
export const ANSWER_GLYPH: Record<Answer, string> = { yes: "✓", maybe: "~", no: "✕" };

/** Tailwind classes per answer; unanswered cells use the neutral surface. */
export const ANSWER_CLASSES: Record<Answer, string> = {
  yes: "bg-ok-soft text-ok border-ok/40",
  maybe: "bg-warn-soft text-warn border-warn/40",
  no: "bg-foreground/15 text-foreground border-foreground/30",
};

export function answerKey(value: CellValue): "yes" | "maybe" | "no" | "empty" {
  return value ?? "empty";
}
