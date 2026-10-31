<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'

const props = withDefaults(defineProps<{
  html: string
  mode: 'message' | 'content'
  css?: string
  title?: string
}>(), {
  css: '',
  title: '',
})

const sandbox = computed(() => 'allow-scripts allow-popups allow-popups-to-escape-sandbox')

const frame = ref<HTMLIFrameElement | null>(null)

/** Resolved page scheme: an explicit `data-theme` choice wins, otherwise the OS preference. */
function pageScheme(): 'light' | 'dark' {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'light' || explicit === 'dark') return explicit
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
// Site content frames follow the page theme; message frames keep the email's own light canvas.
const colorScheme = ref(pageScheme())
let stopSchemeWatch = () => {}
const revision = ref(0)
const { t } = useI18n()
let sentMessageRevision = -1
const sourceUrl = computed(() => `${props.mode === 'message' ? '/message-sandbox' : '/sandbox'}?revision=${revision.value}`)

watch(
  () => [props.html, props.css, props.mode, props.mode === 'content' ? colorScheme.value : ''] as const,
  () => {
    revision.value += 1
    sentMessageRevision = -1
  },
)

function sendContent(): void {
  const target = frame.value?.contentWindow
  if (!target || (props.mode === 'message' && sentMessageRevision === revision.value)) return
  if (props.mode === 'message') sentMessageRevision = revision.value
  target.postMessage({
    type: 'tmail:sandbox-content',
    html: props.html,
    css: props.css,
    mode: props.mode,
    ...(props.mode === 'content' ? { colorScheme: colorScheme.value } : {}),
  }, '*')
}

function handleWindowMessage(event: MessageEvent): void {
  if (event.source !== frame.value?.contentWindow) return
  if (event.data && event.data.type === 'tmail:sandbox-ready') {
    sentMessageRevision = -1
    sendContent()
  }
}

onMounted(() => {
  window.addEventListener('message', handleWindowMessage)
  if (props.mode !== 'content') return
  const update = () => { colorScheme.value = pageScheme() }
  const observer = new MutationObserver(update)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  media?.addEventListener?.('change', update)
  stopSchemeWatch = () => {
    observer.disconnect()
    media?.removeEventListener?.('change', update)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleWindowMessage)
  stopSchemeWatch()
})
</script>

<template>
  <iframe
    :key="revision"
    ref="frame"
    class="sandbox-frame"
    :sandbox="sandbox"
    :src="sourceUrl"
    :title="title || (mode === 'message' ? t('app.messageContent') : t('app.siteContent'))"
    @load="sendContent"
  />
</template>
