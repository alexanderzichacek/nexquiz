import type { GameResultsResponse } from "@nexquiz/shared";

const UTF8_BOM = "\uFEFF";

/** Quotes a CSV cell (RFC 4180) and neutralizes spreadsheet formulas (CSV injection). */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Final ranking as CSV: one row per player with rank, nickname, total score
 * and the points of every question (`Q1`, `Q2`, …). UTF-8 with BOM so that
 * spreadsheet apps detect the encoding of nicknames with diacritics.
 */
export function resultsToCsv(results: GameResultsResponse): string {
  const header = ["rank", "nickname", "score", ...results.questions.map((q) => `Q${q.index + 1}`)];
  const points = new Map<string, number>();
  for (const a of results.answers) points.set(`${a.playerId}:${a.questionIndex}`, a.points);

  const rows = results.players.map((p) => [
    p.finalRank,
    p.nickname,
    p.score.toFixed(2),
    ...results.questions.map((q) => (points.get(`${p.id}:${q.index}`) ?? 0).toFixed(2)),
  ]);
  const lines = [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(","));
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
