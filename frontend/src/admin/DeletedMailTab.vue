<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import SandboxFrame from '../components/SandboxFrame.vue'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import type { DeletedMessageResource, DeletedMessageSummary } from '../types'
import { extractVerificationCode } from '../verificationCode'

const props = defineProps<{ csrf: string }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { t, formatDate: localDate, formatNumber } = useI18n()
const toast = useToast()

const items = ref<DeletedMessageSummary[]>([])
const totalItems = ref(0)
const page = ref(1)
const limit = ref(20)
const searchInput = ref('')
const activeQuery = ref('')
const loading = ref(true)
const error = ref('')

const selectedId = ref<string | null>(null)
const detail = ref<DeletedMessageResource | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const actionError = ref('')
const bodyMode = ref<'html' | 'text'>('html')
const actionBusy = ref<'' | 'source' | 'delete'>('')
const listHeading = ref<HTMLElement | null>(null)
const backButton = ref<HTMLButtonElement | null>(null)

let listVersion = 0
let detailVersion = 0

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / limit.value)))
const canPrevious = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)

const verificationCode = computed(() => {
  const current = detail.value
  if (!current) return ''
  return extractVerificationCode(current.subject, current.text, current.html)
})

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

function safeFilename(value: string, fallback = 'message', maxLength = 116): string {
  const basename = value
    .normalize('NFKC')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '') || ''
  if (!basename) return fallback
  return basename.slice(0, maxLength)
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

async function loadList(): Promise<void> {
  const version = ++listVersion
  loading.value = true
  error.value = ''
  try {
    const response = await api.admin.deletedMessages.list(page.value, activeQuery.value, limit.value)
    if (version !== listVersion) return
    items.value = response.member
    totalItems.value = response.totalItems
  } catch (cause) {
    if (version !== listVersion) return
    error.value = cause instanceof ApiError ? cause.message : t('error.deletedLoad')
  } finally {
    if (version === listVersion) loading.value = false
  }
}

async function submitSearch(): Promise<void> {
  selectedId.value = null
  page.value = 1
  activeQuery.value = searchInput.value.trim()
  await loadList()
}

async function clearSearch(): Promise<void> {
  searchInput.value = ''
  activeQuery.value = ''
  page.value = 1
  await loadList()
}

async function changePage(nextPage: number): Promise<void> {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  await loadList()
}

