import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { containRect, type Rect } from "./imageFit";

/**
 * Tracks the visible image rect of an `<img>` with `object-fit: contain`
 * (relative to the element). Updates on load and on every resize.
 */
export function useContainedImage(img: Readonly<Ref<HTMLImageElement | null>>) {
  const rect = ref<Rect>({ left: 0, top: 0, width: 0, height: 0 });
  const loaded = ref(false);
  let observer: ResizeObserver | null = null;

  function update(): void {
    const el = img.value;
    if (!el) return;
    const box = el.getBoundingClientRect();
    rect.value = containRect(
      { width: box.width, height: box.height },
      { width: el.naturalWidth, height: el.naturalHeight },
    );
    loaded.value = el.complete && el.naturalWidth > 0;
  }

  onMounted(() => {
    const el = img.value;
    if (!el) return;
    el.addEventListener("load", update);
    observer = new ResizeObserver(update);
    observer.observe(el);
    update();
  });

  onBeforeUnmount(() => {
    img.value?.removeEventListener("load", update);
    observer?.disconnect();
  });

  return { rect, loaded, update };
}
