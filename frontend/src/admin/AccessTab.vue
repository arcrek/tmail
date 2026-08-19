<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import { copyText } from '../clipboard'
import type { AccessCredential } from '../types'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
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
const { t, formatDate } = useI18n()
const toast = useToast()

async function loadCredentials(clearSecret = false): Promise<void> {
  if (clearSecret) secret.value = ''
  try {
    credentials.value = (await api.admin.accessCredentials.list()).credentials
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.accessLoad'))
  }
}

async function create(body: { kind: 'password'; label: string; password: string } | { kind: 'token'; label: string }): Promise<boolean> {
  pending.value = true
  emit('busy', true)
  try {
    const created = await api.admin.accessCredentials.create(body, props.csrf)
    secret.value = created.secret ?? ''
    copied.value = false
    await loadCredentials()
    return true
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.access'))
    return false
  } finally {
    pending.value = false
    emit('busy', false)
  }
}

async function addPassword(): Promise<void> {
  if (password.value !== passwordConfirm.value) {
    toast.error(t('error.accessPasswordMatch'))
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
  pending.value = true
  emit('busy', true)
  try {
    await api.admin.accessCredentials.remove(id, props.csrf)
    await loadCredentials(true)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.access'))
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
    toast.error(t('error.accessCopy'))
  }
}

onMounted(loadCredentials)
</script>

<template>
  <section class="admin-section" aria-labelledby="access-title">
    <p class="eyebrow">{{ t('access.eyebrow') }}</p>
    <h1 id="access-title">{{ t('admin.access') }}</h1>

    <section v-if="secret" class="panel secret-banner" aria-live="polite">
      <div class="secret-banner-header">
        <AppIcon name="key" class="secret-icon" />
        <div>
          <h2>{{ t('access.secret') }}</h2>
          <p>{{ t('access.secretHelp') }}</p>
        </div>
      </div>
      <div class="secret-code-wrapper">
        <code class="secret-code font-mono">{{ secret }}</code>
        <div class="form-actions">
          <button class="primary-button compact-button" type="button" @click="copySecret">
            <AppIcon :name="copied ? 'check' : 'copy'" />
            <span>{{ copied ? t('access.copied') : t('access.copy') }}</span>
          </button>
          <button class="text-button" type="button" @click="secret = ''">{{ t('access.dismiss') }}</button>
        </div>
      </div>
    </section>

    <div class="admin-data-grid access-overview">
      <section class="settings-card panel" aria-labelledby="access-list-title">
        <div class="card-header-with-badge">
          <h2 id="access-list-title" class="card-title">{{ t('access.list') }}</h2>
          <span class="count-badge">{{ credentials.length }}</span>
        </div>
        <ul class="domain-list credentials-list">
          <li v-for="credential in credentials" :key="credential.id" class="credential-item">
            <div class="credential-info">
              <span class="credential-badge" :class="credential.kind === 'token' ? 'pill-success' : 'pill-neutral'">
                {{ t(`access.${credential.kind}`) }}
              </span>
              <span class="credential-label">{{ credential.label }}</span>
              <time class="credential-date font-mono">{{ formatDate(credential.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) }}</time>
            </div>
            <button class="secondary-button compact-button danger-text" type="button" :disabled="pending" @click="revoke(credential.id, credential.label)">
              <AppIcon name="trash-2" />
              <span>{{ t('access.revoke') }}</span>
            </button>
          </li>
          <li v-if="!credentials.length" class="empty-domain-message">{{ t('access.none') }}</li>
        </ul>
      </section>

      <div class="access-forms-column">
        <div class="settings-card panel">
          <h2 class="card-title">{{ t('access.addPassword') }}</h2>
          <form class="settings-form" @submit.prevent="addPassword">
            <fieldset class="settings-fields" :disabled="pending">
              <div class="field"><label for="access-password-label">{{ t('access.label') }}</label><input id="access-password-label" v-model.trim="passwordLabel" required></div>
              <div class="field"><label for="access-password">{{ t('access.password') }}</label><input id="access-password" v-model="password" type="password" autocomplete="new-password" required></div>
              <div class="field"><label for="access-password-confirm">{{ t('access.passwordConfirm') }}</label><input id="access-password-confirm" v-model="passwordConfirm" type="password" autocomplete="new-password" required></div>
              <button class="primary-button" type="submit">{{ t('access.addPassword') }}</button>
            </fieldset>
          </form>
        </div>

        <div class="settings-card panel margin-top-md">
          <h2 class="card-title">{{ t('access.generateToken') }}</h2>
          <form class="settings-form" @submit.prevent="generateToken">
            <fieldset class="settings-fields" :disabled="pending">
              <div class="field"><label for="access-token-label">{{ t('access.label') }}</label><input id="access-token-label" v-model.trim="tokenLabel" required></div>
              <button class="secondary-button" type="submit">{{ t('access.generateToken') }}</button>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
