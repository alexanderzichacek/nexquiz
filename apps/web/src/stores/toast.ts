import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const DEFAULT_DURATION_MS = 4000;

/** Global toast queue rendered by `ToastHost`. */
export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function show(message: string, kind: ToastKind = "info", durationMs: number = DEFAULT_DURATION_MS): number {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, kind, message }];
    if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
    return id;
  }

  return { toasts, show, dismiss };
});
