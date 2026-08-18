<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeToggle from './ThemeToggle.vue'
import UnlockControl from './UnlockControl.vue'
import { useI18n } from '../i18n'

const props = withDefaults(defineProps<{
  appName?: string
  logoDataUrl?: string
  showLocalePicker?: boolean
  showUnlock?: boolean
  accessToken?: string
  unlocking?: boolean
  bulkActive?: boolean
}>(), {
  appName: '', logoDataUrl: '', showLocalePicker: true, showUnlock: true, accessToken: '', unlocking: false, bulkActive: false,
})

const emit = defineEmits<{ home: []; unlock: []; lock: []; bulk: [] }>()
const unlockOpen = defineModel<boolean>('unlockOpen', { required: true })
const unlockValue = defineModel<string>('unlockValue', { required: true })
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
      <a class="bulk-link" href="#" :aria-current="props.bulkActive ? 'page' : undefined" @click.prevent="emit('bulk')">
        <AppIcon name="sparkles" />
        {{ t('nav.bulk') }}
      </a>
      <a class="admin-link" href="/admin">
        <AppIcon name="shield" />
        {{ t('nav.admin') }}
      </a>
      <div v-if="props.showUnlock" class="header-unlock">
        <UnlockControl
          input-id="header-access-credential"
          :access-token="props.accessToken"
          :unlocking="props.unlocking"
          v-model:unlock-open="unlockOpen"
          v-model:unlock-value="unlockValue"
          @unlock="emit('unlock')"
          @lock="emit('lock')"
        />
      </div>
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
