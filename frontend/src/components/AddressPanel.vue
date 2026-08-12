<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { loadSessions, removeSession } from '../session'
import type { AddressSession, DomainResource } from '../types'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'

withDefaults(defineProps<{ initialError?: string }>(), { initialError: '' })
const emit = defineEmits<{ open: [session: AddressSession] }>()
const { t } = useI18n()

const domains = ref<DomainResource[]>([])
const selectedDomain = ref('')
const localPart = ref('')
const loadingDomains = ref(true)
const submitting = ref(false)
const error = ref('')
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

async function loadDomains(): Promise<void> {
  loadingDomains.value = true
  domainError.value = ''
  try {
    const response = await api.domains()
    domains.value = response['hydra:member'].filter((domain) => domain.isActive !== false)
    selectedDomain.value = domains.value[0]?.domain ?? ''
  } catch (cause) {
    domainError.value = message(cause)
  } finally {
    loadingDomains.value = false
  }
}

onMounted(loadDomains)

async function submit(): Promise<void> {
  if (!address.value) return
  submitting.value = true
  error.value = ''
  try {
    const response = await api.token(address.value)
    emit('open', { address: address.value, token: response.token })
  } catch (cause) {
    error.value = message(cause)
  } finally {
    submitting.value = false
  }
}

async function randomize(): Promise<void> {
  if (!domains.value.length || submitting.value) return
  const consonants = 'bcdfghjkmnprstvwxz'
  const vowels = 'aeiou'
  const values = crypto.getRandomValues(new Uint32Array(6))
  localPart.value = Array.from(values, (value, index) => {
    const alphabet = index % 2 ? vowels : consonants
    return alphabet[value % alphabet.length]!
  }).join('')
  selectedDomain.value = domains.value[values[0]! % domains.value.length]!.domain
  await submit()
}

async function copyAddress(): Promise<void> {
  if (!address.value) return
  error.value = ''
  try {
    await copyText(address.value)
    copied.value = true
  } catch {
    error.value = t('error.copy')
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

  <form v-else class="panel address-form" @submit.prevent="submit">
    <div class="panel-heading">
      <h2>{{ t('address.create') }}</h2>
      <button class="text-button" type="button" :disabled="loadingDomains || !domains.length || submitting" @click="randomize">
        <AppIcon name="sparkles" />
        {{ t('address.random') }}
      </button>
    </div>

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
      <span>{{ address || t('address.preview') }}</span>
      <button class="text-button" type="button" :disabled="!address" @click="copyAddress">
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? t('address.copied') : t('address.copy') }}
      </button>
    </div>

    <p class="sr-only" aria-live="polite">{{ copied ? t('address.copiedNotice') : '' }}</p>

    <p class="form-error" aria-live="polite">{{ error || initialError }}</p>
    <button class="primary-button" type="submit" :disabled="submitting || !address">
      {{ submitting ? t('address.opening') : t('address.open') }}
    </button>
  </form>

  <section class="panel saved-inboxes" aria-labelledby="remembered-title">
    <h2 id="remembered-title">{{ t('address.saved') }}</h2>
    <ul v-if="sessions.length">
      <li v-for="session in sessions" :key="session.address">
        <button class="saved-address" type="button" @click="emit('open', session)">
          {{ session.address }}
        </button>
        <button class="forget-button" type="button" :aria-label="t('address.forget', { address: session.address })" @click="forget(session.address)">
          <AppIcon name="trash-2" />
        </button>
      </li>
    </ul>
    <p v-else class="empty-copy">{{ t('address.savedHelp') }}</p>
  </section>
</template>
