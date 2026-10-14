import type { QuestionType } from "@nexquiz/shared";

/** Glyph of a page (an item without a question). */
export const PAGE_ICON = "▭";

/** Type glyphs from the editor wireframe (DESIGN.md "Editor kvízu"). */
export const TYPE_ICONS: Record<QuestionType, string> = {
  single: "◉",
  multi: "☑",
  order: "↕",
  hotspot: "⌖",
  text: "✎",
  music: "♫",
  number: "#",
};
