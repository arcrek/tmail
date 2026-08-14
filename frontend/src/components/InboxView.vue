<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, api, streamMessages } from '../api'
import { copyText } from '../clipboard'
import type { AddressSession, HydraCollection, MessageSummary } from '../types'
import AppIcon from './AppIcon.vue'
import MessageReader from './MessageReader.vue'
import { useI18n } from '../i18n'

const props = defineProps<{
  session: AddressSession
  fetchSeconds: number
}>()
const emit = defineEmits<{ newAddress: [] }>()
const { t, formatDate: localDate } = useI18n()

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

function failure(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : t('error.inbox')
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
  if (initialized && notificationPermission.value === 'granted' && typeof Notification !== 'undefined') {
    for (const item of values.filter(({ id }) => !knownIds.has(id))) {
      new Notification(t('inbox.newMessage'), { body: t('inbox.newMessageBody') })
    }
  }
  for (const { id } of values) knownIds.add(id)
  initialized = true
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
  void streamMessages(props.session.token, () => void refresh(), controller.signal).catch(() => {
    if (streamController === controller && !controller.signal.aborted) {
      streamController = undefined
      startPolling()
    }
  })
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
