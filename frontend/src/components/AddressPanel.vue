<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { authorizationFailed, openMailbox } from '../mailbox-access'
import { copyText } from '../clipboard'
import { randomDomain, randomLocalPart } from '../randomAddress'
import { loadSessions, removeSession } from '../session'
import type { AddressSession, DomainResource } from '../types'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const props = withDefaults(defineProps<{ accessToken?: string }>(), { accessToken: '' })
const emit = defineEmits<{ open: [session: AddressSession]; login: [address: string] }>()
const { t } = useI18n()
const toast = useToast()

const domains = ref<DomainResource[]>([])
const selectedDomain = ref('')
const localPart = ref('')
const quickEmail = ref('')
const loadingDomains = ref(true)
const submitting = ref(false)
const domainError = ref('')
const copied = ref(false)
const sessions = ref(loadSessions())

const address = computed(() =>
  localPart.value && selectedDomain.value
    ? `${localPart.value.trim().toLowerCase()}@${selectedDomain.value}`
    : '',
)

watch(address, () => { copied.value = false })

const message = (value: unknown) =>
  value instanceof ApiError ? value.message : t('error.unavailable')

let domainsVersion = 0
let submitVersion = 0
onBeforeUnmount(() => { ++domainsVersion; ++submitVersion })
function handleStorage(): void { sessions.value = loadSessions() }
onMounted(() => window.addEventListener('storage', handleStorage))
onBeforeUnmount(() => window.removeEventListener('storage', handleStorage))

async function loadDomains(): Promise<void> {
  const version = ++domainsVersion
  loadingDomains.value = true
  domainError.value = ''
  try {
    const response = await api.domains(1, props.accessToken || undefined)
    if (version !== domainsVersion) return
    domains.value = response['hydra:member'].filter((domain) => domain.isActive !== false)
    selectedDomain.value = domains.value[0]?.domain ?? ''
  } catch (cause) {
    if (version !== domainsVersion) return
    domainError.value = message(cause)
  } finally {
    if (version === domainsVersion) loadingDomains.value = false
  }
}

onMounted(loadDomains)
watch(() => props.accessToken, loadDomains)

async function submit(submittedAddress = address.value): Promise<void> {
  if (!submittedAddress || submitting.value) return
  const version = ++submitVersion
  submitting.value = true
  try {
    const session = await openMailbox(submittedAddress, props.accessToken || undefined)
    if (version === submitVersion) emit('open', session)
  } catch (cause) {
    if (version !== submitVersion) return
    if (authorizationFailed(cause)) emit('login', submittedAddress)
    else toast.error(message(cause))
  } finally {
    submitting.value = false
  }
}

async function randomize(): Promise<void> {
  if (!domains.value.length || submitting.value) return
  localPart.value = randomLocalPart()
  selectedDomain.value = randomDomain(domains.value.map((domain) => domain.domain))
  await submit()
}

async function copyAddress(): Promise<void> {
  if (!address.value) return
  try {
    await copyText(address.value)
    copied.value = true
    toast.success(t('address.copiedNotice'))
  } catch {
    toast.error(t('error.copy'))
  }
}

function forget(address: string): void {
  sessions.value = removeSession(address)
}
</script>

<template>
  <section class="home-hero" aria-labelledby="address-title">
    <p class="eyebrow">{{ t('address.eyebrow') }}</p>
    <h1 id="address-title">{{ t('address.title') }}</h1>
    <p class="lede">{{ t('address.lede') }}</p>
  </section>

  <section class="panel quick-access" aria-labelledby="quick-access-title">
    <div class="panel-heading">
      <h2 id="quick-access-title">{{ t('address.quickAccess') }}</h2>
    </div>
    <form @submit.prevent="submit(quickEmail.trim().toLowerCase())">
      <div class="field">
        <label for="quick-email">{{ t('address.email') }}</label>
        <input
          id="quick-email"
          v-model.trim="quickEmail"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="none"
          :spellcheck="false"
          required
        >
      </div>
      <button class="primary-button" type="submit" :disabled="submitting || !quickEmail.trim()">
        <AppIcon name="mail-open" />
        {{ submitting ? t('address.opening') : t('address.openMailbox') }}
      </button>
    </form>
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
    <button type="submit" disabled>{{ t('address.open') }}</button>
  </div>

  <div v-else class="panel address-form">
    <div class="panel-heading">
      <h2>{{ t('address.create') }}</h2>
      <button class="text-button" type="button" :disabled="loadingDomains || !domains.length || submitting" @click="randomize">
        <AppIcon name="shuffle" />
        {{ t('address.random') }}
      </button>
    </div>

    <form @submit.prevent="submit()">
      <div class="address-fields">
      <div class="field local-field">
        <label for="local-part">{{ t('address.name') }}</label>
        <input
          id="local-part"
          v-model="localPart"
          name="local-part"
          autocomplete="off"
          autocapitalize="none"
          minlength="1"
          maxlength="64"
          pattern="[A-Za-z0-9](?:[A-Za-z0-9._+\-]*[A-Za-z0-9])?"
          required
        >
      </div>
      <span class="at-sign" aria-hidden="true">@</span>
      <div class="field domain-field">
        <label for="domain">{{ t('address.domain') }}</label>
        <select id="domain" v-model="selectedDomain" name="domain" required>
          <option v-for="domain in domains" :key="domain.id" :value="domain.domain">
            {{ domain.domain }}
          </option>
        </select>
      </div>
    </div>

      <div class="address-preview">
      <span :class="{ 'address-preview-value': address }">{{ address || t('address.preview') }}</span>
      <button class="text-button" type="button" :disabled="!address" @click="copyAddress">
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? t('address.copied') : t('address.copy') }}
      </button>
    </div>

      <button class="primary-button" type="submit" :disabled="submitting || !address">
        <AppIcon name="inbox" />
        {{ submitting ? t('address.opening') : t('address.open') }}
      </button>
    </form>
  </div>

  <section class="panel saved-inboxes" aria-labelledby="remembered-title">
    <h2 id="remembered-title">{{ t('address.saved') }}</h2>
    <ul v-if="sessions.length">
      <li v-for="session in sessions" :key="session.address">
        <button class="saved-address" type="button" @click="submit(session.address)">
          {{ session.address }}
        </button>
        <button class="forget-button" type="button" :aria-label="t('address.forget', { address: session.address })" @click="forget(session.address)">
          <AppIcon name="trash-2" />
        </button>
      </li>
    </ul>
    <p v-else class="empty-copy">{{ t('address.savedHelp') }}</p>
  </section>

  <section class="how-it-works" aria-labelledby="how-it-works-heading">
    <h2 id="how-it-works-heading">{{ t('how.title') }}</h2>
    <div class="how-steps">
      <div class="how-step-card">
        <div class="how-step-icon"><AppIcon name="mail-plus" /></div>
        <h3>{{ t('how.step1Title') }}</h3>
        <p>{{ t('how.step1Desc') }}</p>
      </div>
      <div class="how-step-card">
        <div class="how-step-icon"><AppIcon name="badge-check" /></div>
        <h3>{{ t('how.step2Title') }}</h3>
        <p>{{ t('how.step2Desc') }}</p>
      </div>
      <div class="how-step-card">
        <div class="how-step-icon"><AppIcon name="clock-shield" /></div>
        <h3>{{ t('how.step3Title') }}</h3>
        <p>{{ t('how.step3Desc') }}</p>
      </div>
    </div>
    <div class="trust-notice" role="note">
      <AppIcon name="shield-check" />
      <span>{{ t('trust.privacyNotice') }}</span>
    </div>
  </section>
</template>
