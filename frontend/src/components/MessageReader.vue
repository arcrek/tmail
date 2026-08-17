<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import type { AttachmentResource, MessageResource } from '../types'
import AppIcon from './AppIcon.vue'
import SandboxFrame from './SandboxFrame.vue'
import { useI18n } from '../i18n'

const props = defineProps<{ token: string; id: string }>()
const emit = defineEmits<{
  close: []
  deleted: [id: string]
  seen: [id: string]
  stale: [id: string]
}>()
const { t, formatDate: localDate, formatNumber } = useI18n()

const message = ref<MessageResource | null>(null)
const loading = ref(true)
const error = ref('')
const actionError = ref('')
const bodyMode = ref<'html' | 'text'>('html')
const busy = ref('')
const backButton = ref<HTMLButtonElement | null>(null)
let requestVersion = 0

const verificationCode = computed(() => {
  const current = message.value
  if (!current) return ''
  const find = (value: string) => {
    const candidates = value.match(/(?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9])/g)
    for (const candidate of candidates ?? []) {
      const digits = candidate.replace(/\D/g, '')
      if (digits.length >= 4 && digits.length <= 8) return candidate
    }
    return ''
  }
  return find(current.subject) || find(current.text) || find(new DOMParser().parseFromString(current.html.join('\n'), 'text/html').body.textContent ?? '')
})

async function copyVerificationCode(): Promise<void> {
  if (!verificationCode.value) return
  actionError.value = ''
  try {
    await copyText(verificationCode.value)
  } catch {
    actionError.value = t('error.copy')
  }
}

function formatAddress(value: { name: string; address: string }): string {
  return value.name ? `${value.name} <${value.address}>` : value.address
}

