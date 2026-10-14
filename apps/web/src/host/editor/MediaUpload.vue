<script setup lang="ts">
import {
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  mediaUploadResponseSchema,
  type MediaKind,
  type MediaUploadResponse,
  VIDEO_MIME_TYPES,
} from "@nexquiz/shared";
import { computed, ref, useTemplateRef } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { apiUpload } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** Upload button for one image, audio or video file (`POST /api/media`). */
const props = withDefaults(defineProps<{ kind: MediaKind; hasMedia: boolean; removable?: boolean }>(), {
  removable: true,
});
const emit = defineEmits<{ uploaded: [media: MediaUploadResponse, fileName: string]; remove: [] }>();

const fileEl = useTemplateRef<HTMLInputElement>("fileEl");
const uploading = ref(false);
const error = ref<string | null>(null);

const MIME_TYPES = { image: IMAGE_MIME_TYPES, audio: AUDIO_MIME_TYPES, video: VIDEO_MIME_TYPES } as const;
const LABELS = {
  image: { upload: sk.editor.uploadImage, replace: sk.editor.replaceImage, remove: sk.editor.removeImage },
  audio: { upload: sk.editor.uploadAudio, replace: sk.editor.replaceAudio, remove: sk.editor.removeAudio },
  video: { upload: sk.editor.uploadVideo, replace: sk.editor.replaceVideo, remove: sk.editor.removeVideo },
} as const;

const accept = computed(() => Object.keys(MIME_TYPES[props.kind]).join(","));
const label = computed(() => (props.hasMedia ? LABELS[props.kind].replace : LABELS[props.kind].upload));

async function onChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  error.value = null;
  try {
    const media = await apiUpload("/api/media", file, mediaUploadResponseSchema);
    if (media.kind !== props.kind) {
      error.value = sk.editor.uploadUnsupported;
      return;
    }
    emit("uploaded", media, file.name);
  } catch (err) {
    error.value = errorMessage(err, sk.editor.uploadFailed);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="upload">
    <input ref="fileEl" type="file" class="visually-hidden" :accept="accept" tabindex="-1" @change="onChange" />
    <BaseButton variant="secondary" :loading="uploading" @click="fileEl?.click()">
      {{ uploading ? sk.editor.uploading : label }}
    </BaseButton>
    <BaseButton v-if="hasMedia && removable" variant="ghost" @click="emit('remove')">
      {{ LABELS[kind].remove }}
    </BaseButton>
    <p v-if="error" class="upload__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.upload {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.upload__error {
  flex-basis: 100%;
  color: var(--danger);
  font-size: var(--fs-editor-label);
}
</style>
