/**
 * Player token storage: `localStorage` key `nexquiz:{pin}` (the only
 * non-preference value the app keeps in `localStorage`). Every access is
 * guarded – storage may be unavailable (private mode, blocked site data).
 */
export function tokenKey(pin: string): string {
  return `nexquiz:${pin}`;
}

export function loadToken(pin: string): string | null {
  try {
    return window.localStorage.getItem(tokenKey(pin));
  } catch {
    return null;
  }
}

export function saveToken(pin: string, token: string): void {
  try {
    window.localStorage.setItem(tokenKey(pin), token);
  } catch {
    // Without storage the player simply cannot rejoin after a reload.
  }
}

export function clearToken(pin: string): void {
  try {
    window.localStorage.removeItem(tokenKey(pin));
  } catch {
    // Nothing to clean up.
  }
}
