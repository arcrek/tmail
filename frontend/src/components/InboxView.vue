<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api, streamMessages } from '../api'
import { authorizationFailed, openMailbox } from '../mailbox-access'
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
const emit = defineEmits<{ create: [session: AddressSession]; login: [address: string]; invalid: []; manage: []; logout: [] }>()
const { t, formatDate: localDate } = useI18n()
const toast = useToast()
const mailToasts = new Set<number>()
function clearMailToasts(): void {
  for (const id of mailToasts) toast.dismiss(id)
  mailToasts.clear()
}

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
let accessInvalid = false
let sessionVersion = 0
let knownIds = new Set<string>()
let codeFetches = new Map<string, Promise<string>>()
const remainingSeconds = ref(props.fetchSeconds)
const createExpanded = ref(false)
const showQrModal = ref(false)

// On phones the new-address FAB is fixed at the bottom while the form renders at the top
// of the page; move focus (and with it the scroll position) to the form when it opens.
watch(createExpanded, (open) => {
  if (!open) return
  void nextTick(() => document.getElementById('inbox-create-local-part')?.focus())
})

// The list stays mounted beside the reader (and is only hidden by CSS on narrow screens),
// so closing the reader returns focus to the row that opened it, falling back to the
// list heading when that row is gone (deleted, paged away, or filtered out).
let lastSelectedId: string | null = null
watch(selectedId, (value) => {
  if (value !== null) {
    lastSelectedId = value
    return
  }
  const previous = lastSelectedId
  void nextTick(() => {
    const row = previous
      ? [...document.querySelectorAll<HTMLElement>('.message-row')].find((node) => node.dataset.messageId === previous)
      : undefined
    ;(row ?? listHeading.value)?.focus()
  })
})

const pageMessages = computed(() => {
  const items = collection.value?.['hydra:member'] ?? []
  return [...items].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  )
})
const messages = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return pageMessages.value
  return pageMessages.value.filter((item) =>
    item.subject.toLowerCase().includes(needle) ||
    item.from.address.toLowerCase().includes(needle) ||
    (item.from.name ?? '').toLowerCase().includes(needle),
  )
})
const latestCode = computed(() => {
  if (page.value !== 1) return null
  // Walk newest-first; stop at a message whose code is still unresolved so an older
  // code is never shown as "latest" while the newest message is being inspected.
  for (const item of pageMessages.value) {
    if (!codeCache.value.has(item.id)) return null
    const code = codeCache.value.get(item.id)
    if (code) return { code, from: item.from.name || item.from.address }
  }
  return null
})
const passwordLabel = computed(() => {
  if (!props.session.protected) return t('password.set')
  return props.session.accessKind === 'admin' ? t('password.reset') : t('password.change')
})

/** Groups numeric codes in threes for reading (482913 -> 482 913); copy uses the raw value. */
function groupCode(code: string): string {
  return /^\d{6,}$/.test(code) ? code.replace(/(\d{3})(?=\d)/g, '$1 ') : code
}

function initial(item: MessageSummary): string {
  return (item.from.name || item.from.address || '?').trim().charAt(0).toUpperCase() || '?'
}

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
  const submittedAddress = createAddress.value
  const version = sessionVersion
  createSubmitting.value = true
  try {
    const session = await openMailbox(submittedAddress, props.accessToken || undefined)
    if (version !== sessionVersion) return
    emit('create', session)
    // The form stays visible after creating (it no longer closes), so leave the
    // domain select on a valid option instead of blanking it to '' — otherwise it
    // renders unselected until something else reloads the domain list.
    createLocalPart.value = ''
    createDomain.value = createDomains.value[0]?.domain ?? ''
  } catch (cause) {
    if (version !== sessionVersion) return
    if (authorizationFailed(cause)) emit('login', submittedAddress)
    else toast.error(createFailure(cause))
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
  const version = sessionVersion
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
  try {
    const code = await fetch
    if (version !== sessionVersion || accessInvalid || props.session.token !== session.token) return ''
    codeCache.value.set(item.id, code)
    return code
  } catch (cause) {
    if (version === sessionVersion && authorizationFailed(cause)) invalidateAccess()
    throw cause
  }
}

async function announceToast(item: MessageSummary): Promise<void> {
  const address = props.session.address
  const version = sessionVersion
  let code = ''
  try {
    code = await fetchCode(item)
  } catch {
    // best-effort — still show the toast with just the copy-email action
  }
  if (version !== sessionVersion || accessInvalid) return
  const actions = [
    { label: t('inbox.copyEmailAction'), onClick: () => void copyAction(address) },
    ...(code ? [{ label: t('inbox.copyCodeAction'), onClick: () => void copyAction(code, 'inbox.codeCopied') }] : []),
  ]
  const id = toast.success(item.subject || t('inbox.noSubject'), actions)
  if (id !== undefined) mailToasts.add(id)
}

