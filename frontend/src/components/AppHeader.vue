<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useI18n } from '../i18n'

withDefaults(defineProps<{
  appName?: string
  logoDataUrl?: string
}>(), { appName: '', logoDataUrl: '' })

const emit = defineEmits<{ home: [] }>()
const { t } = useI18n()

function onBrandClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('home')
}
</script>

<template>
  <header class="app-header">
    <a class="brand" href="/" @click="onBrandClick">
      <img v-if="logoDataUrl" :src="logoDataUrl" alt="">
      <span class="brand-name">{{ appName || t('app.defaultName') }}</span>
    </a>

    <nav class="app-header-nav" :aria-label="t('nav.site')">
      <a href="/docs">
        <AppIcon name="external-link" />
        {{ t('nav.docs') }}
      </a>
      <a class="admin-link" href="/admin">
        <AppIcon name="shield" />
        {{ t('nav.admin') }}
      </a>
      <ThemeToggle />
    </nav>
  </header>
</template>
