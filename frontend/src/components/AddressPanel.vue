<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const mode = ref<'new' | 'existing'>('new')

/** Radio-group keyboard pattern: arrow keys move selection and focus between the two modes. */
function onModeKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  mode.value = mode.value === 'new' ? 'existing' : 'new'
  const group = (event.currentTarget as HTMLElement).parentElement
  void nextTick(() => group?.querySelector<HTMLElement>(`[data-mode="${mode.value}"]`)?.focus())
}
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
    <h1 id="address-title">{{ t('address.title') }}</h1>
    <p class="lede">{{ t('address.lede') }}</p>

    <div class="mode-switch" role="radiogroup" :aria-label="t('address.mode')">
      <button
        type="button"
        role="radio"
        data-mode="new"
        :aria-checked="mode === 'new'"
        :tabindex="mode === 'new' ? 0 : -1"
        @click="mode = 'new'"
        @keydown="onModeKeydown"
      >
        <AppIcon v-if="mode === 'new'" name="check" />
        {{ t('address.modeNew') }}
      </button>
      <button
        type="button"
        role="radio"
        data-mode="existing"
        :aria-checked="mode === 'existing'"
        :tabindex="mode === 'existing' ? 0 : -1"
        @click="mode = 'existing'"
        @keydown="onModeKeydown"
      >
        <AppIcon v-if="mode === 'existing'" name="check" />
        {{ t('address.modeExisting') }}
      </button>
    </div>

    <div v-show="mode === 'new'" class="composer-pane">
      <div v-if="loadingDomains" class="composer loading-panel" aria-live="polite">
        <span class="skeleton skeleton-field" />
        <span class="sr-only">{{ t('address.loading') }}</span>
      </div>

      <div v-else-if="domainError" class="empty-state" role="alert">
        <h2>{{ t('address.failed') }}</h2>
        <p>{{ domainError }}</p>
        <button class="secondary-button" type="button" @click="loadDomains">{{ t('address.retry') }}</button>
      </div>

      <div v-else-if="domains.length === 0" class="empty-state">
        <h2>{{ t('address.none') }}</h2>
        <p>{{ t('address.noneHelp') }}</p>
        <button class="primary-button" type="submit" disabled>{{ t('address.open') }}</button>
      </div>

      <div v-else class="address-form">
        <h2 class="sr-only">{{ t('address.create') }}</h2>
        <form class="composer" @submit.prevent="submit()">
          <div class="composer-field">
            <label class="sr-only" for="local-part">{{ t('address.name') }}</label>
            <input
              id="local-part"
              v-model="localPart"
              name="local-part"
              autocomplete="off"
              autocapitalize="none"
              :spellcheck="false"
              :placeholder="t('address.namePlaceholder')"
              minlength="1"
              maxlength="64"
              pattern="[A-Za-z0-9](?:[A-Za-z0-9._+\-]*[A-Za-z0-9])?"
              required
            >
            <span class="at-sign" aria-hidden="true">@</span>
            <span class="domain-chip">
              <label class="sr-only" for="domain">{{ t('address.domain') }}</label>
              <select id="domain" v-model="selectedDomain" name="domain" required>
                <option v-for="domain in domains" :key="domain.id" :value="domain.domain">
                  {{ domain.domain }}
                </option>
              </select>
              <AppIcon name="chevron-down" />
            </span>
          </div>
          <div class="composer-actions">
            <button
              class="icon-button random-button"
              type="button"
              :aria-label="t('address.random')"
              :title="t('address.random')"
              :disabled="loadingDomains || !domains.length || submitting"
              @click="randomize"
            >
              <AppIcon name="shuffle" />
            </button>
            <button class="primary-button composer-submit" type="submit" :disabled="submitting || !address">
              {{ submitting ? t('address.opening') : t('address.open') }}
              <AppIcon name="arrow-right" />
            </button>
          </div>
        </form>
        <div v-if="address" class="address-preview">
          <span class="address-preview-value">{{ address }}</span>
          <button class="text-button" type="button" @click="copyAddress">
            <AppIcon :name="copied ? 'check' : 'copy'" />
            {{ copied ? t('address.copied') : t('address.copy') }}
          </button>
        </div>
      </div>
    </div>

    <section v-show="mode === 'existing'" class="quick-access" aria-labelledby="quick-access-title">
      <h2 id="quick-access-title" class="sr-only">{{ t('address.quickAccess') }}</h2>
      <form class="composer" @submit.prevent="submit(quickEmail.trim().toLowerCase())">
        <div class="composer-field">
          <label class="sr-only" for="quick-email">{{ t('address.email') }}</label>
          <input
            id="quick-email"
            v-model.trim="quickEmail"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="none"
            :spellcheck="false"
            :placeholder="t('address.emailPlaceholder')"
            required
          >
        </div>
        <div class="composer-actions">
          <button class="primary-button composer-submit" type="submit" :disabled="submitting || !quickEmail.trim()">
            {{ submitting ? t('address.opening') : t('address.openMailbox') }}
            <AppIcon name="arrow-right" />
          </button>
        </div>
      </form>
    </section>

    <section class="saved-inboxes" aria-labelledby="remembered-title">
      <h2 id="remembered-title">{{ t('address.saved') }}</h2>
      <ul v-if="sessions.length">
        <li v-for="session in sessions" :key="session.address" class="saved-chip">
          <button class="saved-address" type="button" @click="submit(session.address)">
            <AppIcon v-if="session.protected" name="lock" />
            {{ session.address }}
          </button>
          <button class="forget-button" type="button" :aria-label="t('address.forget', { address: session.address })" @click="forget(session.address)">
            <AppIcon name="x" />
          </button>
        </li>
      </ul>
      <p v-else class="empty-copy">{{ t('address.savedHelp') }}</p>
    </section>
  </section>

  <section class="how-it-works" :aria-label="t('how.title')">
    <div class="how-step-card">
      <div class="how-step-icon"><AppIcon name="mail-plus" /></div>
      <h3>{{ t('how.step1Title') }}</h3>
      <p>{{ t('how.step1Desc') }}</p>
    </div>
    <div class="how-step-card how-step-code">
      <div class="how-step-icon"><AppIcon name="badge-check" /></div>
      <h3>{{ t('how.step2Title') }}</h3>
      <p>{{ t('how.step2Desc') }}</p>
    </div>
    <div class="how-step-card how-step-privacy">
      <div class="how-step-icon"><AppIcon name="shield-check" /></div>
      <h3>{{ t('how.step3Title') }}</h3>
      <p>{{ t('how.step3Desc') }}</p>
    </div>
  </section>
</template>
