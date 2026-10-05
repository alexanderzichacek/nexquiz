<script setup lang="ts">
import type { TextQuestion } from "@nexquiz/shared";
import { sk } from "@/i18n/sk";
import AliasChips from "./AliasChips.vue";
import AnswerTester from "./AnswerTester.vue";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/** `text` question: accepted aliases + answer tester. */
const question = defineModel<TextQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();
</script>

<template>
  <div class="stack">
    <div>
      <span class="label">{{ sk.editor.aliases }}</span>
      <AliasChips
        v-model="question.data.fields[0].accepted"
        :label="sk.editor.aliases"
        :invalid="!!errors['data.fields.0.accepted']"
      />
      <p class="hint">{{ sk.editor.aliasHint }}</p>
      <FieldError :message="errors['data.fields.0.accepted']" />
    </div>
    <AnswerTester :accepted="question.data.fields[0].accepted" :tolerance="question.data.tolerance" />
  </div>
</template>
