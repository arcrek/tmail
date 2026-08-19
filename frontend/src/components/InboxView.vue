<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api, streamMessages } from '../api'
import { copyText } from '../clipboard'
import { randomDomain, randomLocalPart } from '../randomAddress'
import { useToast } from '../toast'
import type { AddressSession, DomainResource, HydraCollection, MessageSummary } from '../types'
import { extractVerificationCode } from '../verificationCode'
import AppIcon from './AppIcon.vue'
import MessageReader from './MessageReader.vue'
import QrCodeModal from './QrCodeModal.vue'
import { playNewMailChime, setSoundEnabled, soundEnabled } from '../sound'
import { useI18n } from '../i18n'
const props = withDefaults(defineProps<{
  session: AddressSession
  fetchSeconds: number
  accessToken?: string
}>(), { accessToken: '' })
const emit = defineEmits<{ create: [session: AddressSession] }>()
const { t, formatDate: localDate } = useI18n()
const toast = useToast()

const collection = ref<HydraCollection<MessageSummary> | null>(null)
const codeCache = ref(new Map<string, string>())
const selectedId = ref<string | null>(null)
const page = ref(1)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const notice = ref('')
const query = ref('')
const notificationPermission = ref<NotificationPermission>(
  typeof Notification === 'undefined' ? 'denied' : Notification.permission,
)
const listHeading = ref<HTMLElement | null>(null)
const createDomains = ref<DomainResource[]>([])
const createDomain = ref('')
const createLocalPart = ref('')
const createLoadingDomains = ref(false)
const createDomainsLoaded = ref(false)
const createDomainError = ref('')
const createSubmitting = ref(false)
let interval: number | undefined
let countdownInterval: number | undefined
let streamController: AbortController | undefined
let requestVersion = 0
let initialized = false
let knownIds = new Set<string>()
let codeFetches = new Map<string, Promise<string>>()
const remainingSeconds = ref(props.fetchSeconds)
const createExpanded = ref(false)
const showQrModal = ref(false)

// The reader replaces the message list in-place (v-if), so closing it unmounts the reader's
// own focused element; move focus back to the list region instead of dropping to <body>.
watch(selectedId, (value) => {
  if (value !== null) return
  void nextTick(() => listHeading.value?.focus())
})

const pageMessages = computed(() => collection.value?.['hydra:member'] ?? [])
const messages = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return pageMessages.value
  return pageMessages.value.filter((item) =>
    item.subject.toLowerCase().includes(needle) ||
    item.from.address.toLowerCase().includes(needle) ||
    (item.from.name ?? '').toLowerCase().includes(needle),
  )
})
const canPrevious = computed(() => Boolean(collection.value?.['hydra:view']['hydra:previous']))
const canNext = computed(() => Boolean(collection.value?.['hydra:view']['hydra:next']))
const createAddress = computed(() =>
  createLocalPart.value && createDomain.value
    ? `${createLocalPart.value.trim().toLowerCase()}@${createDomain.value}`
    : '',
)

function failure(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : t('error.inbox')
}

const createFailure = (cause: unknown) =>
  cause instanceof ApiError ? cause.message : t('error.unavailable')

let createDomainsVersion = 0

async function loadCreateDomains(): Promise<void> {
  const version = ++createDomainsVersion
  createLoadingDomains.value = true
  createDomainError.value = ''
  try {
    const response = await api.domains(1, props.accessToken || undefined)
    if (version !== createDomainsVersion) return
    createDomains.value = response['hydra:member'].filter((domain) => domain.isActive !== false)
    createDomain.value = createDomains.value[0]?.domain ?? ''
    createDomainsLoaded.value = true
  } catch (cause) {
    if (version !== createDomainsVersion) return
    createDomainError.value = createFailure(cause)
  } finally {
    if (version === createDomainsVersion) createLoadingDomains.value = false
  }
}

