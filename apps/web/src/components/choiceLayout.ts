/** Max. option text length for the player's 2 × 2 grid (DESIGN.md "Responzivita"). */
export const PLAYER_GRID_TEXT_MAX = 20;

/**
 * Player choice tiles: 2 × 2 grid for 2–4 short options (≤ 20 characters),
 * otherwise one column (always for 5–6 options).
 */
export function playerChoiceGrid(options: readonly { text: string }[]): boolean {
  return options.length <= 4 && options.every((o) => [...o.text].length <= PLAYER_GRID_TEXT_MAX);
}

/** Host screen: 2 columns for ≤ 4 options (2 × 2), 3 columns for 5–6 (two rows of three on 16:9). */
export function hostChoiceColumns(count: number): 2 | 3 {
  return count <= 4 ? 2 : 3;
}
