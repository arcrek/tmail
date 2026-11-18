<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import { groupCode } from '../verificationCode'

const { toasts, dismiss, pause, resume } = useToast()
const { t } = useI18n()
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.kind}`, { 'toast-structured': Boolean(toast.code || toast.actions?.length) }]"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
        :aria-live="toast.kind === 'error' ? 'assertive' : 'polite'"
        @mouseenter="pause(toast.id)"
        @mouseleave="resume(toast.id)"
        @focusin="pause(toast.id)"
        @focusout="resume(toast.id)"
      >
        <div class="toast-main">
          <span class="toast-icon-badge">
            <AppIcon
              :name="toast.kind === 'error' ? 'alert-triangle' : toast.kind === 'mail' ? 'brand-mail' : 'check-circle'"
              class="toast-icon"
            />
          </span>
          <span class="toast-message">{{ toast.message }}</span>
          <code v-if="toast.code" class="toast-code">{{ groupCode(toast.code) }}</code>
          <button type="button" class="toast-dismiss" :aria-label="t('toast.dismiss')" @click="dismiss(toast.id)">
            <AppIcon name="x" />
          </button>
        </div>
        <div v-if="toast.actions?.length" class="toast-actions">
          <button
            v-for="action in toast.actions"
            :key="action.label"
            type="button"
            class="toast-action"
            :class="{ 'toast-action-tertiary': action.primary }"
            @click="() => { action.onClick(); dismiss(toast.id) }"
          >{{ action.label }}</button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