async function submitCreate(): Promise<void> {
  if (!createAddress.value) return
  createSubmitting.value = true
  try {
    const response = await api.token(createAddress.value, props.accessToken || undefined)
    emit('create', { address: createAddress.value, token: response.token })
    // The form stays visible after creating (it no longer closes), so leave the
    // domain select on a valid option instead of blanking it to '' — otherwise it
    // renders unselected until something else reloads the domain list.
    createLocalPart.value = ''
    createDomain.value = createDomains.value[0]?.domain ?? ''
  } catch (cause) {
    toast.error(createFailure(cause))
  } finally {
    createSubmitting.value = false
  }
}

async function randomizeCreate(): Promise<void> {
  if (!createDomains.value.length || createSubmitting.value) return
  createLocalPart.value = randomLocalPart()
  createDomain.value = randomDomain(createDomains.value.map((domain) => domain.domain))
  await submitCreate()
}

function formatDate(value: string): string {
  return localDate(value, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function notifyNew(items: MessageSummary[]): void {
  if (!initialized) {
    initialized = true
    for (const item of items) knownIds.add(item.id)
    return
  }
  let hasNew = false
  for (const item of items) {
    if (!knownIds.has(item.id)) {
      knownIds.add(item.id)
      hasNew = true
      if (notificationPermission.value === 'granted' && typeof Notification !== 'undefined') {
        new Notification(t('inbox.newMessage'), { body: t('inbox.newMessageBody') })
      }
      void announceToast(item)
    }
  }
  if (hasNew) {
    playNewMailChime()
  }
}

function toggleSound(): void {
  setSoundEnabled(!soundEnabled.value)
}

async function copyAction(text: string, noticeKey: 'address.copied' | 'inbox.codeCopied' = 'address.copied'): Promise<void> {
  try {
    await copyText(text)
    toast.success(t(noticeKey))
  } catch {
    toast.error(t('error.copy'))
  }
}

// Shared by resolveCodes() (row chips) and announceToast() (new-mail toast) so a
// message that arrives while the list is open only triggers one api.message()
// call, not two independent fetches racing each other. Cached/in-flight per id
// (codeCache/codeFetches); the write is gated on the session that started the
// fetch still being current — a poll-triggered requestVersion bump alone must
// not discard an otherwise-valid same-session result.
async function fetchCode(item: MessageSummary): Promise<string> {
  const cached = codeCache.value.get(item.id)
  if (cached !== undefined) return cached
  const session = props.session
  let fetch = codeFetches.get(item.id)
  if (!fetch) {
    fetch = api.message(session.token, item.id)
      .then((full) => extractVerificationCode(full.subject, full.text, full.html))
    codeFetches.set(item.id, fetch)
    const clearFetch = () => {
      if (codeFetches.get(item.id) === fetch) codeFetches.delete(item.id)
    }
    void fetch.then(clearFetch, clearFetch)
  }
  const code = await fetch
  if (props.session.token === session.token) codeCache.value.set(item.id, code)
  return code
}

async function announceToast(item: MessageSummary): Promise<void> {
  const address = props.session.address
  let code = ''
  try {
    code = await fetchCode(item)
  } catch {
    // best-effort — still show the toast with just the copy-email action
  }
  const actions = [
    { label: t('inbox.copyEmailAction'), onClick: () => void copyAction(address) },
    ...(code ? [{ label: t('inbox.copyCodeAction'), onClick: () => void copyAction(code, 'inbox.codeCopied') }] : []),
  ]
  toast.success(item.subject || t('inbox.noSubject'), actions)
}

async function resolveCodes(items: MessageSummary[]): Promise<void> {
  const targets = items.filter((item) => !codeCache.value.has(item.id))
  await Promise.allSettled(targets.map((item) => fetchCode(item)))
}

async function refresh(): Promise<void> {
  if (refreshing.value) return
  const version = ++requestVersion
  const requestedPage = page.value
  refreshing.value = true
  error.value = ''
  try {
    const value = await api.messages(props.session.token, requestedPage)
    if (version !== requestVersion) return
    collection.value = value
    void resolveCodes(value['hydra:member'])
    if (requestedPage === 1) notifyNew(value['hydra:member'])
  } catch (cause) {
    if (version === requestVersion) error.value = failure(cause)
  } finally {
    if (version === requestVersion) {
      loading.value = false
      refreshing.value = false
      remainingSeconds.value = Math.max(1, props.fetchSeconds)
    }
  }
}

function stopPolling(): void {
  if (interval !== undefined) window.clearInterval(interval)
  if (countdownInterval !== undefined) window.clearInterval(countdownInterval)
  interval = undefined
  countdownInterval = undefined
}

function startPolling(): void {
  stopPolling()
  if (!document.hidden) {
    remainingSeconds.value = Math.max(1, props.fetchSeconds)
    countdownInterval = window.setInterval(() => {
      if (remainingSeconds.value > 1) {
        remainingSeconds.value -= 1
      }
    }, 1000)
    interval = window.setInterval(() => {
      remainingSeconds.value = Math.max(1, props.fetchSeconds)
      void refresh()
    }, Math.max(1, props.fetchSeconds) * 1000)
  }
}
function startStream(): void {
  stopPolling()
  streamController?.abort()
  const controller = new AbortController()
  streamController = controller
  const fallback = () => {
    if (streamController === controller && !controller.signal.aborted) {
      streamController = undefined
      startPolling()
    }
  }
  // Both a rejected stream (network error, non-OK response) and a stream that
  // simply ends (server closed the connection, proxy killed it) must fall
  // back to polling — only an intentional abort() should not.
  void streamMessages(props.session.token, () => void refresh(), controller.signal).then(fallback, fallback)
}

function restartRefresh(): void {
  requestVersion += 1
  refreshing.value = false
  void refresh()
}

function handleVisibility(): void {
  if (streamController) return
  if (document.hidden) stopPolling()
  else {
    restartRefresh()
    startPolling()
  }
}

async function copyAddress(): Promise<void> {
  try {
    await copyText(props.session.address)
    toast.success(t('address.copiedNotice'))
  } catch {
    toast.error(t('error.copy'))
  }
}

async function enableNotifications(): Promise<void> {
  if (typeof Notification === 'undefined') {
    notice.value = t('inbox.notificationsUnavailable')
    return
  }
  notificationPermission.value = await Notification.requestPermission()
  notice.value = notificationPermission.value === 'granted'
    ? t('inbox.notificationsEnabled')
    : t('inbox.notificationsOff')
}

function changePage(next: number): void {
  page.value = next
  selectedId.value = null
  query.value = ''
  loading.value = true
  restartRefresh()
}

function markSeen(id: string): void {
  const item = messages.value.find((value) => value.id === id)
  if (item) item.seen = true
}

function removeMessage(): void {
  selectedId.value = null
  void refresh()
}

function removeStale(): void {
  selectedId.value = null
  void refresh()
}

function resetSession(): void {
  requestVersion += 1
  page.value = 1
  collection.value = null
  selectedId.value = null
  query.value = ''
  loading.value = true
  refreshing.value = false
  error.value = ''
  notice.value = ''
  initialized = false
  knownIds = new Set<string>()
  codeCache.value = new Map()
  codeFetches = new Map()
  streamController?.abort()
  streamController = undefined
  void refresh()
  startStream()
}

watch([() => props.session.address, () => props.session.token], resetSession)
watch(() => props.fetchSeconds, () => {
  if (!streamController) startPolling()
})
watch(() => props.accessToken, () => {
  createDomainsLoaded.value = false
  void loadCreateDomains()
})

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibility)
  void refresh()
  startStream()
  void loadCreateDomains()
})