async function resolveCodes(items: MessageSummary[]): Promise<void> {
  const targets = items.filter((item) => !codeCache.value.has(item.id))
  const concurrency = 2
  const version = sessionVersion
  for (let i = 0; i < targets.length; i += concurrency) {
    if (version !== sessionVersion || accessInvalid) return
    const chunk = targets.slice(i, i + concurrency)
    await Promise.allSettled(chunk.map((item) => fetchCode(item)))
  }
}

async function refresh(): Promise<void> {
  if (refreshing.value || accessInvalid) return
  const version = ++requestVersion
  const session = sessionVersion
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
    if (session !== sessionVersion) return
    if (authorizationFailed(cause)) invalidateAccess()
    else if (version === requestVersion) error.value = failure(cause)
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
  if (accessInvalid) return
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
  const session = props.session
  const version = sessionVersion
  const fallback = async (cause?: unknown) => {
    if (streamController !== controller || controller.signal.aborted || version !== sessionVersion) return
    streamController = undefined
    if (authorizationFailed(cause)) { invalidateAccess(); return }
    try {
      const account = await api.me(session.token)
      if (version !== sessionVersion || accessInvalid) return
      if (account.address !== session.address) { invalidateAccess(); return }
      if (session.accessKind === 'admin' && account.accessKind !== 'admin') { invalidateAccess(); return }
    } catch (error) {
      if (version !== sessionVersion || accessInvalid) return
      if (authorizationFailed(error)) { invalidateAccess(); return }
    }
    if (version === sessionVersion && !accessInvalid) startPolling()
  }
  // Both a rejected stream (network error, non-OK response) and a stream that
  // simply ends (server closed the connection, proxy killed it) must fall
  // back to polling — only an intentional abort() should not.
  void streamMessages(props.session.token, () => void refresh(), controller.signal).then(() => fallback(), fallback)
}

function restartRefresh(): void {
  requestVersion += 1
  refreshing.value = false
  void refresh()
}

function handleVisibility(): void {
  if (accessInvalid) return
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

function invalidateAccess(): void {
  if (accessInvalid) return
  accessInvalid = true
  clearMailToasts()
  ++sessionVersion
  ++requestVersion
  collection.value = null
  selectedId.value = null
  codeCache.value = new Map()
  codeFetches = new Map()
  knownIds.clear()
  showQrModal.value = false
  streamController?.abort()
  streamController = undefined
  stopPolling()
  refreshing.value = false
  loading.value = false
  error.value = t('password.changed')
  emit('invalid')
}

function resetSession(): void {
  clearMailToasts()
  ++sessionVersion
  accessInvalid = false
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
  clearMailToasts()
  ++sessionVersion
  ++createDomainsVersion
  accessInvalid = true
  requestVersion += 1
  streamController?.abort()
  streamController = undefined
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibility)
})
</script>

