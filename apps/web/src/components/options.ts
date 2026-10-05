/** Option mapping (DESIGN.md "Mapovanie možností"): color, shape and letter per index. */
export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export type OptionShapeName = "triangle" | "diamond" | "circle" | "square" | "star" | "hexagon";

export const OPTION_SHAPES: readonly OptionShapeName[] = ["triangle", "diamond", "circle", "square", "star", "hexagon"];

/** Letter for an option index (0-based); wraps defensively. */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index % OPTION_LETTERS.length] ?? "A";
}

/** CSS color token for an option index (0-based). */
export function optionColor(index: number): string {
  return `var(--opt-${(index % OPTION_LETTERS.length) + 1})`;
}

/**
 * Stable "random" color for a nickname (PlayerChip): FNV-1a hash of the
 * name mapped onto the option palette, so it only uses design tokens.
 */
export function nicknameColor(nickname: string): string {
  let hash = 0x811c9dc5;
  for (const ch of nickname) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return optionColor(hash % OPTION_LETTERS.length);
}
