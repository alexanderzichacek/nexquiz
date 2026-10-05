import { authMeResponseSchema } from "@nexquiz/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { apiRequest } from "@/lib/api";

/** Host session state (`GET /api/auth/me`). */
export const useAuthStore = defineStore("auth", () => {
  const authenticated = ref<boolean | null>(null);

  async function refresh(): Promise<boolean> {
    try {
      const me = await apiRequest("/api/auth/me", authMeResponseSchema);
      authenticated.value = me.authenticated;
    } catch {
      authenticated.value = false;
    }
    return authenticated.value;
  }

  /** Uses the cached value when known, otherwise asks the server. */
  async function ensure(): Promise<boolean> {
    return authenticated.value ?? (await refresh());
  }

  function setAuthenticated(value: boolean): void {
    authenticated.value = value;
  }

  return { authenticated, refresh, ensure, setAuthenticated };
});
