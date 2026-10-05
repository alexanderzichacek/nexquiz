<script setup lang="ts">
import {
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  mediaUploadResponseSchema,
  type MediaKind,
  type MediaUploadResponse,
} from "@nexquiz/shared";
import { computed, ref, useTemplateRef } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { apiUpload } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** Upload button for one image or audio file (`POST /api/media`). */
const props = withDefaults(defineProps<{ kind: MediaKind; hasMedia: boolean; removable?: boolean }>(), {
  removable: true,
});
const emit = defineEmits<{ uploaded: [media: MediaUploadResponse, fileName: string]; remove: [] }>();

const fileEl = useTemplateRef<HTMLInputElement>("fileEl");
const uploading = ref(false);
const error = ref<string | null>(null);

const accept = computed(() => Object.keys(props.kind === "image" ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES).join(","));
const label = computed(() => {
  if (props.kind === "image") return props.hasMedia ? sk.editor.replaceImage : sk.editor.uploadImage;
  return props.hasMedia ? sk.editor.replaceAudio : sk.editor.uploadAudio;
});

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
    <BaseButton v-if="hasMedia && removable && kind === 'image'" variant="ghost" @click="emit('remove')">
      {{ sk.editor.removeImage }}
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
