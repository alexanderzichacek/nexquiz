/**
 * Normalizes a free-text answer or alias for comparison (LOGIC.md "Fuzzy matching"):
 * NFD + strip diacritics, lowercase, `&` → `and`, drop bracketed content and
 * everything from `feat.` / `ft.`, strip punctuation, drop a leading `the`,
 * collapse whitespace.
 *
 * Deviation from the LOGIC.md snippet: whitespace is collapsed and trimmed
 * BEFORE the leading `the` is removed, so `"  The Beatles"` or
 * `"(Live) The Beatles"` also normalize to `beatles`.
 */
export function normalize(s: string): string {
  const cleaned = s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s(feat|ft)\.?\s.*$/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/^the\s+/, "").trim();
}
