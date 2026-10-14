/**
 * Layout decisions for the game screens (DESIGN.md "Responzivita"): how many
 * columns the choice tiles use and how much long texts scale down, so the
 * host screen and the player's phone never scroll during a question.
 */

/**
 * Text size step from the text length: `l` = the full token size, `m` / `s` /
 * `xs` scale down (`--fit-m` / `--fit-s` / `--fit-xs`, CSS classes `fit-*`).
 */
export type TextFit = "l" | "m" | "s" | "xs";

/** Upper length bounds (in characters) of the `l`, `m` and `s` steps; anything longer is `xs`. */
export type FitThresholds = readonly [l: number, m: number, s: number];

const FIT_STEPS: readonly TextFit[] = ["l", "m", "s", "xs"];

/** Length in characters (code points, so emoji and diacritics count once). */
export function charCount(text: string): number {
  return [...text].length;
}

/** Length of the longest text (0 for none). */
export function longestText(texts: readonly { text: string }[]): number {
  return texts.reduce((max, t) => Math.max(max, charCount(t.text)), 0);
}

/** Size step of a text with `length` characters. */
export function textFit(length: number, thresholds: FitThresholds): TextFit {
  if (length <= thresholds[0]) return "l";
  if (length <= thresholds[1]) return "m";
  if (length <= thresholds[2]) return "s";
  return "xs";
}

/** One step smaller (`xs` stays `xs`). */
export function smallerFit(fit: TextFit): TextFit {
  return FIT_STEPS[Math.min(FIT_STEPS.indexOf(fit) + 1, FIT_STEPS.length - 1)] ?? "xs";
}

/** Question prompt on the host screen (max. 300 characters). */
export const HOST_PROMPT_FIT: FitThresholds = [60, 120, 200];
/** Question prompt on the player's phone. */
export const PLAYER_PROMPT_FIT: FitThresholds = [60, 120, 200];
/** Title of a page (max. 120 characters) on the host screen and the phone. */
export const PAGE_TITLE_FIT: FitThresholds = [20, 45, 80];
/** Description of a page (max. 1000 characters). */
export const PAGE_DESCRIPTION_FIT: FitThresholds = [160, 360, 640];

/** Host choice tiles per column count (longest option, max. 120 characters). */
const HOST_OPTION_FIT: Record<2 | 3, FitThresholds> = {
  2: [30, 55, 85],
  3: [20, 40, 65],
};

/** Player choice list rows (one row per option, max. 3 lines; 120 characters = the longest option). */
const PLAYER_LIST_FIT: Record<1 | 2, FitThresholds> = {
  1: [70, 100, 120],
  2: [30, 50, 75],
};
/** Player grid tiles (short options only): up to 6 characters at the full size. */
const PLAYER_GRID_FIT: FitThresholds = [6, 12, 12];

/** Order items (a list, one item per row). */
const HOST_ORDER_FIT: FitThresholds = [40, 70, 100];
const PLAYER_ORDER_FIT: FitThresholds = [24, 48, 80];

/**
 * Longest option (characters) for the player's grid of tiles (numbers, single
 * short words); anything longer is a list – one row per option.
 */
export const PLAYER_GRID_TEXT_MAX = 12;

/** Host screen: 2 columns for ≤ 4 options (2 × 2), 3 columns for 5–6 (two rows of three on 16:9). */
export function hostChoiceColumns(count: number): 2 | 3 {
  return count <= 4 ? 2 : 3;
}

/** Size step of the host choice tiles: the longest option, stricter with three columns. */
export function hostOptionFit(options: readonly { text: string }[]): TextFit {
  return textFit(longestText(options), HOST_OPTION_FIT[hostChoiceColumns(options.length)]);
}

/** Size step of the order items on the host screen; more than 4 items are shown in two columns. */
export function hostOrderFit(items: readonly { text: string }[]): TextFit {
  const fit = textFit(longestText(items), HOST_ORDER_FIT);
  return items.length > 4 ? smallerFit(fit) : fit;
}

/** Two columns for the host order list (and the reveal order) with more than 4 items. */
export function hostOrderColumns(count: number): 1 | 2 {
  return count > 4 ? 2 : 1;
}

export type PlayerChoiceLayout = {
  /** `grid` = short options in tiles side by side, `list` = one row per option. */
  mode: "grid" | "list";
  columns: 1 | 2 | 3 | 4;
  fit: TextFit;
};

/**
 * Player choice options. The answers keep their natural height at the bottom
 * of the screen (thumb zone); the question image takes the remaining height.
 * - `grid` only when every option is short (≤ 12 characters: numbers, single
 *   words): 2 columns on a portrait phone; on a landscape phone all options in
 *   one row (up to 4), 3 columns for 5–6,
 * - otherwise `list`: one row per option (shape + letter left, text right),
 *   on a landscape phone in 2 columns,
 * - the text size step follows the longest option.
 */
export function playerChoiceLayout(options: readonly { text: string }[], landscape = false): PlayerChoiceLayout {
  const count = options.length;
  const longest = longestText(options);
  if (longest <= PLAYER_GRID_TEXT_MAX) {
    const columns = landscape ? (count <= 4 ? (Math.max(count, 2) as 2 | 3 | 4) : 3) : 2;
    return { mode: "grid", columns, fit: textFit(longest, PLAYER_GRID_FIT) };
  }
  const columns = landscape && count > 1 ? 2 : 1;
  return { mode: "list", columns, fit: textFit(longest, PLAYER_LIST_FIT[columns]) };
}

/** Player choice tiles in a grid (short options) – the editor's player preview. */
export function playerChoiceGrid(options: readonly { text: string }[]): boolean {
  return playerChoiceLayout(options).mode === "grid";
}

/** Size step of the order items on the phone; many items take one step smaller. */
export function playerOrderFit(items: readonly { text: string }[]): TextFit {
  const fit = textFit(longestText(items), PLAYER_ORDER_FIT);
  return items.length > 5 ? smallerFit(fit) : fit;
}
