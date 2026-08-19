<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from '../api'
import type { AdminSettings, AdminSiteSettings } from '../types'
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const props = defineProps<{ site: AdminSiteSettings; csrf: string }>()
const emit = defineEmits<{ updated: [settings: AdminSettings]; busy: [value: boolean] }>()

function generalValues(site: AdminSiteSettings) {
  return {
    appName: site.appName,
    logoDataUrl: site.logoDataUrl,
    faviconDataUrl: site.faviconDataUrl,
    primaryColor: site.primaryColor,
    accentColor: site.accentColor,
    language: site.language,
    cookieEnabled: site.cookieEnabled,
    cookieText: site.cookieText,
  }
}

const draft = reactive(generalValues(props.site))
const pending = ref(false)
const filePending = ref(0)
const fileVersions = { logoDataUrl: 0, faviconDataUrl: 0 }
const { t } = useI18n()
const toast = useToast()

watch([pending, filePending], ([saving, files]) => emit('busy', saving || files > 0))

watch(() => props.site, (value) => {
  if (!pending.value && filePending.value === 0) Object.assign(draft, generalValues(value))
})

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('error.image')))
    reader.onerror = () => reject(new Error(t('error.image')))
    reader.onabort = () => reject(new Error(t('error.image')))
    reader.readAsDataURL(file)
  })
}

async function chooseImage(event: Event, key: 'logoDataUrl' | 'faviconDataUrl'): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const version = ++fileVersions[key]
  if (!file.type.startsWith('image/')) {
    toast.error(t('error.imageType'))
    return
  }
  if (file.size > 1024 * 1024) {
    toast.error(t('error.imageSize'))
    return
  }
  filePending.value += 1
  try {
    const value = await readFile(file)
    if (version === fileVersions[key]) draft[key] = value
  } catch (cause) {
    if (version === fileVersions[key]) toast.error(cause instanceof Error ? cause.message : t('error.image'))
  } finally {
    filePending.value -= 1
  }
}

async function save(): Promise<void> {
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: { ...draft } }, props.csrf)
    emit('updated', settings)
    toast.success(t('general.saved'))
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.general'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="admin-section" aria-labelledby="general-title">
    <p class="eyebrow">{{ t('general.eyebrow') }}</p>
    <h1 id="general-title">{{ t('admin.general') }}</h1>
    <form class="settings-form" @submit.prevent="save">
      <fieldset class="settings-fields" :disabled="pending || filePending > 0">
        <div class="settings-card panel">
          <h2 class="card-title">{{ t('admin.general') }}</h2>
          <div class="settings-grid">
            <div class="field">
              <label for="app-name">{{ t('general.appName') }}</label>
              <input id="app-name" v-model.trim="draft.appName" name="appName" required>
            </div>
            <div class="field">
              <label for="language">{{ t('general.language') }}</label>
              <input id="language" v-model.trim="draft.language" name="language" required>
              <small>{{ t('general.languageHelp') }}</small>
            </div>
          </div>
        </div>

        <div class="settings-card panel">
          <h2 class="card-title">Branding & Assets</h2>
          <div class="settings-grid">
            <div class="field image-upload-field">
              <label for="logo">{{ t('general.logo') }}</label>
              <div class="image-preview-container">
                <img v-if="draft.logoDataUrl" :src="draft.logoDataUrl" alt="Logo preview" class="brand-preview-thumb">
                <div v-else class="image-preview-placeholder">No logo</div>
                <input id="logo" name="logo" type="file" accept="image/*" class="file-input-custom" @change="chooseImage($event, 'logoDataUrl')">
              </div>
              <small>{{ t('general.imageHelp') }}</small>
            </div>

            <div class="field image-upload-field">
              <label for="favicon">{{ t('general.favicon') }}</label>
              <div class="image-preview-container">
                <img v-if="draft.faviconDataUrl" :src="draft.faviconDataUrl" alt="Favicon preview" class="brand-preview-thumb favicon-thumb">
                <div v-else class="image-preview-placeholder">No favicon</div>
                <input id="favicon" name="favicon" type="file" accept="image/*" class="file-input-custom" @change="chooseImage($event, 'faviconDataUrl')">
              </div>
              <small>{{ t('general.imageHelp') }}</small>
            </div>
          </div>

          <div class="settings-grid margin-top-md">
            <div class="field color-picker-field">
              <label for="primary-color">{{ t('general.primary') }}</label>
              <div class="color-input-wrapper">
                <span class="color-swatch-preview" :style="{ backgroundColor: draft.primaryColor }" />
                <input id="primary-color" v-model="draft.primaryColor" name="primaryColor" type="color">
              </div>
              <small>{{ t('general.colorHelp') }}</small>
            </div>
            <div class="field color-picker-field">
              <label for="accent-color">{{ t('general.accent') }}</label>
              <div class="color-input-wrapper">
                <span class="color-swatch-preview" :style="{ backgroundColor: draft.accentColor }" />
                <input id="accent-color" v-model="draft.accentColor" name="accentColor" type="color">
              </div>
              <small>{{ t('general.colorHelp') }}</small>
            </div>
          </div>
        </div>

        <div class="settings-card panel">
          <h2 class="card-title">Cookie Consent</h2>
          <label class="check-field">
            <input v-model="draft.cookieEnabled" name="cookieEnabled" type="checkbox">
            <span>{{ t('general.cookieEnabled') }}</span>
          </label>
          <div class="field margin-top-sm">
            <label for="cookie-text">{{ t('general.cookieText') }}</label>
            <textarea id="cookie-text" v-model="draft.cookieText" name="cookieText" rows="4" :disabled="!draft.cookieEnabled" />
          </div>
        </div>

        <div class="form-actions">
          <button class="primary-button" type="submit" :disabled="pending || filePending > 0">
            {{ pending ? t('reader.saving') : t('general.save') }}
          </button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
