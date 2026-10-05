import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * Height (px) of the part of the layout viewport covered by the on-screen
 * keyboard, from `visualViewport`. Sticky player footers use it as their
 * `bottom` offset so the keyboard never covers the „Odoslať“ button (iOS
 * does not shrink the layout viewport; Android usually reports 0 here).
 */
export function useKeyboardInset() {
  const inset = ref(0);
  const vv = typeof window === "undefined" ? undefined : window.visualViewport;

  function update(): void {
    if (!vv) return;
    inset.value = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }

  onMounted(() => {
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    update();
  });
  onBeforeUnmount(() => {
    vv?.removeEventListener("resize", update);
    vv?.removeEventListener("scroll", update);
  });

  return inset;
}
