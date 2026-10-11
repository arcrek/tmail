<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ApiError, api } from '../api'
import { authorizationFailed, mailboxSession, validPassword } from '../mailbox-access'
import type { AddressSession } from '../types'
import { useI18n } from '../i18n'

const props = defineProps<{ session: AddressSession }>()
const emit = defineEmits<{ close: []; updated: [session: AddressSession]; invalid: []; replacing: [] }>()
const { t, formatDate } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
const currentPassword = ref('')
const password = ref('')
const confirmation = ref('')
const removing = ref(false)
const pending = ref(false)
const error = ref('')
const trigger = document.activeElement as HTMLElement | null
let active = true

async function submit(): Promise<void> {
  if (pending.value) return
  error.value = ''
  const session = props.session
  const admin = session.accessKind === 'admin'
  if ((!removing.value && !validPassword(password.value)) ||
      (!admin && session.protected && !validPassword(currentPassword.value))) {
    error.value = t('password.length')
    return
  }
  if (!removing.value && password.value !== confirmation.value) {
    error.value = t('password.mismatch')
    return
  }
  pending.value = true
  try {
    let replacement: AddressSession
    if (admin) {
      if (!session.csrf) throw new ApiError(401, 'Administrator session expired')
      if (removing.value) await api.admin.removeMailboxPassword(session.address, session.csrf)
      else await api.admin.setMailboxPassword(session.address, password.value, session.csrf)
      if (active) emit('replacing')
      const response = await api.admin.mailboxToken(session.address, session.csrf)
      replacement = { ...mailboxSession(session.address, response), accessKind: 'admin', csrf: session.csrf }
    } else {
      const response = removing.value
        ? await api.removePassword(session.token, currentPassword.value)
        : await api.setPassword(session.token, password.value, session.protected ? currentPassword.value : undefined)
      replacement = mailboxSession(session.address, response)
    }
    if (active) emit('updated', replacement)
  } catch (cause) {
    if (!active) return
    // A wrong current password must leave the visitor's existing session usable.
    const apiError = cause instanceof ApiError ? cause : undefined
    const unauthorized = authorizationFailed(cause)
    const invalidToken = apiError?.detail?.code === 'invalid_token'
    if (invalidToken) error.value = t('password.changed')
    else if (unauthorized && !admin) error.value = t('password.invalid')
    else error.value = apiError?.message ?? t('error.unavailable')
    if (invalidToken || (admin && unauthorized) || apiError?.status === 409) emit('invalid')
  } finally {
    currentPassword.value = ''
    password.value = ''
    confirmation.value = ''
    pending.value = false
  }
}

onMounted(() => dialog.value?.showModal?.())
onBeforeUnmount(() => {
  active = false
  currentPassword.value = password.value = confirmation.value = ''
  dialog.value?.close?.()
  trigger?.focus()
})
</script>

<template>
  <dialog ref="dialog" class="qr-modal-backdrop" aria-labelledby="mailbox-password-title" @cancel.prevent="!pending && emit('close')" @click.self="!pending && emit('close')">
    <div class="panel mailbox-password-dialog">
      <h2 id="mailbox-password-title">{{ t('password.title') }}</h2>
      <p class="mailbox-address">{{ session.address }}</p>
      <p v-if="session.protectedUntil">{{ t('password.deadline', { date: formatDate(session.protectedUntil, { dateStyle: 'long', timeStyle: 'short' }) }) }}</p>
      <p>{{ t('password.warning') }}</p>
      <form class="settings-form" @submit.prevent="submit">
        <input type="hidden" name="username" autocomplete="username" :value="session.address">
        <div v-if="session.protected && session.accessKind !== 'admin'" class="field">
          <label for="mailbox-current-password">{{ t('password.current') }}</label>
          <input id="mailbox-current-password" v-model="currentPassword" type="password" name="current-password" autocomplete="current-password" required :disabled="pending" :aria-invalid="Boolean(error)" aria-describedby="mailbox-password-error">
        </div>
        <template v-if="!removing">
          <div class="field">
            <label for="mailbox-new-password">{{ t('password.new') }}</label>
            <input id="mailbox-new-password" v-model="password" type="password" name="new-password" autocomplete="new-password" required :disabled="pending" aria-describedby="mailbox-password-help mailbox-password-error" :aria-invalid="Boolean(error)">
          </div>
          <div class="field">
            <label for="mailbox-confirm-password">{{ t('password.confirm') }}</label>
            <input id="mailbox-confirm-password" v-model="confirmation" type="password" name="confirm-password" autocomplete="new-password" required :disabled="pending">
          </div>
          <p id="mailbox-password-help">{{ t('password.length') }}</p>
        </template>
        <p v-else role="note">{{ t('password.removeWarning') }}</p>
        <p id="mailbox-password-error" class="reader-error" role="alert">{{ error }}</p>
        <div class="mailbox-password-actions">
          <button class="primary-button" type="submit" :disabled="pending">{{ pending ? t('password.busy') : removing ? t('password.remove') : !session.protected ? t('password.set') : session.accessKind === 'admin' ? t('password.reset') : t('password.change') }}</button>
          <button v-if="session.protected" class="secondary-button" type="button" :disabled="pending" @click="removing = !removing; error = ''">{{ removing ? t('password.change') : t('password.remove') }}</button>
          <button class="text-button" type="button" :disabled="pending" @click="emit('close')">{{ t('password.cancel') }}</button>
        </div>
      </form>
    </div>
  </dialog>
</template>
