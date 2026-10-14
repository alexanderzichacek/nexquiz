/**
 * UI preferences in `localStorage` (besides the player token the only thing
 * kept there). Every access is guarded – storage may be unavailable.
 */
const PLAYER_MEDIA_KEY = "nexquiz:pref:playerMedia";

/** The player plays sound and video on their own device (off by default). */
export function loadPlayerMedia(): boolean {
  try {
    return window.localStorage.getItem(PLAYER_MEDIA_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePlayerMedia(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(PLAYER_MEDIA_KEY, "1");
    else window.localStorage.removeItem(PLAYER_MEDIA_KEY);
  } catch {
    // Without storage the choice lasts until a reload.
  }
}
