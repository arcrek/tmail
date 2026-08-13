<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from '../api'
import SandboxFrame from '../components/SandboxFrame.vue'
import type { AdminSettings, AdminSiteSettings } from '../types'
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const props = defineProps<{ site: AdminSiteSettings; csrf: string }>()
const emit = defineEmits<{ updated: [settings: AdminSettings]; busy: [value: boolean] }>()

type AdRow = { name: string; html: string }

function adRows(value: Record<string, unknown>): AdRow[] {
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, html]) => ({ name, html }))
}

const draft = reactive({
  headerHtml: props.site.headerHtml,
  footerHtml: props.site.footerHtml,
  contentCss: props.site.contentCss,
  ads: adRows(props.site.adSlots),
})
const pending = ref(false)
const MAX_CONTENT_LENGTH = 100_000
const { t } = useI18n()
const toast = useToast()

watch(pending, (value) => emit('busy', value))

watch(() => props.site, (value) => {
  if (!pending.value) Object.assign(draft, {
    headerHtml: value.headerHtml,
    footerHtml: value.footerHtml,
    contentCss: value.contentCss,
    ads: adRows(value.adSlots),
  })
})

function addSlot(): void {
  draft.ads.push({ name: '', html: '' })
}

function removeSlot(index: number): void {
  draft.ads.splice(index, 1)
}

async function save(): Promise<void> {
  const names = draft.ads.map((slot) => slot.name.trim())
  if (names.some((name) => !name)) {
    toast.error(t('content.everyName'))
    return
  }
  if (new Set(names).size !== names.length) {
    toast.error(t('content.unique'))
    return
  }
  if ([draft.headerHtml, draft.footerHtml, draft.contentCss, ...draft.ads.map((slot) => slot.html)]
    .some((value) => value.length > MAX_CONTENT_LENGTH)) {
    toast.error(t('content.limit'))
    return
  }
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: {
      headerHtml: draft.headerHtml,
      footerHtml: draft.footerHtml,
      contentCss: draft.contentCss,
      adSlots: Object.fromEntries(draft.ads.map((slot, index) => [names[index], slot.html])),
    } }, props.csrf)
    emit('updated', settings)
    toast.success(t('content.saved'))
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.content'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="admin-section" aria-labelledby="content-title">
    <p class="eyebrow">{{ t('content.eyebrow') }}</p>
    <h1 id="content-title">{{ t('admin.content') }}</h1>
    <p class="admin-note">{{ t('content.note') }}</p>

    <form class="settings-form" @submit.prevent="save">
      <fieldset class="settings-fields" :disabled="pending">
        <div class="content-editor-grid">
          <div class="field"><label for="header-html">{{ t('content.header') }}</label><textarea id="header-html" v-model="draft.headerHtml" name="headerHtml" rows="10" /></div>
          <div class="preview-field"><span>{{ t('content.headerPreview') }}</span><SandboxFrame :html="draft.headerHtml" :css="draft.contentCss" mode="content" :title="t('content.headerPreview')" /></div>
        </div>
        <div class="content-editor-grid">
          <div class="field"><label for="footer-html">{{ t('content.footer') }}</label><textarea id="footer-html" v-model="draft.footerHtml" name="footerHtml" rows="10" /></div>
          <div class="preview-field"><span>{{ t('content.footerPreview') }}</span><SandboxFrame :html="draft.footerHtml" :css="draft.contentCss" mode="content" :title="t('content.footerPreview')" /></div>
        </div>
        <div class="field"><label for="content-css">{{ t('content.css') }}</label><textarea id="content-css" v-model="draft.contentCss" name="contentCss" rows="10" /></div>

        <section class="ad-settings" aria-labelledby="ad-slots-title">
          <div class="subsection-heading"><h2 id="ad-slots-title">{{ t('content.slots') }}</h2><button class="secondary-button compact-button" type="button" @click="addSlot">{{ t('content.add') }}</button></div>
          <div v-for="(slot, index) in draft.ads" :key="index" class="content-editor-grid ad-editor">
            <div class="field">
              <label :for="`ad-name-${index}`">{{ t('content.name') }}</label><input :id="`ad-name-${index}`" v-model.trim="slot.name" required>
              <label :for="`ad-html-${index}`">{{ t('content.ad') }}</label><textarea :id="`ad-html-${index}`" v-model="slot.html" rows="9" />
              <button class="text-button danger-text" type="button" @click="removeSlot(index)">{{ t('content.remove') }}</button>
            </div>
            <div class="preview-field"><span>{{ t('content.preview', { name: slot.name || t('content.ad') }) }}</span><SandboxFrame :html="slot.html" :css="draft.contentCss" mode="content" :title="t('content.preview', { name: slot.name || t('content.ad') })" /></div>
          </div>
          <p v-if="!draft.ads.length" class="empty-copy">{{ t('content.none') }}</p>
        </section>

        <div class="form-actions"><button class="primary-button" type="submit" :disabled="pending">{{ pending ? t('reader.saving') : t('content.save') }}</button></div>
      </fieldset>
    </form>
  </section>
</template>
