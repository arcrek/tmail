<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AddressPanel from './components/AddressPanel.vue'
import AppHeader from './components/AppHeader.vue'
import InboxView from './components/InboxView.vue'
import SandboxFrame from './components/SandboxFrame.vue'
import ToastStack from './components/ToastStack.vue'
import AdminApp from './admin/AdminApp.vue'
import { ApiError, api } from './api'
import { clearAccessToken, loadAccessToken, saveAccessToken } from './access'
import { parseRoute } from './route'
import { loadSessions, saveSession } from './session'
import type { AddressSession, SiteResource } from './types'
import { setSiteLocale, useI18n } from './i18n'
import { useToast } from './toast'

type View = 'address' | 'inbox' | 'admin'

const initialRoute = parseRoute(window.location.pathname)
const view = ref<View>(initialRoute.name === 'admin' ? 'admin' : 'address')
const current = ref<AddressSession | null>(null)
const site = ref<SiteResource | null>(null)
const loading = ref(initialRoute.name === 'address')
const toast = useToast()
const accessToken = ref(loadAccessToken())
const unlocking = ref(false)
const unlockOpen = ref(false)
const unlockValue = ref('')
let navigationVersion = 0
let siteVersion = 0
const root = document.documentElement
const originalLanguage = root.getAttribute('lang')
const originalPrimary = root.style.getPropertyValue('--brand-primary')
const originalAccent = root.style.getPropertyValue('--brand-accent')
const originalTitle = document.title
const originalFavicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')
const originalFaviconHref = originalFavicon?.getAttribute('href') ?? null
const { locale, t } = useI18n()
let favicon = originalFavicon
let createdFavicon = false

const adSlots = computed(() => Object.entries(site.value?.adSlots ?? {})
  .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])))

function applySite(value: SiteResource | null): void {
  if (!value) return
  root.style.setProperty('--brand-primary', value.primaryColor)
  root.style.setProperty('--brand-accent', value.accentColor)
  setSiteLocale(value.language)
  document.title = value.appName
  if (value.faviconDataUrl) {
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.dataset.tmailFavicon = ''
      document.head.append(favicon)
      createdFavicon = true
    }
    favicon.setAttribute('href', value.faviconDataUrl)
  } else if (createdFavicon) {
    favicon?.remove()
    favicon = null
    createdFavicon = false
  } else if (favicon) {
    if (originalFaviconHref === null) favicon.removeAttribute('href')
    else favicon.setAttribute('href', originalFaviconHref)
  }
}

function cleanupSite(): void {
  if (originalPrimary) root.style.setProperty('--brand-primary', originalPrimary)
  else root.style.removeProperty('--brand-primary')
  if (originalAccent) root.style.setProperty('--brand-accent', originalAccent)
  else root.style.removeProperty('--brand-accent')
  if (originalLanguage === null) root.removeAttribute('lang')
  else root.setAttribute('lang', originalLanguage)
  document.title = originalTitle
  if (createdFavicon) favicon?.remove()
  else if (originalFavicon) {
    if (originalFaviconHref === null) originalFavicon.removeAttribute('href')
    else originalFavicon.setAttribute('href', originalFaviconHref)
  }
}

watch(site, applySite)
watch(locale, (value) => { root.lang = value }, { immediate: true })

function openInbox(session: AddressSession, updatePath = true): void {
  current.value = session
  saveSession(session)
  view.value = 'inbox'
  const path = `/${encodeURIComponent(session.address)}`
  if (updatePath && location.pathname !== path) history.pushState({}, '', path)
}

function openCreatedInbox(session: AddressSession): void {
  navigationVersion += 1
  openInbox(session)
}

