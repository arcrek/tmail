<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
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
  bulkCodeActive?: boolean
}>(), {
  appName: '', logoDataUrl: '', showLocalePicker: true, showUnlock: true, accessToken: '', unlocking: false, bulkActive: false, bulkCodeActive: false,
})

const emit = defineEmits<{ home: []; unlock: []; lock: []; bulk: []; bulkCode: [] }>()
const unlockOpen = defineModel<boolean>('unlockOpen', { required: true })
const unlockValue = defineModel<string>('unlockValue', { required: true })
const { locale, selectLocale, t } = useI18n()
const mobileOpen = ref(false)

function closeMobileMenu(): void {
  mobileOpen.value = false
}

function toggleMobileMenu(): void {
  mobileOpen.value = !mobileOpen.value
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mobileOpen.value) {
    closeMobileMenu()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onBrandClick(event: MouseEvent): void {
  closeMobileMenu()
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('home')
}

function onBulkClick(): void {
  closeMobileMenu()
  emit('bulk')
}

function onBulkCodeClick(): void {
  closeMobileMenu()
  emit('bulkCode')
}

function onHomeClick(): void {
  closeMobileMenu()
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

    <div class="header-right-actions">
      <ThemeToggle />
      <button
        class="mobile-menu-button"
        type="button"
        :aria-expanded="mobileOpen"
        :aria-label="t('nav.toggleMenu')"
        aria-controls="app-header-nav"
        @click="toggleMobileMenu"
      >
        <AppIcon :name="mobileOpen ? 'x' : 'menu'" />
        <span class="sr-only">{{ t('nav.menu') }}</span>
      </button>
    </div>

    <nav
      id="app-header-nav"
      class="app-header-nav"
      :class="{ 'mobile-open': mobileOpen }"
      :aria-label="t('nav.site')"
    >
      <a class="home-link" href="/" @click.prevent="onHomeClick">
        <AppIcon name="home" />
        {{ t('nav.home') }}
      </a>
      <a href="/docs" @click="closeMobileMenu">
        <AppIcon name="external-link" />
        {{ t('nav.docs') }}
      </a>
      <a class="bulk-link" href="#" :aria-current="props.bulkActive ? 'page' : undefined" @click.prevent="onBulkClick">
        <AppIcon name="sparkles" />
        {{ t('nav.bulk') }}
      </a>
      <a class="bulk-code-link" href="#" :aria-current="props.bulkCodeActive ? 'page' : undefined" @click.prevent="onBulkCodeClick">
        <AppIcon name="file-text" />
        {{ t('nav.bulkCode') }}
      </a>
      <a class="admin-link" href="/admin" @click="closeMobileMenu">
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
      <div class="desktop-theme-toggle">
        <ThemeToggle />
      </div>
    </nav>
  </header>
</template>