onBeforeUnmount(() => {
  requestVersion += 1
  streamController?.abort()
  streamController = undefined
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibility)
})
</script>

<template>
  <section class="inbox-view" aria-labelledby="inbox-title">
    <div class="panel inbox-hero">
      <div class="inbox-hero-address">
        <small>{{ t('inbox.address') }}</small>
        <h1 id="inbox-title" class="inbox-address">{{ session.address }}</h1>
      </div>

      <div class="inbox-hero-actions">
        <button class="primary-button" type="button" @click="copyAddress">
          <AppIcon name="copy" />
          {{ t('address.copy') }}
        </button>
        <button
          class="secondary-button"
          type="button"
          data-action="refresh"
          :disabled="refreshing"
          @click="refresh"
        >
          <AppIcon name="refresh-cw" />
          {{ refreshing ? t('inbox.refreshing') : t('inbox.refresh') }}
        </button>
        <button
          class="secondary-button"
          type="button"
          data-action="new-address"
          :aria-expanded="createExpanded"
          aria-controls="inbox-create-address"
          @click="createExpanded = !createExpanded"
        >
          <AppIcon :name="createExpanded ? 'x' : 'plus'" />
          {{ t('inbox.new') }}
        </button>
        <button
          class="secondary-button"
          type="button"
          data-action="qr-code"
          :aria-label="t('inbox.showQr')"
          @click="showQrModal = true"
        >
          <AppIcon name="qr" />
          <span>QR</span>
        </button>
        <button
          class="secondary-button"
          type="button"
          data-action="sound"
          :aria-label="soundEnabled ? t('inbox.soundOff') : t('inbox.soundOn')"
          @click="toggleSound"
        >
          <AppIcon :name="soundEnabled ? 'volume-2' : 'volume-x'" />
          <span>{{ soundEnabled ? t('inbox.soundOn') : t('inbox.soundOff') }}</span>
        </button>
        <button
          class="secondary-button"
          type="button"
          data-action="notifications"
          :disabled="notificationPermission === 'granted'"
          @click="enableNotifications"
        >
          <AppIcon name="bell" />
          {{ notificationPermission === 'granted' ? t('inbox.notificationsOn') : t('inbox.enableNotifications') }}
        </button>
      </div>

      <p v-if="notice" class="toolbar-notice" aria-live="polite">{{ notice }}</p>
      <div class="auto-refresh-indicator">
        <span class="refresh-countdown-pill" aria-live="polite">
          <span class="countdown-dot" aria-hidden="true" />
          {{ refreshing ? t('inbox.refreshing') : t('inbox.refreshIn', { seconds: remainingSeconds }) }}
        </span>
      </div>
      <section
        v-show="createExpanded"
        id="inbox-create-address"
        class="inbox-create"
        aria-labelledby="inbox-create-heading"
      >
        <h2 id="inbox-create-heading" class="sr-only">{{ t('address.create') }}</h2>
        <div v-if="createLoadingDomains" class="inbox-create-state" aria-live="polite">
          <span class="skeleton skeleton-field" />
          <span class="sr-only">{{ t('address.loading') }}</span>
        </div>

        <div v-else-if="createDomainError" class="inbox-create-state" role="alert">
          <p>{{ createDomainError }}</p>
          <button class="secondary-button compact-button" type="button" @click="loadCreateDomains">
            {{ t('address.retry') }}
          </button>
        </div>

        <div v-else-if="!createDomains.length" class="inbox-create-state">
          <p>{{ t('address.noneHelp') }}</p>
        </div>

        <form v-else class="address-form" @submit.prevent="submitCreate">
          <div class="address-fields">
            <div class="field local-field">
              <label for="inbox-create-local-part">{{ t('address.name') }}</label>
              <input
                id="inbox-create-local-part"
                v-model="createLocalPart"
                name="inbox-create-local-part"
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
              <label for="inbox-create-domain">{{ t('address.domain') }}</label>
              <select id="inbox-create-domain" v-model="createDomain" name="inbox-create-domain" required>
                <option v-for="domain in createDomains" :key="domain.id" :value="domain.domain">
                  {{ domain.domain }}
                </option>
              </select>
            </div>
          </div>

          <button class="primary-button" type="submit" :disabled="createSubmitting || !createAddress">
            {{ createSubmitting ? t('address.opening') : t('address.open') }}
          </button>
          <button class="text-button" type="button" :disabled="createSubmitting" @click="randomizeCreate">
            <AppIcon name="sparkles" />
            {{ t('address.random') }}
          </button>
        </form>
      </section>
    </div>

    <MessageReader
      v-if="selectedId"
      :id="selectedId"
      :token="session.token"
      @seen="markSeen"
      @deleted="removeMessage"
      @stale="removeStale"
      @close="selectedId = null"
    />

    <aside v-else class="panel message-list" :aria-label="t('inbox.messages')">
      <div class="list-heading">
        <div>
          <h2 ref="listHeading" tabindex="-1">{{ t('inbox.messages') }}</h2>
          <span>{{ t('inbox.total', { count: collection?.['hydra:totalItems'] ?? 0 }) }}</span>
        </div>
        <div class="field">
          <label for="message-search">{{ t('inbox.searchLabel') }}</label>
          <input
            id="message-search"
            v-model="query"
            type="search"
            :placeholder="t('inbox.searchPlaceholder')"
          >
        </div>
      </div>

      <div v-if="loading" class="message-list-state" aria-live="polite">
        <span class="skeleton skeleton-field" />
        <span class="skeleton skeleton-field" />
        <span class="skeleton skeleton-field" />
        <span class="sr-only">{{ t('inbox.loading') }}</span>
      </div>

      <div v-else-if="error && !collection" class="message-list-state">
        <h3>{{ t('inbox.unavailable') }}</h3>
        <p>{{ error }}</p>
        <button class="secondary-button compact-button" type="button" @click="refresh">{{ t('address.retry') }}</button>
      </div>

      <div v-else-if="query && pageMessages.length && !messages.length" class="message-list-state">
        <h3>{{ t('inbox.noSearchResults') }}</h3>
      </div>

      <div v-else-if="!messages.length" class="message-list-state">
        <h3>{{ t('inbox.waiting') }}</h3>
        <p>{{ t('inbox.waitingHelp') }}</p>
      </div>

      <template v-else>
        <p v-if="error" class="list-error" role="alert">{{ error }}</p>
        <ul class="message-rows">
          <li
          v-for="item in messages"
          :key="item.id"
          class="message-row-item"
          >
            <button
              class="message-row"
              :class="{ unread: !item.seen }"
              type="button"
              @click="selectedId = item.id"
            >
              <span class="message-row-top">
                <strong>{{ item.from.name || item.from.address }}</strong>
                <time :datetime="item.createdAt">{{ formatDate(item.createdAt) }}</time>
              </span>
              <span v-if="!item.seen" class="sr-only">{{ t('inbox.unread') }}</span>
              <span class="message-subject">{{ item.subject || t('inbox.noSubject') }}</span>
              <span class="message-intro">{{ item.intro || t('inbox.noPreview') }}</span>
              <span v-if="item.hasAttachments" class="attachment-flag">
                <AppIcon name="paperclip" />
                <span class="sr-only">{{ t('inbox.attachment') }}</span>
              </span>
            </button>
            <button
              v-if="codeCache.get(item.id)"
              class="message-row-code"
              type="button"
              :aria-label="t('inbox.copyCodeFor', { address: item.from.address })"
              @click="copyAction(codeCache.get(item.id) ?? '', 'inbox.codeCopied')"
            >
              <span class="code-value">{{ codeCache.get(item.id) }}</span>
              <AppIcon name="copy" />
            </button>
          </li>
        </ul>
      </template>

    <QrCodeModal
      v-if="showQrModal"
      :address="session.address"
      @close="showQrModal = false"
    />
      <nav v-if="canPrevious || canNext" class="pagination" :aria-label="t('inbox.pages')">
        <button type="button" :disabled="!canPrevious" @click="changePage(page - 1)">{{ t('inbox.previous') }}</button>
        <span>{{ t('inbox.page', { page }) }}</span>
        <button type="button" :disabled="!canNext" @click="changePage(page + 1)">{{ t('inbox.next') }}</button>
      </nav>
    </aside>
  </section>
</template>