<template>
  <section class="inbox-view" :class="{ 'has-reader': Boolean(selectedId) }" aria-labelledby="inbox-title">
    <div class="inbox-top">
      <div class="panel inbox-hero">
        <div class="inbox-hero-main">
          <div class="inbox-hero-address">
            <small class="inbox-status mailbox-security">
              <span class="countdown-dot" aria-hidden="true" />
              <template v-if="session.accessKind === 'admin'">
                <span>{{ t('password.admin') }}</span>
                <span aria-hidden="true">·</span>
              </template>
              <span v-if="session.protectedUntil">{{ t('password.deadline', { date: localDate(session.protectedUntil, { dateStyle: 'long', timeStyle: 'short' }) }) }}</span>
              <span v-else>{{ session.protected ? t('inbox.protected') : t('password.public') }}</span>
              <span aria-hidden="true">·</span>
              <span class="refresh-countdown-pill" aria-live="polite">
                {{ refreshing ? t('inbox.refreshing') : t('inbox.refreshIn', { seconds: remainingSeconds }) }}
              </span>
            </small>
            <h1 id="inbox-title" class="inbox-address">{{ session.address }}</h1>
          </div>

          <div class="inbox-hero-actions">
            <button class="primary-button" type="button" @click="copyAddress">
              <AppIcon name="copy" />
              {{ t('address.copy') }}
            </button>
            <div class="inbox-toolbar">
            <button
              class="icon-button"
              type="button"
              data-action="refresh"
              :title="t('inbox.refresh')"
              :disabled="refreshing"
              @click="refresh"
            >
              <AppIcon name="refresh-cw" :class="{ spinning: refreshing }" />
              <span class="sr-only">{{ refreshing ? t('inbox.refreshing') : t('inbox.refresh') }}</span>
            </button>
            <button
              class="icon-button"
              type="button"
              data-action="qr-code"
              :title="t('inbox.showQr')"
              @click="showQrModal = true"
            >
              <AppIcon name="qr" />
              <span class="sr-only">{{ t('inbox.showQr') }}</span>
            </button>
            <button
              class="icon-button"
              type="button"
              data-action="sound"
              :title="t('inbox.toggleSound')"
              :aria-pressed="soundEnabled"
              @click="toggleSound"
            >
              <AppIcon :name="soundEnabled ? 'volume-2' : 'volume-x'" />
              <span class="sr-only">{{ t('inbox.toggleSound') }}</span>
            </button>
            <button
              class="icon-button"
              type="button"
              data-action="notifications"
              :title="notificationPermission === 'granted' ? t('inbox.notificationsOn') : t('inbox.enableNotifications')"
              :aria-pressed="notificationPermission === 'granted'"
              :disabled="notificationPermission === 'granted'"
              @click="enableNotifications"
            >
              <AppIcon :name="notificationPermission === 'granted' ? 'bell-ring' : 'bell'" />
              <span class="sr-only">{{ t('inbox.enableNotifications') }}</span>
            </button>
            <button
              class="icon-button"
              type="button"
              data-action="password"
              :title="passwordLabel"
              :disabled="accessInvalid"
              @click="emit('manage')"
            >
              <AppIcon :name="session.protected ? 'lock' : 'key'" />
              <span class="sr-only">{{ passwordLabel }}</span>
            </button>
            <button
              class="secondary-button new-address-button"
              type="button"
              data-action="new-address"
              :aria-expanded="createExpanded"
              aria-controls="inbox-create-address"
              @click="createExpanded = !createExpanded"
            >
              <AppIcon :name="createExpanded ? 'x' : 'plus'" />
              <span class="new-address-label">{{ t('inbox.new') }}</span>
            </button>
            </div>
            <button
              v-if="session.accessKind === 'visitor' || session.accessKind === 'admin'"
              class="icon-button"
              type="button"
              data-action="mailbox-logout"
              :title="t('password.logout')"
              @click="emit('logout')"
            >
              <AppIcon name="log-out" />
              <span class="sr-only">{{ t('password.logout') }}</span>
            </button>
          </div>
        </div>

        <p v-if="notice" class="toolbar-notice" aria-live="polite">{{ notice }}</p>

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
              <AppIcon name="inbox" />
              {{ createSubmitting ? t('address.opening') : t('address.open') }}
            </button>
            <button class="text-button" type="button" :disabled="createSubmitting" @click="randomizeCreate">
              <AppIcon name="shuffle" />
              {{ t('address.random') }}
            </button>
          </form>
        </section>
      </div>

      <section v-if="latestCode" class="latest-code" :aria-label="t('inbox.latestCode')">
        <div class="latest-code-text">
          <span class="latest-code-label">
            {{ t('inbox.latestCode') }} · {{ latestCode.from }}
          </span>
          <code class="latest-code-value">{{ groupCode(latestCode.code) }}</code>
        </div>
        <button
          class="latest-code-copy"
          type="button"
          data-action="copy-latest-code"
          @click="copyAction(latestCode.code, 'inbox.codeCopied')"
        >
          <AppIcon name="copy" />
          {{ t('inbox.copyLatestCode') }}
        </button>
      </section>
    </div>

    <div class="inbox-panes">
      <aside class="panel message-list" :aria-label="t('inbox.messages')">
        <div class="list-heading">
          <div class="field">
            <label class="sr-only" for="message-search">{{ t('inbox.searchLabel') }}</label>
            <span class="search-bar">
              <AppIcon name="search" />
              <input
                id="message-search"
                v-model="query"
                type="search"
                :placeholder="t('inbox.searchPlaceholder')"
              >
            </span>
          </div>
          <div class="list-heading-title">
            <h2 ref="listHeading" tabindex="-1">{{ t('inbox.messages') }}</h2>
            <span>{{ t('inbox.total', { count: collection?.['hydra:totalItems'] ?? 0 }) }}</span>
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
              :class="{ selected: item.id === selectedId }"
            >
              <button
                class="message-row"
                :data-message-id="item.id"
                :class="{ unread: !item.seen }"
                type="button"
                :aria-current="item.id === selectedId ? 'true' : undefined"
                @click="selectedId = item.id"
              >
                <span class="message-avatar" aria-hidden="true">{{ initial(item) }}</span>
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

        <nav v-if="canPrevious || canNext" class="pagination" :aria-label="t('inbox.pages')">
          <button type="button" :disabled="!canPrevious" @click="changePage(page - 1)">{{ t('inbox.previous') }}</button>
          <span>{{ t('inbox.page', { page }) }}</span>
          <button type="button" :disabled="!canNext" @click="changePage(page + 1)">{{ t('inbox.next') }}</button>
        </nav>
      </aside>

      <MessageReader
        v-if="selectedId"
        :id="selectedId"
        :key="selectedId"
        :token="session.token"
        @seen="markSeen"
        @deleted="removeMessage"
        @stale="removeStale"
        @invalid="invalidateAccess"
        @close="selectedId = null"
      />
      <div v-else class="panel reader-placeholder" aria-hidden="true">
        <AppIcon name="mail-open" />
      </div>
    </div>

    <QrCodeModal
      v-if="showQrModal"
      :address="session.address"
      @close="showQrModal = false"
    />
  </section>
</template>
