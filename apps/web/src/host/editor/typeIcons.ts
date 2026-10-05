import type { QuestionType } from "@nexquiz/shared";

/** Type glyphs from the editor wireframe (DESIGN.md "Editor kvízu"). */
export const TYPE_ICONS: Record<QuestionType, string> = {
  single: "◉",
  multi: "☑",
  order: "↕",
  hotspot: "⌖",
  text: "✎",
  music: "♫",
};
