<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import { mediaUrl } from "@/lib/forms";

/**
 * Question video on the player's device (only with sound and video on).
 * Starts with sound; when the browser blocks that (no recent tap, e.g. after
 * a reload) it starts muted and the player unmutes it in the controls.
 */
defineProps<{ videoId: string }>();

const el = useTemplateRef<HTMLVideoElement>("el");

onMounted(async () => {
  const video = el.value;
  if (!video) return;
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play().catch(() => undefined);
  }
});

onBeforeUnmount(() => el.value?.pause());
</script>

<template>
  <video ref="el" :src="mediaUrl(videoId)" controls playsinline preload="auto"></video>
</template>
