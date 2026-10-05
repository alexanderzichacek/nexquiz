/**
 * PC keyboard shortcuts for answer tiles (DESIGN.md "Prístupnosť"):
 * `A`–`F` or `1`–`6` select the option with that letter / number.
 */
const LETTERS = "abcdef";

export function optionIndexForKey(key: string, count: number): number | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  let index = LETTERS.indexOf(lower);
  if (index < 0 && lower >= "1" && lower <= "6") index = Number(lower) - 1;
  return index >= 0 && index < count ? index : null;
}
