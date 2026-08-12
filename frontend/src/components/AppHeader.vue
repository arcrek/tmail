<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useI18n } from '../i18n'

const props = withDefaults(defineProps<{
  appName?: string
  logoDataUrl?: string
  showLocalePicker?: boolean
}>(), { appName: '', logoDataUrl: '', showLocalePicker: true })

const emit = defineEmits<{ home: [] }>()
const { locale, selectLocale, t } = useI18n()

function onBrandClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('home')
}

function onLocaleChange(event: Event): void {
  selectLocale((event.target as HTMLSelectElement).value)
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
      <label v-if="props.showLocalePicker" class="locale-picker">
        <span class="sr-only">{{ t('locale.label') }}</span>
        <select :value="locale" :aria-label="t('locale.label')" @change="onLocaleChange">
          <option value="en">{{ t('locale.english') }}</option>
          <option value="vi">{{ t('locale.vietnamese') }}</option>
        </select>
      </label>
      <ThemeToggle />
    </nav>
  </header>
</template>
