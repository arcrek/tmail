<script setup lang="ts">
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const { toasts, dismiss } = useToast()
const { t } = useI18n()
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.kind}`"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
        aria-live="polite"
      >
        <span>{{ toast.message }}</span>
        <button type="button" class="toast-dismiss" :aria-label="t('toast.dismiss')" @click="dismiss(toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
