<script setup lang="ts">
import { computed, ref } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import { extractVerificationCode } from '../verificationCode'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ accessToken?: string }>(), { accessToken: '' })
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
const tokenCache = new Map<string, string>()
const parsedAddresses = computed(() => [...new Set(
  input.value.split(/[\s,]+/).map((address) => address.trim().toLowerCase()).filter(Boolean),
)])
const addresses = computed(() => parsedAddresses.value.slice(0, 10))
const partialCount = computed(() => parsedAddresses.value.length > 10 ? addresses.value.length : null)

const message = (value: unknown) =>
  value instanceof ApiError ? value.message : t('error.unavailable')

async function resolveRow(row: BulkCodeRow): Promise<void> {
  row.status = 'loading'
  row.error = ''
  row.subject = ''
  row.code = ''
  try {
    let token = tokenCache.get(row.address)
    if (!token) {
      token = (await api.token(row.address, props.accessToken || undefined)).token
      tokenCache.set(row.address, token)
    }
    row.token = token
    const latest = (await api.messages(token, 1))['hydra:member'][0]
    if (latest) {
      const current = await api.message(token, latest.id)
      row.subject = current.subject
      row.code = extractVerificationCode(current.subject, current.text, current.html)
    }
    row.status = 'ready'
  } catch (cause) {
    row.status = 'error'
    row.error = message(cause)
  }
}

async function submit(): Promise<void> {
  rows.value = addresses.value.map((address) => ({ address, status: 'loading' }))
  await Promise.allSettled(rows.value.map(resolveRow))
}

async function copy(value: string, notice: 'bulkCode.codeCopied' | 'bulkCode.emailCopied'): Promise<void> {
  try {
    await copyText(value)
    toast.success(t(notice))
  } catch {
    toast.error(t('error.copy'))
  }
}
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
