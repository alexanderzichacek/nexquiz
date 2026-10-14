import { onBeforeUnmount, onMounted, ref } from "vue";

/** The key event comes from a text field (typing must not trigger shortcuts). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/**
 * Fullscreen of the whole document (host game screen on a TV / projector).
 * `supported` is false where the Fullscreen API is missing or disabled
 * (e.g. iPhone Safari), so the toggle can be hidden. With `shortcut` the key
 * `F` toggles it too (not while typing, with modifiers or over a dialog).
 * Leaving the page exits the fullscreen it entered.
 */
export function useFullscreen(options: { shortcut?: boolean } = {}) {
  const supported = typeof document !== "undefined" && document.fullscreenEnabled === true;
  const active = ref(false);

  function sync(): void {
    active.value = document.fullscreenElement !== null;
  }

  async function toggle(): Promise<void> {
    if (!supported) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Refused by the browser (e.g. not triggered by a user gesture): nothing to do.
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "f" && event.key !== "F") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.defaultPrevented) return;
    if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    void toggle();
  }

  onMounted(() => {
    if (!supported) return;
    sync();
    document.addEventListener("fullscreenchange", sync);
    if (options.shortcut) window.addEventListener("keydown", onKey);
  });

  onBeforeUnmount(() => {
    if (!supported) return;
    document.removeEventListener("fullscreenchange", sync);
    window.removeEventListener("keydown", onKey);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  });

  return { supported, active, toggle };
}
