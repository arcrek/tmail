<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import { extractVerificationCode } from '../verificationCode'
import AppIcon from './AppIcon.vue'
import { downloadCsv } from '../csv'

const props = withDefaults(defineProps<{ accessToken?: string; fetchSeconds: number }>(), { accessToken: '' })
const { t } = useI18n()
const toast = useToast()

type BulkCodeRow = {
  address: string
  status: 'loading' | 'ready' | 'error'
  subject?: string
  code?: string
  error?: string
}

const input = ref('')
const rows = ref<BulkCodeRow[]>([])
const refreshing = ref(false)
const tokenCache = new Map<string, string>()
let interval: number | undefined
let refreshVersion = 0
let submitVersion = 0
const parsedAddresses = computed(() => [...new Set(
  input.value.split(/[\s,]+/).map((address) => address.trim().toLowerCase()).filter(Boolean),
)])
const addresses = computed(() => parsedAddresses.value.slice(0, 10))
const partialCount = computed(() => parsedAddresses.value.length > 10 ? addresses.value.length : null)

const message = (value: unknown) =>
  value instanceof ApiError ? value.message : t('bulkCode.rowError')

async function fetchLatestMessage(row: BulkCodeRow, retryToken = true): Promise<void> {
  let token = tokenCache.get(row.address)
  const cached = Boolean(token)
  if (!token) {
    token = (await api.token(row.address, props.accessToken || undefined)).token
    tokenCache.set(row.address, token)
  }
  try {
    const latest = (await api.messages(token, 1))['hydra:member'][0]
    if (latest) {
      const current = await api.message(token, latest.id)
      row.subject = current.subject
      row.code = extractVerificationCode(current.subject, current.text, current.html)
    }
  } catch (cause) {
    if (cached && retryToken && cause instanceof ApiError && cause.status === 401) {
      tokenCache.delete(row.address)
      await fetchLatestMessage(row, false)
      return
    }
    throw cause
  }
}

// `silent` is used for background refreshes (poll ticks, manual Refresh): it skips the
// loading-skeleton flip and leaves the previously-shown subject/code in place until the new
// fetch actually resolves, instead of blanking an already-ready row on every cycle.
async function resolveRow(row: BulkCodeRow, options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    row.status = 'loading'
    row.subject = ''
    row.code = ''
  }
  try {
    await fetchLatestMessage(row)
    row.status = 'ready'
    row.error = ''
  } catch (cause) {
    row.status = 'error'
    row.error = message(cause)
  }
}

// Poll ticks (and resuming from a hidden tab) skip rows already in 'error' — an address that
// failed token issuance would otherwise re-issue /token every interval, sharing the same
// 10-req/60s budget as good rows. Manual Refresh is a deliberate one-off action, so it retries
// error rows too (retryErrors).
async function refresh(options: { retryErrors?: boolean } = {}): Promise<void> {
  if (refreshing.value || rows.value.length === 0) return
  const targets = options.retryErrors ? rows.value : rows.value.filter((row) => row.status !== 'error')
  if (targets.length === 0) return
  const version = ++refreshVersion
  refreshing.value = true
  try {
    await Promise.allSettled(targets.map((row) => resolveRow(row, { silent: true })))
  } finally {
    if (version === refreshVersion) refreshing.value = false
  }
}

function manualRefresh(): void {
  void refresh({ retryErrors: true })
}

function stopPolling(): void {
  if (interval !== undefined) window.clearInterval(interval)
  interval = undefined
}

function startPolling(): void {
  stopPolling()
  if (rows.value.length && !document.hidden) {
    interval = window.setInterval(() => void refresh(), Math.max(1, props.fetchSeconds) * 1000)
  }
}

function handleVisibility(): void {
  if (document.hidden) stopPolling()
  else {
    void refresh()
    startPolling()
  }
}

async function submit(): Promise<void> {
  stopPolling()
  const version = ++submitVersion
  ++refreshVersion
  const submittedRows = addresses.value.map((address) => ({ address, status: 'loading' as const }))
  rows.value = submittedRows
  refreshing.value = true
  try {
    await Promise.allSettled(submittedRows.map((row) => resolveRow(row)))
  } finally {
    if (version === submitVersion) refreshing.value = false
  }
  if (version === submitVersion) startPolling()
}

