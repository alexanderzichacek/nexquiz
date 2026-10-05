<script setup lang="ts">
import { sk } from "@/i18n/sk";

const ALNEXIO_URL = "https://alnexio.sk";
</script>

<template>
  <footer class="app-footer">
    {{ sk.footer.createdBy }}
    <a :href="ALNEXIO_URL" target="_blank" rel="noopener">{{ sk.footer.company }}</a>
  </footer>
</template>

<style scoped>
.app-footer {
  text-align: center;
  font-size: var(--fs-small);
  color: var(--text-muted);
  padding: var(--s-5);
  padding-bottom: max(var(--s-5), env(safe-area-inset-bottom));
  border-top: var(--border-w) solid var(--border);
}

.app-footer a {
  color: var(--primary);
  text-decoration: none;
}

.app-footer a:hover,
.app-footer a:focus-visible {
  text-decoration: underline;
}
</style>
