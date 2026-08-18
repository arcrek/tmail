<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import { extractVerificationCode } from '../verificationCode'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ accessToken?: string; fetchSeconds: number }>(), { accessToken: '' })
const { t } = useI18n()
const toast = useToast()

type BulkCodeRow = {
  address: string
  token?: string
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
  value instanceof ApiError ? value.message : t('error.unavailable')

async function fetchLatestMessage(row: BulkCodeRow, retryToken = true): Promise<void> {
  let token = tokenCache.get(row.address)
  const cached = Boolean(token)
  if (!token) {
    token = (await api.token(row.address, props.accessToken || undefined)).token
    tokenCache.set(row.address, token)
  }
  row.token = token
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

async function resolveRow(row: BulkCodeRow): Promise<void> {
  row.status = 'loading'
  row.error = ''
  row.subject = ''
  row.code = ''
  try {
    await fetchLatestMessage(row)
    row.status = 'ready'
  } catch (cause) {
    row.status = 'error'
    row.error = message(cause)
  }
}

async function refresh(): Promise<void> {
  if (refreshing.value || rows.value.length === 0) return
  const version = ++refreshVersion
  const currentRows = rows.value
  refreshing.value = true
  try {
    await Promise.allSettled(currentRows.map(resolveRow))
  } finally {
    if (version === refreshVersion) refreshing.value = false
  }
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
    await Promise.allSettled(submittedRows.map(resolveRow))
  } finally {
    if (version === submitVersion) refreshing.value = false
  }
  if (version === submitVersion && rows.value === submittedRows) startPolling()
}

async function copy(value: string, notice: 'bulkCode.codeCopied' | 'bulkCode.emailCopied'): Promise<void> {
  try {
    await copyText(value)
    toast.success(t(notice))
  } catch {
    toast.error(t('error.copy'))
  }
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

  <section class="panel saved-inboxes" aria-labelledby="bulk-code-controls-title">
    <div class="panel-heading"><h2 id="bulk-code-controls-title">{{ t('bulkCode.title') }}</h2></div>
    <form class="bulk-controls" @submit.prevent="submit">
      <div class="field">
        <label for="bulk-code-addresses">{{ t('bulkCode.addresses') }}</label>
        <textarea id="bulk-code-addresses" v-model="input" rows="5" :placeholder="t('bulkCode.placeholder')" />
      </div>
      <button class="primary-button" type="submit" :disabled="addresses.length === 0">{{ t('bulkCode.submit') }}</button>
      <button v-if="rows.length" class="secondary-button" type="button" data-action="refresh" :disabled="refreshing" @click="refresh">
        <AppIcon name="refresh-cw" />
        {{ refreshing ? t('bulkCode.refreshing') : t('bulkCode.refresh') }}
      </button>
    </form>
    <p v-if="partialCount !== null" class="bulk-partial" role="status">{{ t('bulkCode.partial', { count: partialCount }) }}</p>

    <div v-if="rows.length" class="bulk-results" aria-live="polite">
      <table>
        <thead><tr><th scope="col">{{ t('bulkCode.email') }}</th><th scope="col">{{ t('bulkCode.subject') }}</th><th scope="col">{{ t('bulkCode.code') }}</th><th scope="col"><span class="sr-only">{{ t('bulkCode.actions') }}</span></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.address">
            <td><span class="saved-address">{{ row.address }}</span><button class="bulk-open-button" type="button" :aria-label="t('bulkCode.copyEmail')" @click="copy(row.address, 'bulkCode.emailCopied')"><AppIcon name="copy" /></button></td>
            <td v-if="row.status === 'loading'"><span class="skeleton skeleton-label" /></td>
            <td v-else>{{ row.status === 'error' ? row.error : row.subject || '—' }}</td>
            <td v-if="row.status === 'loading'"><span class="skeleton skeleton-label" /></td>
            <td v-else>{{ row.code || '—' }}</td>
            <td><button class="text-button" type="button" :disabled="!row.code" @click="copy(row.code ?? '', 'bulkCode.codeCopied')">{{ t('bulkCode.copyCode') }}</button><button v-if="row.status === 'error'" class="text-button" type="button" @click="resolveRow(row)">{{ t('address.retry') }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-copy">{{ t('bulkCode.empty') }}</p>
  </section>
</template>
