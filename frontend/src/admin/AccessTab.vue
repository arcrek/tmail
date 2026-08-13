<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { copyText } from '../clipboard'
import type { AccessCredential } from '../types'
import { useI18n } from '../i18n'

const props = defineProps<{ csrf: string }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const credentials = ref<AccessCredential[]>([])
const passwordLabel = ref('')
const password = ref('')
const passwordConfirm = ref('')
const tokenLabel = ref('')
const secret = ref('')
const copied = ref(false)
const pending = ref(false)
const error = ref('')
const { t, formatDate } = useI18n()

async function loadCredentials(clearSecret = false): Promise<void> {
  if (clearSecret) secret.value = ''
  try {
    credentials.value = (await api.admin.accessCredentials.list()).credentials
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.accessLoad')
  }
}

async function create(body: { kind: 'password'; label: string; password: string } | { kind: 'token'; label: string }): Promise<boolean> {
  error.value = ''
  pending.value = true
  emit('busy', true)
  try {
    const created = await api.admin.accessCredentials.create(body, props.csrf)
    secret.value = created.secret ?? ''
    copied.value = false
    await loadCredentials()
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.access')
    return false
  } finally {
    pending.value = false
    emit('busy', false)
  }
}

async function addPassword(): Promise<void> {
  if (password.value !== passwordConfirm.value) {
    error.value = t('error.accessPasswordMatch')
    return
  }
  if (!await create({ kind: 'password', label: passwordLabel.value, password: password.value })) return
  password.value = ''
  passwordConfirm.value = ''
  passwordLabel.value = ''
}

async function generateToken(): Promise<void> {
  if (!await create({ kind: 'token', label: tokenLabel.value })) return
  tokenLabel.value = ''
}

async function revoke(id: string, label: string): Promise<void> {
  if (!window.confirm(t('access.revokeConfirm', { label }))) return
  error.value = ''
  pending.value = true
  emit('busy', true)
  try {
    await api.admin.accessCredentials.remove(id, props.csrf)
    await loadCredentials(true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.access')
  } finally {
    pending.value = false
    emit('busy', false)
  }
}

async function copySecret(): Promise<void> {
  try {
    await copyText(secret.value)
    copied.value = true
  } catch {
    error.value = t('error.accessCopy')
  }
}

onMounted(loadCredentials)
</script>

<template>
  <section class="admin-section" aria-labelledby="access-title">
    <p class="eyebrow">{{ t('access.eyebrow') }}</p>
    <h1 id="access-title">{{ t('admin.access') }}</h1>

    <section v-if="secret" class="panel empty-state" aria-live="polite">
      <h2>{{ t('access.secret') }}</h2>
      <p>{{ t('access.secretHelp') }}</p>
      <p><code>{{ secret }}</code></p>
      <div class="form-actions"><button class="secondary-button compact-button" type="button" @click="copySecret">{{ copied ? t('access.copied') : t('access.copy') }}</button><button class="text-button" type="button" @click="secret = ''">{{ t('access.dismiss') }}</button></div>
    </section>

    <section class="admin-data-grid" aria-labelledby="access-list-title">
      <div>
        <h2 id="access-list-title">{{ t('access.list') }}</h2>
        <div class="form-actions"><strong>{{ t('access.kind') }}</strong><strong>{{ t('access.label') }}</strong><strong>{{ t('access.created') }}</strong><strong>{{ t('access.revoke') }}</strong></div>
        <ul class="domain-list">
          <li v-for="credential in credentials" :key="credential.id"><span><strong>{{ t(`access.${credential.kind}`) }}</strong> · {{ credential.label }} · {{ formatDate(credential.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) }}</span><button class="secondary-button compact-button danger-text" type="button" :disabled="pending" @click="revoke(credential.id, credential.label)">{{ t('access.revoke') }}</button></li>
          <li v-if="!credentials.length">{{ t('access.none') }}</li>
        </ul>
      </div>
      <div>
        <h2>{{ t('access.addPassword') }}</h2>
        <form class="settings-form" @submit.prevent="addPassword">
          <fieldset class="settings-fields" :disabled="pending">
            <div class="field"><label for="access-password-label">{{ t('access.label') }}</label><input id="access-password-label" v-model.trim="passwordLabel" required></div>
            <div class="field"><label for="access-password">{{ t('access.password') }}</label><input id="access-password" v-model="password" type="password" autocomplete="new-password" required></div>
            <div class="field"><label for="access-password-confirm">{{ t('access.passwordConfirm') }}</label><input id="access-password-confirm" v-model="passwordConfirm" type="password" autocomplete="new-password" required></div>
            <button class="primary-button" type="submit">{{ t('access.addPassword') }}</button>
          </fieldset>
        </form>
        <h2>{{ t('access.generateToken') }}</h2>
        <form class="settings-form" @submit.prevent="generateToken">
          <fieldset class="settings-fields" :disabled="pending">
            <div class="field"><label for="access-token-label">{{ t('access.label') }}</label><input id="access-token-label" v-model.trim="tokenLabel" required></div>
            <button class="secondary-button" type="submit">{{ t('access.generateToken') }}</button>
          </fieldset>
        </form>
      </div>
    </section>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
