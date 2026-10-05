import { format, sk } from "@/i18n/sk";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative age for the quiz list: `práve teraz`, `5 min`, `2 h`, `3 d`. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return sk.relative.now;
  if (diff < HOUR) return format(sk.relative.minutes, { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return format(sk.relative.hours, { n: Math.floor(diff / HOUR) });
  return format(sk.relative.days, { n: Math.floor(diff / DAY) });
}

/** Short date as in the game history: `28.9.` (year added when it differs). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = `${d.getDate()}.${d.getMonth() + 1}.`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}${d.getFullYear()}`;
}

/** Seconds → `m:ss` (clip start, track length). */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const whole = Math.floor(totalSeconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Parses `m:ss`, `mm:ss` or plain seconds; returns NaN for anything else. */
export function parseClock(input: string): number {
  const value = input.trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}