async function copy(value: string, notice: 'bulkCode.codeCopied' | 'bulkCode.emailCopied'): Promise<void> {
  try {
    await copyText(value)
    toast.success(t(notice))
  } catch {
    toast.error(t('error.copy'))
  }
}
function exportCsv(): void {
  if (!rows.value.length) return
  const header = 'address,subject,code,status,error\n'
  const csvRows = rows.value.map((r) => {
    const safe = (str: string | undefined) => `"${(str ?? '').replace(/"/g, '""')}"`
    return `${safe(r.address)},${safe(r.subject)},${safe(r.code)},${safe(r.status)},${safe(r.error)}`
  }).join('\n')
  downloadCsv('tmail-codes.csv', header + csvRows + '\n')
}

onMounted(() => document.addEventListener('visibilitychange', handleVisibility))
watch(() => props.fetchSeconds, startPolling)
onBeforeUnmount(() => {
  ++refreshVersion
  ++submitVersion
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibility)
})
</script>

<template>
  <section class="home-hero" aria-labelledby="bulk-code-title">
    <h1 id="bulk-code-title">{{ t('bulkCode.title') }}</h1>
    <p class="lede">{{ t('bulkCode.lede') }}</p>
  </section>

  <section class="panel saved-inboxes" aria-labelledby="bulk-code-title">
    <form class="bulk-controls" @submit.prevent="submit">
      <div class="field">
        <label for="bulk-code-addresses">{{ t('bulkCode.addresses') }}</label>
        <textarea id="bulk-code-addresses" v-model="input" rows="5" :placeholder="t('bulkCode.placeholder')" />
      </div>
      <button class="primary-button" type="submit" :disabled="addresses.length === 0">{{ t('bulkCode.submit') }}</button>
      <button v-if="rows.length" class="secondary-button" type="button" data-action="refresh" :disabled="refreshing" @click="manualRefresh">
        <AppIcon name="refresh-cw" />
        {{ refreshing ? t('bulkCode.refreshing') : t('bulkCode.refresh') }}
      </button>
      <button v-if="rows.length" class="secondary-button bulk-export-csv" type="button" @click="exportCsv">
        <AppIcon name="download" />
        {{ t('bulkCode.exportCsv') }}
      </button>
    </form>
    <p v-if="partialCount !== null" class="bulk-partial" role="status">{{ t('bulkCode.partial', { count: partialCount }) }}</p>

    <div v-if="rows.length" class="bulk-results" aria-live="polite">
      <table>
        <thead><tr><th scope="col">{{ t('bulkCode.email') }}</th><th scope="col">{{ t('bulkCode.subject') }}</th><th scope="col">{{ t('bulkCode.code') }}</th><th scope="col"><span class="sr-only">{{ t('bulkCode.actions') }}</span></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.address">
            <td><span class="saved-address">{{ row.address }}</span><button class="row-icon-button" type="button" :aria-label="t('bulkCode.copyEmailFor', { address: row.address })" @click="copy(row.address, 'bulkCode.emailCopied')"><AppIcon name="copy" /></button></td>
            <td v-if="row.status === 'loading'" aria-live="polite"><span class="skeleton skeleton-label" /><span class="sr-only">{{ t('bulkCode.loading') }}</span></td>
            <td v-else-if="row.status === 'error'"><span role="alert">{{ row.error }}</span></td>
            <td v-else>{{ row.subject || t('bulkCode.noSubject') }}</td>
            <td v-if="row.status === 'loading'"><span class="skeleton skeleton-label" /></td>
            <td v-else>{{ row.code || t('bulkCode.noCode') }}</td>
            <td><span class="row-actions"><button class="text-button" type="button" :disabled="!row.code" :aria-label="t('bulkCode.copyCodeFor', { address: row.address })" @click="copy(row.code ?? '', 'bulkCode.codeCopied')">{{ t('bulkCode.copyCode') }}</button><button v-if="row.status === 'error'" class="text-button" type="button" @click="resolveRow(row)">{{ t('address.retry') }}</button></span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-copy">{{ t('bulkCode.empty') }}</p>
  </section>
</template>
