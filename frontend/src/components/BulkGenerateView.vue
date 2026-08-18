<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { randomAddressBatch } from '../randomAddress'
import { useToast } from '../toast'
import type { DomainResource } from '../types'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ accessToken?: string }>(), { accessToken: '' })
const { t } = useI18n()
const toast = useToast()

const domains = ref<DomainResource[]>([])
const loadingDomains = ref(true)
const domainError = ref('')
const count = ref(10)
const addresses = ref<string[]>([])
const copiedAddress = ref('')
const partialCount = ref<number | null>(null)

const message = (value: unknown) =>
  value instanceof ApiError ? value.message : t('error.unavailable')

let domainsVersion = 0

async function loadDomains(): Promise<void> {
  const version = ++domainsVersion
  loadingDomains.value = true
  domainError.value = ''
  try {
    const response = await api.domains(1, props.accessToken || undefined)
    if (version !== domainsVersion) return
    domains.value = response['hydra:member'].filter((domain) => domain.isActive !== false)
  } catch (cause) {
    if (version !== domainsVersion) return
    domainError.value = message(cause)
  } finally {
    if (version === domainsVersion) loadingDomains.value = false
  }
}

onMounted(loadDomains)
watch(() => props.accessToken, () => {
  addresses.value = []
  copiedAddress.value = ''
  partialCount.value = null
  void loadDomains()
})

function generate(): void {
  const requested = Math.min(10, Math.max(1, Number(count.value) || 1))
  count.value = requested
  addresses.value = randomAddressBatch(domains.value.map((domain) => domain.domain), requested)
  copiedAddress.value = ''
  partialCount.value = addresses.value.length < requested ? addresses.value.length : null
}

function openInNewTab(address: string): void {
  window.open(`/${encodeURIComponent(address)}`, '_blank', 'noopener')
}

async function copy(address: string): Promise<void> {
  try {
    await copyText(address)
    copiedAddress.value = address
    toast.success(t('bulk.copiedNotice'))
  } catch {
    toast.error(t('error.copy'))
  }
}

async function copyAll(): Promise<void> {
  try {
    await copyText(addresses.value.join('\n'))
    toast.success(t('bulk.copiedAllNotice'))
  } catch {
    toast.error(t('error.copy'))
  }
}
</script>

<template>
  <section class="home-hero" aria-labelledby="bulk-title">
    <h1 id="bulk-title">{{ t('bulk.title') }}</h1>
    <p class="lede">{{ t('bulk.lede') }}</p>
  </section>

  <div v-if="loadingDomains" class="panel loading-panel" aria-live="polite">
    <span class="skeleton skeleton-label" />
    <span class="skeleton skeleton-field" />
    <span class="skeleton skeleton-button" />
    <span class="sr-only">{{ t('address.loading') }}</span>
  </div>

  <div v-else-if="domainError" class="panel empty-state" role="alert">
    <h2>{{ t('address.failed') }}</h2>
    <p>{{ domainError }}</p>
    <button type="button" @click="loadDomains">{{ t('address.retry') }}</button>
  </div>

  <div v-else-if="domains.length === 0" class="panel empty-state">
    <h2>{{ t('address.none') }}</h2>
    <p>{{ t('address.noneHelp') }}</p>
    <button type="button" disabled>{{ t('bulk.generate') }}</button>
  </div>

  <section v-else class="panel saved-inboxes" aria-labelledby="bulk-controls-title">
    <div class="panel-heading">
      <h2 id="bulk-controls-title">{{ t('bulk.title') }}</h2>
    </div>

    <form class="bulk-controls" @submit.prevent="generate">
      <div class="field">
        <label for="bulk-count">{{ t('bulk.countLabel') }}</label>
        <input id="bulk-count" v-model.number="count" type="number" min="1" max="10">
      </div>
      <button class="primary-button" type="submit">{{ t('bulk.generate') }}</button>
    </form>

    <div class="bulk-results" aria-live="polite">
      <p v-if="partialCount !== null" class="bulk-partial" role="status">
        {{ t('bulk.partial', { count: partialCount }) }}
      </p>
      <p v-if="addresses.length === 0" class="empty-copy">{{ t('bulk.empty') }}</p>
      <template v-else>
        <button class="secondary-button compact-button bulk-copy-all" type="button" @click="copyAll">
          <AppIcon name="copy" />
          {{ t('bulk.copyAll') }}
        </button>
        <ul class="bulk-list">
          <li v-for="address in addresses" :key="address">
            <span class="saved-address">{{ address }}</span>
            <button class="text-button" type="button" @click="copy(address)">
              <AppIcon :name="copiedAddress === address ? 'check' : 'copy'" />
              {{ copiedAddress === address ? t('bulk.copied') : t('bulk.copy') }}
            </button>
            <button class="bulk-open-button" type="button" :aria-label="t('bulk.open')" @click="openInNewTab(address)">
              <AppIcon name="external-link" />
            </button>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
