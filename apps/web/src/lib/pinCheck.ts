import { gameExistsResponseSchema } from "@nexquiz/shared";
import { sk } from "@/i18n/sk";
import { ApiError, apiRequest } from "./api";

/**
 * Result of `GET /api/games/:pin/exists`. Only `missing` means "no such game";
 * a 429 or a failed request must not be shown as "game not found".
 */
export type PinCheck = "exists" | "missing" | "rateLimited" | "failed";

export async function checkPin(pin: string): Promise<PinCheck> {
  try {
    const res = await apiRequest(`/api/games/${pin}/exists`, gameExistsResponseSchema);
    return res.exists ? "exists" : "missing";
  } catch (err) {
    return err instanceof ApiError && err.code === "RATE_LIMITED" ? "rateLimited" : "failed";
  }
}

/** Message for a check that did not confirm the game (null for `exists`). */
export function pinCheckMessage(result: PinCheck): string | null {
  switch (result) {
    case "exists":
      return null;
    case "missing":
      return sk.errors.pinNotFound;
    case "rateLimited":
      return sk.errors.rateLimited;
    case "failed":
      return sk.errors.connectionFailed;
  }
}

/** How long a PIN confirmed on the landing page is trusted by the /play page. */
export const CONFIRMED_PIN_TTL_MS = 30_000;

/**
 * PINs just confirmed by the landing page, so /play does not ask `/exists`
 * a second time right after the navigation. In memory only (not
 * `localStorage`): a reload or a QR entry checks the PIN again.
 */
const confirmedPins = new Map<string, number>();

export function rememberConfirmedPin(pin: string, now: number = Date.now()): void {
  confirmedPins.set(pin, now + CONFIRMED_PIN_TTL_MS);
}

/** True (once) when the PIN was confirmed within `CONFIRMED_PIN_TTL_MS`. */
export function takeConfirmedPin(pin: string, now: number = Date.now()): boolean {
  const until = confirmedPins.get(pin);
  confirmedPins.delete(pin);
  return until !== undefined && now < until;
}
