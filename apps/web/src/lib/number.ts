import { numberValueSchema } from "@nexquiz/shared";

/**
 * Parses what a person typed into a `number` answer: optional minus (`-` or `−`),
 * digits, a decimal comma or dot, spaces anywhere (`1 998,5`). Returns `null`
 * when it is not a number the server accepts (limits and decimals come from the
 * shared `numberValueSchema`).
 */
export function parseNumberInput(raw: string): number | null {
  const cleaned = raw
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace("−", "-")
    .replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!numberValueSchema.safeParse(value).success) return null;
  return value === 0 ? 0 : value;
}

/** Whole part with a non-breaking space between thousands, from five digits up (a year stays `2026`, as in Slovak typography). */
function groupWhole(whole: string): string {
  return whole.length < 5 ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

/** Display form of a `number` answer: `2026`, `−12,5`, `1 250 000`, decimals with a comma. */
export function formatNumber(value: number): string {
  const [whole = "0", fraction] = Math.abs(value).toFixed(3).replace(/\.?0+$/, "").split(".");
  return `${value < 0 ? "−" : ""}${groupWhole(whole)}${fraction ? `,${fraction}` : ""}`;
}
