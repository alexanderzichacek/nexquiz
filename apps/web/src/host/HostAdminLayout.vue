<script setup lang="ts">
import { okAckSchema } from "@nexquiz/shared";
import { useRouter } from "vue-router";
import AppFooter from "@/components/AppFooter.vue";
import AppHeader from "@/components/AppHeader.vue";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useQuizEditorStore } from "./editor/store";

const router = useRouter();
const auth = useAuthStore();
const editor = useQuizEditorStore();

async function logout(): Promise<void> {
  // An open editor saves its pending changes before the session ends.
  if (editor.loadState === "ready") await editor.flush();
  try {
    await apiRequest("/api/auth/logout", okAckSchema, { method: "POST" });
  } catch {
    // Even if the request fails, the local session state is dropped.
  }
  auth.setAuthenticated(false);
  await router.push({ name: "landing" });
}
</script>

<template>
  <div class="host-admin">
    <AppHeader home-to="/host">
      <template #actions>
        <BaseButton variant="ghost" @click="logout">{{ sk.header.logout }}</BaseButton>
      </template>
    </AppHeader>
    <main class="host-admin__main">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.host-admin {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  font-size: var(--fs-editor-body);
}

.host-admin__main {
  flex: 1;
  padding: var(--s-5);
}
</style>