function formatDate(value: string): string {
  return localDate(value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatBytes(value: number): string {
  if (value < 1024) return `${formatNumber(value)} B`
  if (value < 1024 * 1024) return `${formatNumber(Math.round(value / 1024))} KB`
  return `${formatNumber(Number((value / (1024 * 1024)).toFixed(1)), { maximumFractionDigits: 1 })} MB`
}

async function loadMessage(): Promise<void> {
  const version = ++requestVersion
  const token = props.token
  const id = props.id
  loading.value = true
  error.value = ''
  actionError.value = ''
  busy.value = ''
  message.value = null
  bodyMode.value = 'html'
  try {
    const value = await api.message(token, id)
    if (version !== requestVersion) return
    message.value = value
    if (!value.seen) {
      try {
        await api.setSeen(token, id, true)
        if (version === requestVersion) emit('seen', id)
      } catch (cause) {
        if (version === requestVersion) {
          actionError.value = cause instanceof ApiError ? cause.message : t('error.seen')
        }
      }
    }
  } catch (cause) {
    if (version !== requestVersion) return
    if (cause instanceof ApiError && cause.status === 404) {
      error.value = t('error.stale')
      emit('stale', id)
    } else {
      error.value = cause instanceof ApiError ? cause.message : t('error.message')
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function safeFilename(value: string, fallback = 'attachment', maxLength = 120): string {
  const basename = value
    .normalize('NFKC')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '') || ''
  if (!basename) return fallback
  if (basename.length <= maxLength) return basename

  const dot = basename.lastIndexOf('.')
  const extension = dot > 0 && /^\.[a-z0-9]{1,15}$/i.test(basename.slice(dot))
    ? basename.slice(dot)
    : ''
  const stem = basename.slice(0, maxLength - extension.length).replace(/[ .]+$/g, '') || fallback
  return `${stem}${extension}`
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function downloadAttachment(attachment: AttachmentResource): Promise<void> {
  const current = message.value
  if (!current) return
  const version = requestVersion
  const token = props.token
  const messageId = current.id
  const attachmentId = attachment.id
  const filename = safeFilename(attachment.filename)
  const action = `attachment:${attachmentId}`
  busy.value = action
  actionError.value = ''
  try {
    const blob = await api.attachment(token, messageId, attachmentId)
    if (version === requestVersion) saveBlob(blob, filename)
  } catch (cause) {
    if (version === requestVersion) {
      actionError.value = cause instanceof ApiError ? cause.message : t('error.download')
    }
  } finally {
    if (version === requestVersion && busy.value === action) busy.value = ''
  }
}

async function downloadSource(): Promise<void> {
  const current = message.value
  if (!current) return
  const version = requestVersion
  const token = props.token
  const messageId = current.id
  const filename = `${safeFilename(messageId, 'message', 116)}.eml`
  const action = 'source'
  busy.value = action
  actionError.value = ''
  try {
    const blob = await api.source(token, messageId)
    if (version === requestVersion) saveBlob(blob, filename)
  } catch (cause) {
    if (version === requestVersion) {
      actionError.value = cause instanceof ApiError ? cause.message : t('error.source')
    }
  } finally {
    if (version === requestVersion && busy.value === action) busy.value = ''
  }
}

async function deleteCurrent(): Promise<void> {
  const current = message.value
  if (!current || !window.confirm(t('reader.deleteConfirm'))) return
  const version = requestVersion
  const token = props.token
  const messageId = current.id
  const action = 'delete'
  busy.value = action
  actionError.value = ''
  try {
    await api.deleteMessage(token, messageId)
    if (version === requestVersion) emit('deleted', messageId)
  } catch (cause) {
    if (version === requestVersion) {
      if (cause instanceof ApiError && cause.status === 404) emit('deleted', messageId)
      else actionError.value = cause instanceof ApiError ? cause.message : t('error.delete')
    }
  } finally {
    if (version === requestVersion && busy.value === action) busy.value = ''
  }
}

watch(() => [props.token, props.id], () => void loadMessage(), { immediate: true })
// The reader replaces the message list in-place, so the click that opened it unmounts the
// previously focused row; move focus onto the back button so keyboard/AT users land somewhere
// meaningful instead of dropping to <body>.
onMounted(() => backButton.value?.focus())
onBeforeUnmount(() => { requestVersion += 1 })
</script>

<template>
  <article class="message-reader panel" aria-live="polite">
    <button
      ref="backButton"
      class="reader-back secondary-button"
      type="button"
      data-action="close"
      @click="emit('close')"
    >
      <AppIcon name="arrow-left" />
      {{ t('reader.back') }}
    </button>
    <div v-if="loading" class="reader-loading">
      <span class="skeleton skeleton-label" />
      <span class="skeleton skeleton-title" />
      <span class="skeleton skeleton-field" />
      <span class="sr-only">{{ t('reader.loading') }}</span>
    </div>

    <div v-else-if="error" class="reader-state">
      <h2>{{ t('reader.unavailable') }}</h2>
      <p>{{ error }}</p>
      <button class="secondary-button" type="button" @click="loadMessage">{{ t('address.retry') }}</button>
    </div>

    <template v-else-if="message">
      <header class="reader-header">
        <div>
          <p class="reader-sender">{{ formatAddress(message.from) }}</p>
          <h2>{{ message.subject || t('inbox.noSubject') }}</h2>
          <time :datetime="message.createdAt">{{ formatDate(message.createdAt) }}</time>
        </div>
        <div class="reader-actions">
          <button
            class="secondary-button compact-button"
            type="button"
            data-download-source
            :disabled="Boolean(busy)"
            @click="downloadSource"
          >
            <AppIcon name="file-text" />
            {{ busy === 'source' ? t('reader.saving') : t('reader.downloadSource') }}
          </button>
          <button
            class="danger-button compact-button"
            type="button"
            data-action="delete"
            :disabled="Boolean(busy)"
            @click="deleteCurrent"
          >
            <AppIcon name="trash-2" />
            {{ busy === 'delete' ? t('reader.deleting') : t('reader.delete') }}
          </button>
        </div>
      </header>

      <dl class="message-meta">
        <div><dt>{{ t('reader.to') }}</dt><dd>{{ message.to.map(formatAddress).join(', ') || t('reader.undisclosed') }}</dd></div>
        <div v-if="message.cc.length"><dt>{{ t('reader.cc') }}</dt><dd>{{ message.cc.map(formatAddress).join(', ') }}</dd></div>
        <div v-if="message.bcc.length"><dt>{{ t('reader.bcc') }}</dt><dd>{{ message.bcc.map(formatAddress).join(', ') }}</dd></div>
      </dl>

      <p v-if="actionError" class="reader-error" role="alert">{{ actionError }}</p>

      <div class="reader-content-grid">
        <aside v-if="verificationCode" class="verification-code" :aria-label="t('reader.code')">
          <strong>{{ t('reader.code') }}</strong>
          <code>{{ verificationCode }}</code>
          <button class="secondary-button compact-button" type="button" @click="copyVerificationCode">{{ t('address.copy') }}</button>
        </aside>

        <div class="reader-body">
          <div v-if="message.html.length && message.text" class="body-switcher" :aria-label="t('reader.format')">
            <button type="button" :aria-pressed="bodyMode === 'html'" @click="bodyMode = 'html'">{{ t('reader.html') }}</button>
            <button type="button" :aria-pressed="bodyMode === 'text'" @click="bodyMode = 'text'">{{ t('reader.text') }}</button>
          </div>

          <SandboxFrame
            v-if="message.html.length && bodyMode === 'html'"
            :html="message.html.join('\n')"
            mode="message"
            :title="t('reader.title', { subject: message.subject || t('inbox.noSubject') })"
          />
          <pre v-else class="plain-message">{{ message.text || t('reader.empty') }}</pre>
        </div>
      </div>

      <section v-if="message.attachments.length" class="attachments" aria-labelledby="attachments-title">
        <h3 id="attachments-title">{{ t('reader.attachments') }}</h3>
        <ul>
          <li v-for="attachment in message.attachments" :key="attachment.id">
            <span>
              <strong>{{ safeFilename(attachment.filename) }}</strong>
              <small>{{ formatBytes(attachment.size) }} · {{ attachment.contentType }}</small>
            </span>
            <button
              class="text-button"
              type="button"
              data-download-attachment
              :disabled="Boolean(busy)"
              :aria-label="t('reader.downloadFile', { filename: safeFilename(attachment.filename) })"
              @click="downloadAttachment(attachment)"
            >
              <AppIcon name="download" />
              {{ busy === `attachment:${attachment.id}` ? t('reader.saving') : t('reader.download') }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </article>
</template>
