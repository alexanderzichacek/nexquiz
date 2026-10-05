import { onBeforeUnmount, ref, type Ref } from "vue";

/** Reactive `window.matchMedia(query).matches`. */
export function useMediaQuery(query: string): Ref<boolean> {
  const mql = window.matchMedia(query);
  const matches = ref(mql.matches);
  const onChange = (e: MediaQueryListEvent): void => {
    matches.value = e.matches;
  };
  mql.addEventListener("change", onChange);
  onBeforeUnmount(() => mql.removeEventListener("change", onChange));
  return matches;
}
