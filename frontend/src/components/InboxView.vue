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
import { useI18n } from '../i18n'

const props = withDefaults(defineProps<{
  session: AddressSession
  fetchSeconds: number
  accessToken?: string
}>(), { accessToken: '' })
const emit = defineEmits<{ newAddress: []; create: [session: AddressSession] }>()
const { t, formatDate: localDate } = useI18n()
const toast = useToast()

const collection = ref<HydraCollection<MessageSummary> | null>(null)
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
const createOpen = ref(false)
const createDomains = ref<DomainResource[]>([])
const createDomain = ref('')
const createLocalPart = ref('')
const createLoadingDomains = ref(false)
const createDomainsLoaded = ref(false)
const createDomainError = ref('')
const createSubmitting = ref(false)
let interval: number | undefined
let streamController: AbortController | undefined
let requestVersion = 0
let initialized = false
let knownIds = new Set<string>()

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

function toggleCreate(): void {
  createOpen.value = !createOpen.value
  if (createOpen.value && !createDomainsLoaded.value) void loadCreateDomains()
}

async function submitCreate(): Promise<void> {
  if (!createAddress.value) return
  createSubmitting.value = true
  try {
    const response = await api.token(createAddress.value, props.accessToken || undefined)
    emit('create', { address: createAddress.value, token: response.token })
    createOpen.value = false
    createLocalPart.value = ''
    createDomain.value = ''
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

function notifyNew(values: MessageSummary[]): void {
  if (initialized) {
    const freshIds = values.filter(({ id }) => !knownIds.has(id))
    for (const item of freshIds) {
      if (notificationPermission.value === 'granted' && typeof Notification !== 'undefined') {
        new Notification(t('inbox.newMessage'), { body: t('inbox.newMessageBody') })
      }
      void announceToast(item)
    }
  }
  for (const { id } of values) knownIds.add(id)
  initialized = true
}

async function copyAction(text: string): Promise<void> {
  try {
    await copyText(text)
  } catch {
    toast.error(t('error.copy'))
  }
}

async function announceToast(item: MessageSummary): Promise<void> {
  // Snapshot the session that received this message — props.session can change
  // (user switches address) while the api.message() fetch below is in flight.
  const { token, address } = props.session
  let code = ''
  try {
    const full = await api.message(token, item.id)
    code = extractVerificationCode(full.subject, full.text, full.html)
  } catch {
    // best-effort — still show the toast with just the copy-email action
  }
  const actions = [
    { label: t('inbox.copyEmailAction'), onClick: () => void copyAction(address) },
    ...(code ? [{ label: t('inbox.copyCodeAction'), onClick: () => void copyAction(code) }] : []),
  ]
  toast.success(item.subject || t('inbox.noSubject'), actions)
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
    if (requestedPage === 1) notifyNew(value['hydra:member'])
  } catch (cause) {
    if (version === requestVersion) error.value = failure(cause)
  } finally {
    if (version === requestVersion) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function stopPolling(): void {
  if (interval !== undefined) window.clearInterval(interval)
  interval = undefined
}

function startPolling(): void {
  stopPolling()
  if (!document.hidden) {
    interval = window.setInterval(() => void refresh(), Math.max(1, props.fetchSeconds) * 1000)
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
    notice.value = t('address.copiedNotice')
  } catch {
    notice.value = t('error.copy')
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
  if (!createOpen.value && !createDomainsLoaded.value) return
  createDomainsLoaded.value = false
  void loadCreateDomains()
})

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibility)
  void refresh()
  startStream()
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
        <button class="secondary-button" type="button" data-action="new-address" @click="emit('newAddress')">
          <AppIcon name="plus" />
          {{ t('inbox.new') }}
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
      <p class="auto-refresh-hint">{{ t('inbox.autoRefresh', { seconds: fetchSeconds }) }}</p>

      <button
        id="inbox-create-toggle"
        class="text-button"
        type="button"
        :aria-controls="createOpen ? 'inbox-create-address' : undefined"
        :aria-expanded="createOpen"
        @click="toggleCreate"
      >
        {{ t('address.create') }}
      </button>

      <section v-if="createOpen" id="inbox-create-address" class="inbox-create" :aria-label="t('address.create')">
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
        <button
          v-for="item in messages"
          :key="item.id"
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
      </template>

      <nav v-if="canPrevious || canNext" class="pagination" :aria-label="t('inbox.pages')">
        <button type="button" :disabled="!canPrevious" @click="changePage(page - 1)">{{ t('inbox.previous') }}</button>
        <span>{{ t('inbox.page', { page }) }}</span>
        <button type="button" :disabled="!canNext" @click="changePage(page + 1)">{{ t('inbox.next') }}</button>
      </nav>
    </aside>
  </section>
</template>