async function reconcileRoute(): Promise<void> {
  const version = ++navigationVersion
  const route = parseRoute(window.location.pathname)
  current.value = null
  loading.value = false

  if (route.name === 'admin') {
    view.value = 'admin'
    return
  }
  if (route.name !== 'address') {
    view.value = 'address'
    return
  }

  const remembered = loadSessions().find((session) => session.address === route.address)
  if (remembered) {
    openInbox(remembered, false)
    return
  }

  view.value = 'address'
  loading.value = true
  try {
    const response = await api.token(route.address)
    if (version === navigationVersion) openInbox({ address: route.address, token: response.token }, false)
  } catch (cause) {
    if (version === navigationVersion) {
      toast.error(cause instanceof ApiError ? cause.message : t('error.unavailable'))
      view.value = 'address'
    }
  } finally {
    if (version === navigationVersion) loading.value = false
  }
}

function newAddress(): void {
  navigationVersion += 1
  current.value = null
  view.value = 'address'
  if (location.pathname !== '/') history.pushState({}, '', '/')
}

async function unlock(): Promise<void> {
  unlocking.value = true
  try {
    const response = await api.unlock(unlockValue.value)
    saveAccessToken(response.accessToken)
    accessToken.value = response.accessToken
    unlockValue.value = ''
    unlockOpen.value = false
  } catch (cause) {
    toast.error(cause instanceof ApiError && cause.status === 401
      ? t('unlock.invalid')
      : t('unlock.failed'))
  } finally {
    unlocking.value = false
  }
}

async function lock(): Promise<void> {
  try {
    await api.lock(accessToken.value)
  } catch {
    // Lock locally even when the server cannot be reached.
  }
  clearAccessToken()
  accessToken.value = ''
}

async function loadSite(): Promise<void> {
  const version = ++siteVersion
  try {
    const value = await api.site()
    if (version === siteVersion) site.value = value
  } catch {
    // Site customization is optional; core mail remains available.
  }
}

function handlePopState(): void {
  void reconcileRoute()
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
  void loadSite()
  void reconcileRoute()
})

onBeforeUnmount(() => {
  navigationVersion += 1
  siteVersion += 1
  window.removeEventListener('popstate', handlePopState)
  cleanupSite()
})
</script>

<template>
  <div class="app-frame">
    <SandboxFrame
      v-if="site?.headerHtml"
      class="site-content-frame site-header-frame"
      :html="site.headerHtml"
      :css="site.contentCss"
      mode="content"
      :title="t('app.header')"
    />

    <AppHeader
      :app-name="site?.appName"
      :logo-data-url="site?.logoDataUrl"
      :show-locale-picker="view !== 'admin'"
      :show-unlock="view !== 'admin'"
      :access-token="accessToken"
      :unlocking="unlocking"
      v-model:unlock-open="unlockOpen"
      v-model:unlock-value="unlockValue"
      @home="newAddress"
      @unlock="unlock"
      @lock="lock"
    />

    <main>
      <SandboxFrame
        v-for="([name, html]) in adSlots"
        :key="name"
        class="site-content-frame ad-frame"
        :html="html"
        :css="site?.contentCss"
        mode="content"
        :title="t('app.content', { name })"
      />
      <AdminApp v-if="view === 'admin'" />

      <div v-else class="page" :class="{ 'inbox-page': view === 'inbox' }">
        <InboxView
          v-if="view === 'inbox' && current"
          :session="current"
          :fetch-seconds="site?.fetchSeconds ?? 20"
          @new-address="newAddress"
        />

        <section v-else-if="loading" class="handoff-loading" aria-live="polite">
          <span class="skeleton skeleton-label" />
          <span class="skeleton skeleton-title" />
          <span class="skeleton skeleton-field" />
          <span class="sr-only">{{ t('app.opening') }}</span>
        </section>

        <AddressPanel
          v-else
          :access-token="accessToken"
          @open="openCreatedInbox"
        />
      </div>
    </main>

    <section
      v-if="site?.cookieEnabled && site.cookieText"
      class="cookie-notice"
      role="status"
      :aria-label="t('app.cookie')"
    >
      {{ site.cookieText }}
    </section>

    <SandboxFrame
      v-if="site?.footerHtml"
      class="site-content-frame site-footer-frame"
      :html="site.footerHtml"
      :css="site.contentCss"
      mode="content"
      :title="t('app.footer')"
    />

    <ToastStack />
  </div>
</template>