async function openDetail(id: string): Promise<void> {
  selectedId.value = id
  const version = ++detailVersion
  detailLoading.value = true
  detailError.value = ''
  actionError.value = ''
  actionBusy.value = ''
  detail.value = null
  bodyMode.value = 'html'
  void nextTick(() => backButton.value?.focus())
  try {
    const loaded = await api.admin.deletedMessages.get(id)
    if (version !== detailVersion) return
    detail.value = loaded
  } catch (cause) {
    if (version !== detailVersion) return
    detailError.value = cause instanceof ApiError ? cause.message : t('error.deletedMessage')
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}

function closeDetail(): void {
  ++detailVersion
  selectedId.value = null
  detail.value = null
  detailError.value = ''
  actionError.value = ''
  actionBusy.value = ''
  void nextTick(() => listHeading.value?.focus())
}

async function copyVerificationCode(): Promise<void> {
  if (!verificationCode.value) return
  actionError.value = ''
  try {
    await copyText(verificationCode.value)
    toast.success(t('inbox.codeCopied'))
  } catch {
    actionError.value = t('error.copy')
  }
}

async function downloadSource(): Promise<void> {
  const current = detail.value
  if (!current || !current.hasSource) return
  const version = detailVersion
  const id = current.id
  actionBusy.value = 'source'
  actionError.value = ''
  try {
    const blob = await api.admin.deletedMessages.source(id)
    if (version === detailVersion) saveBlob(blob, `${safeFilename(id)}.eml`)
  } catch (cause) {
    if (version === detailVersion) {
      actionError.value = cause instanceof ApiError ? cause.message : t('error.source')
    }
  } finally {
    if (version === detailVersion && actionBusy.value === 'source') actionBusy.value = ''
  }
}

async function deletePermanently(): Promise<void> {
  const current = detail.value
  if (!current || !window.confirm(t('deleted.deleteConfirm'))) return
  const version = detailVersion
  const id = current.id
  actionBusy.value = 'delete'
  actionError.value = ''
  emit('busy', true)
  try {
    await api.admin.deletedMessages.remove(id, props.csrf)
    if (version !== detailVersion) return
    toast.success(t('deleted.deletedNotice'))
    closeDetail()
    if (items.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    await loadList()
  } catch (cause) {
    if (version === detailVersion) {
      actionError.value = cause instanceof ApiError ? cause.message : t('error.deletedDelete')
    }
  } finally {
    if (version === detailVersion && actionBusy.value === 'delete') actionBusy.value = ''
    emit('busy', false)
  }
}

watch(selectedId, (val) => {
  if (val === null) void nextTick(() => listHeading.value?.focus())
})

onMounted(loadList)
onBeforeUnmount(() => {
  ++listVersion
  ++detailVersion
})
</script>

<template>
  <section class="admin-section" aria-labelledby="deleted-mail-title">
    <p class="eyebrow">{{ t('deleted.eyebrow') }}</p>
    <h1 id="deleted-mail-title">{{ t('deleted.title') }}</h1>
    <p class="admin-note margin-bottom-md">{{ t('deleted.note') }}</p>

    <article v-if="selectedId" class="message-reader panel" aria-live="polite">
      <button
        ref="backButton"
        class="reader-back secondary-button"
        type="button"
        data-action="close-deleted"
        :disabled="actionBusy === 'delete'"
        @click="closeDetail"
      >
        <AppIcon name="arrow-left" />
        {{ t('deleted.back') }}
      </button>

      <div v-if="detailLoading" class="reader-loading">
        <span class="skeleton skeleton-label" />
        <span class="skeleton skeleton-title" />
        <span class="skeleton skeleton-field" />
        <span class="sr-only">{{ t('reader.loading') }}</span>
      </div>

      <div v-else-if="detailError" class="reader-state">
        <h2>{{ t('reader.unavailable') }}</h2>
        <p>{{ detailError }}</p>
        <button class="secondary-button" type="button" @click="openDetail(selectedId)">
          {{ t('address.retry') }}
        </button>
      </div>

      <template v-else-if="detail">
        <header class="reader-header">
          <div>
            <p class="reader-sender">{{ formatAddress(detail.from) }}</p>
            <h2>{{ detail.subject || t('inbox.noSubject') }}</h2>
            <time :datetime="detail.receivedAt">{{ formatDate(detail.receivedAt) }}</time>
          </div>
          <div class="reader-actions">
            <button
              v-if="detail.hasSource"
              class="secondary-button compact-button"
              type="button"
              data-download-deleted-source
              :disabled="Boolean(actionBusy)"
              @click="downloadSource"
            >
              <AppIcon name="file-down" />
              {{ actionBusy === 'source' ? t('reader.saving') : t('reader.downloadSource') }}
            </button>
            <span v-else class="status-pill pill-neutral">{{ t('deleted.sourceUnavailable') }}</span>
            <button
              class="danger-button compact-button"
              type="button"
              data-action="delete-permanent"
              :disabled="Boolean(actionBusy)"
              @click="deletePermanently"
            >
              <AppIcon name="trash-2" />
              {{ actionBusy === 'delete' ? t('deleted.deleting') : t('deleted.delete') }}
            </button>
          </div>
        </header>

        <dl class="message-meta">
          <div><dt>{{ t('deleted.mailbox') }}</dt><dd class="font-mono">{{ detail.mailboxAddress }}</dd></div>
          <div><dt>{{ t('reader.to') }}</dt><dd>{{ detail.to.map(formatAddress).join(', ') || t('reader.undisclosed') }}</dd></div>
          <div v-if="detail.cc.length"><dt>{{ t('reader.cc') }}</dt><dd>{{ detail.cc.map(formatAddress).join(', ') }}</dd></div>
          <div v-if="detail.bcc.length"><dt>{{ t('reader.bcc') }}</dt><dd>{{ detail.bcc.map(formatAddress).join(', ') }}</dd></div>
          <div><dt>{{ t('deleted.deletedAt') }}</dt><dd>{{ formatDate(detail.deletedAt) }}</dd></div>
          <div><dt>{{ t('deleted.expiresAt') }}</dt><dd>{{ formatDate(detail.expiresAt) }}</dd></div>
        </dl>

        <p v-if="actionError" class="reader-error" role="alert">{{ actionError }}</p>

        <div class="reader-content-grid">
          <aside v-if="verificationCode" class="verification-code" :aria-label="t('reader.code')">
            <div class="verification-code-lead">
              <span class="verification-code-badge">
                <AppIcon name="badge-check" />
                {{ t('reader.code') }}
              </span>
              <code>{{ verificationCode }}</code>
            </div>
            <button
              class="primary-button compact-button"
              type="button"
              :aria-label="t('inbox.copyCodeAction')"
              @click="copyVerificationCode"
            >
              <AppIcon name="copy" />
              {{ t('address.copy') }}
            </button>
          </aside>

          <div class="reader-body">
            <div v-if="detail.html.length && detail.text" class="body-switcher" :aria-label="t('reader.format')">
              <button type="button" :aria-pressed="bodyMode === 'html'" @click="bodyMode = 'html'">{{ t('reader.html') }}</button>
              <button type="button" :aria-pressed="bodyMode === 'text'" @click="bodyMode = 'text'">{{ t('reader.text') }}</button>
            </div>

            <SandboxFrame
              v-if="detail.html.length && bodyMode === 'html'"
              :html="detail.html.join('\n')"
              mode="message"
              :title="t('reader.title', { subject: detail.subject || t('inbox.noSubject') })"
            />
            <pre v-else class="plain-message">{{ detail.text || t('reader.empty') }}</pre>
          </div>
        </div>

        <section v-if="detail.attachments.length" class="attachments" aria-labelledby="deleted-attachments-title">
          <h3 id="deleted-attachments-title">{{ t('reader.attachments') }}</h3>
          <ul>
            <li v-for="attachment in detail.attachments" :key="attachment.id">
              <span>
                <strong>{{ safeFilename(attachment.filename, 'attachment', 120) }}</strong>
                <small>{{ formatBytes(attachment.size) }} · {{ attachment.contentType }}</small>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </article>

    <div v-else class="panel message-list">
      <div class="list-heading">
        <div>
          <h2 ref="listHeading" tabindex="-1">{{ t('deleted.title') }}</h2>
          <span>{{ t('inbox.total', { count: totalItems }) }}</span>
        </div>
        <form class="inline-add-row" @submit.prevent="submitSearch">
          <div class="field" style="flex: 1; min-width: 14rem;">
            <label for="deleted-mail-search" class="sr-only">{{ t('deleted.searchLabel') }}</label>
            <input
              id="deleted-mail-search"
              v-model="searchInput"
              type="search"
              :placeholder="t('deleted.searchPlaceholder')"
            >
          </div>
          <button class="secondary-button" type="submit" :disabled="loading">{{ t('deleted.search') }}</button>
          <button
            v-if="activeQuery"
            class="text-button"
            type="button"
            :disabled="loading"
            @click="clearSearch"
          >
            {{ t('deleted.clear') }}
          </button>
        </form>
      </div>

      <div v-if="loading" class="message-list-state" aria-live="polite">
        <span class="skeleton skeleton-field" />
        <span class="skeleton skeleton-field" />
        <span class="skeleton skeleton-field" />
        <span class="sr-only">{{ t('deleted.loading') }}</span>
      </div>

      <div v-else-if="error" class="message-list-state" role="alert">
        <h3>{{ t('error.deletedLoad') }}</h3>
        <p>{{ error }}</p>
        <button class="secondary-button compact-button" type="button" @click="loadList">
          {{ t('address.retry') }}
        </button>
      </div>

      <div v-else-if="!items.length && activeQuery" class="message-list-state">
        <h3>{{ t('deleted.noResults') }}</h3>
      </div>

      <div v-else-if="!items.length" class="message-list-state">
        <h3>{{ t('deleted.empty') }}</h3>
      </div>

      <template v-else>
        <ul class="message-rows">
          <li v-for="item in items" :key="item.id" class="message-row-item">
            <button
              class="message-row"
              type="button"
              :data-deleted-id="item.id"
              @click="openDetail(item.id)"
            >
              <span class="message-row-top">
                <strong>{{ item.mailboxAddress }} ← {{ item.from.name || item.from.address }}</strong>
                <time :datetime="item.deletedAt">{{ formatDate(item.deletedAt) }}</time>
              </span>
              <span class="message-subject">{{ item.subject || t('inbox.noSubject') }}</span>
              <span class="message-intro">{{ item.intro || t('inbox.noPreview') }}</span>
              <span v-if="item.hasAttachments" class="attachment-flag">
                <AppIcon name="paperclip" />
                <span class="sr-only">{{ t('inbox.attachment') }}</span>
              </span>
            </button>
          </li>
        </ul>

        <nav v-if="canPrevious || canNext" class="pagination" :aria-label="t('inbox.pages')">
          <button type="button" :disabled="!canPrevious" @click="changePage(page - 1)">
            {{ t('inbox.previous') }}
          </button>
          <span>{{ t('inbox.page', { page }) }}</span>
          <button type="button" :disabled="!canNext" @click="changePage(page + 1)">
            {{ t('inbox.next') }}
          </button>
        </nav>
      </template>
    </div>
  </section>
</template>
