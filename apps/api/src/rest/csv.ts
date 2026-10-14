import type { GameResultsResponse } from "@nexquiz/shared";

const UTF8_BOM = "\uFEFF";

/** Quotes a CSV cell (RFC 4180) and neutralizes spreadsheet formulas (CSV injection). */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Scores are whole points. */
function wholePoints(value: number): string {
  return String(Math.round(value));
}

/**
 * Final ranking as CSV: one row per player with rank, nickname, total score
 * and the points of every question (`Q1`, `Q2`, …). UTF-8 with BOM so that
 * spreadsheet apps detect the encoding of nicknames with diacritics.
 */
export function resultsToCsv(results: GameResultsResponse): string {
  // Columns are numbered by question: pages are not in `results.questions`, `index` only keys the answers.
  const header = ["rank", "nickname", "score", ...results.questions.map((_, i) => `Q${i + 1}`)];
  const points = new Map<string, number>();
  for (const a of results.answers) points.set(`${a.playerId}:${a.questionIndex}`, a.points);

  const rows = results.players.map((p) => [
    p.finalRank,
    p.nickname,
    wholePoints(p.score),
    ...results.questions.map((q) => wholePoints(points.get(`${p.id}:${q.index}`) ?? 0)),
  ]);
  const lines = [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(","));
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
