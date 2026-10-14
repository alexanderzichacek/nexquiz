import { inject, onBeforeUnmount, provide, readonly, ref, type InjectionKey, type Ref } from "vue";
import { loadPlayerMedia, savePlayerMedia } from "@/lib/preferences";
import { StageAudio } from "@/lib/sounds";

/**
 * Sound and video on the player's own device – for a player who is not in
 * the room with the host screen. Off by default; switched on at the nickname
 * step (or between questions) and remembered as a UI preference.
 */
export interface PlayerMedia {
  readonly pin: string;
  /** The player turned sound and video on. */
  readonly enabled: Readonly<Ref<boolean>>;
  /** The audio context runs – sounds and the clip can start without a tap. */
  readonly unlocked: Readonly<Ref<boolean>>;
  readonly audio: StageAudio;
  /** Call from a tap / click: switching on also unlocks audio (autoplay policy). */
  setEnabled(on: boolean): void;
}

const PLAYER_MEDIA: InjectionKey<PlayerMedia> = Symbol("playerMedia");

/** Events that count as a user gesture for audio (iPhone Safari needs `touchend` / `click`). */
const GESTURES = ["pointerdown", "touchend", "click", "keydown"] as const;

/** Created by the player page; children get it with `usePlayerMedia()`. */
export function providePlayerMedia(pin: string): PlayerMedia {
  const audio = new StageAudio();
  const enabled = ref(loadPlayerMedia());
  const unlocked = ref(false);
  audio.onStateChange((running) => {
    unlocked.value = running;
  });

  function setEnabled(on: boolean): void {
    enabled.value = on;
    savePlayerMedia(on);
    if (on) audio.unlock();
  }

  // After a reload the browser needs a new gesture: any tap unlocks the audio again.
  function unlockOnGesture(): void {
    if (enabled.value && !audio.unlocked) audio.unlock();
  }
  for (const type of GESTURES) window.addEventListener(type, unlockOnGesture, { capture: true, passive: true });
  onBeforeUnmount(() => {
    for (const type of GESTURES) window.removeEventListener(type, unlockOnGesture, { capture: true });
    audio.dispose();
  });

  const media: PlayerMedia = { pin, enabled: readonly(enabled), unlocked: readonly(unlocked), audio, setEnabled };
  provide(PLAYER_MEDIA, media);
  return media;
}

export function usePlayerMedia(): PlayerMedia {
  const media = inject(PLAYER_MEDIA);
  if (!media) throw new Error("usePlayerMedia() outside of the player page");
  return media;
}
