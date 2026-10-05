<script setup lang="ts">
import { RouterView } from "vue-router";
import ConfirmHost from "@/components/ConfirmHost.vue";
import ToastHost from "@/components/ToastHost.vue";
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmHost />
</template>
