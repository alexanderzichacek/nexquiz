import { defineStore } from "pinia";
import { ref } from "vue";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

/** Promise based confirmation dialog rendered by `ConfirmHost`. */
export const useConfirmStore = defineStore("confirm", () => {
  const pending = ref<PendingConfirm | null>(null);

  function ask(request: ConfirmRequest): Promise<boolean> {
    // A new request cancels the previous one.
    pending.value?.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.value = { ...request, resolve };
    });
  }

  function answer(ok: boolean): void {
    const current = pending.value;
    pending.value = null;
    current?.resolve(ok);
  }

  return { pending, ask, answer };
});
