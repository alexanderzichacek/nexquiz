import { loadToken } from "@/lib/playerToken";

/** Audio clip of the running question, cut on the server (no tags, nothing beyond the clip). */
export function clipUrl(pin: string, index: number): string {
  return `/api/games/${pin}/questions/${index}/clip`;
}

/**
 * Downloads the clip with the player token in the `Authorization` header
 * (never in the URL). Null when the player has no token or the server
 * refuses (e.g. the question has already ended).
 */
export async function fetchClip(pin: string, index: number, signal: AbortSignal): Promise<ArrayBuffer | null> {
  const token = loadToken(pin);
  if (!token) return null;
  const res = await fetch(clipUrl(pin, index), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  return res.ok ? res.arrayBuffer() : null;
}
