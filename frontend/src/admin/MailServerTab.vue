<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from '../api'
import type { AdminSettings, MailServerSettings } from '../types'
import { useI18n } from '../i18n'

const props = defineProps<{ mailServer: MailServerSettings; csrf: string }>()
const emit = defineEmits<{ updated: [settings: AdminSettings]; busy: [value: boolean] }>()
const draft = reactive({ ...props.mailServer })
const pending = ref(false)
const testing = ref(false)
const status = ref('')
const error = ref('')
const { t, formatNumber } = useI18n()

watch([pending, testing], ([saving, checking]) => emit('busy', saving || checking))

watch(() => props.mailServer, (value) => {
  if (!pending.value && !testing.value) Object.assign(draft, value)
})

function valid(): boolean {
  try {
    const url = new URL(draft.jmapUrl)
    return ['http:', 'https:'].includes(url.protocol) && draft.catchallAddress.includes('@') && draft.retentionDays >= 1 && draft.retentionDays <= 3650
  } catch {
    return false
  }
}

async function save(): Promise<void> {
  error.value = ''
  status.value = ''
  if (!valid()) {
    error.value = t('error.mailValid')
    return
  }
  pending.value = true
  const values: Partial<MailServerSettings> = { ...draft }
  if (values.jmapToken === '********') delete values.jmapToken
  try {
    const settings = await api.admin.updateSettings({ mailServer: values }, props.csrf)
    emit('updated', settings)
    status.value = t('mail.saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.mail')
  } finally {
    pending.value = false
  }
}

async function testConnection(): Promise<void> {
  testing.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await api.admin.testMail(props.csrf)
    status.value = t('mail.passed', { domains: formatNumber(result.domainCount), messages: formatNumber(result.messages.stored) })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.connection')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <section class="admin-section" aria-labelledby="mail-server-title">
    <p class="eyebrow">{{ t('mail.eyebrow') }}</p>
    <h1 id="mail-server-title">{{ t('admin.mail') }}</h1>
    <form class="settings-form" @submit.prevent="save">
      <fieldset class="settings-fields" :disabled="pending || testing">
        <div class="field"><label for="jmap-url">{{ t('mail.url') }}</label><input id="jmap-url" v-model.trim="draft.jmapUrl" name="jmapUrl" type="url" required></div>
        <div class="field"><label for="jmap-token">{{ t('mail.token') }}</label><input id="jmap-token" v-model="draft.jmapToken" name="jmapToken" type="password" autocomplete="new-password" required><small>{{ t('mail.tokenHelp') }}</small></div>
        <div class="settings-grid">
          <div class="field"><label for="catchall-address">{{ t('mail.catchall') }}</label><input id="catchall-address" v-model.trim="draft.catchallAddress" name="catchallAddress" type="email" required></div>
          <div class="field"><label for="mail-account-id">{{ t('mail.account') }}</label><input id="mail-account-id" v-model.trim="draft.mailAccountId" name="mailAccountId"><small>{{ t('mail.accountHelp') }}</small></div>
          <div class="field"><label for="retention-days">{{ t('mail.retention') }}</label><input id="retention-days" v-model.number="draft.retentionDays" name="retentionDays" type="number" min="1" max="3650" required></div>
        </div>
        <div class="form-actions">
          <button class="secondary-button" type="button" :disabled="testing || pending" @click="testConnection">{{ testing ? t('mail.testing') : t('mail.test') }}</button>
          <button class="primary-button" type="submit" :disabled="pending || testing">{{ pending ? t('reader.saving') : t('mail.save') }}</button>
        </div>
      </fieldset>
      <p class="form-status" aria-live="polite">{{ status }}</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>
  </section>
</template>
