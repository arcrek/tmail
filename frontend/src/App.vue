<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AddressPanel from './components/AddressPanel.vue'
import AppHeader from './components/AppHeader.vue'
import BulkGenerateView from './components/BulkGenerateView.vue'
import BulkCodeView from './components/BulkCodeView.vue'
import InboxView from './components/InboxView.vue'
import SandboxFrame from './components/SandboxFrame.vue'
import ToastStack from './components/ToastStack.vue'
import AdminApp from './admin/AdminApp.vue'
import { ApiError, api } from './api'
import { clearAccessToken, loadAccessToken, saveAccessToken } from './access'
import { parseRoute } from './route'
import { loadSessions, removeSession, saveSession } from './session'
import { authorizationFailed, openMailbox, validPassword } from './mailbox-access'
import MailboxPasswordDialog from './components/MailboxPasswordDialog.vue'
import type { AddressSession, SiteResource } from './types'
import { setSiteLocale, useI18n } from './i18n'
import { useToast } from './toast'

type View = 'address' | 'inbox' | 'admin' | 'bulk' | 'bulkCode'

const initialRoute = parseRoute(window.location.pathname)
const view = ref<View>(initialRoute.name === 'admin' ? 'admin' : 'address')
const current = ref<AddressSession | null>(null)
const loginAddress = ref('')
const mailboxPassword = ref('')
const loginError = ref('')
const loginPending = ref(false)
const passwordSession = ref<AddressSession | null>(null)
const site = ref<SiteResource | null>(null)
const loading = ref(initialRoute.name === 'address')
const toast = useToast()
const accessToken = ref(loadAccessToken())
const unlocking = ref(false)
const unlockOpen = ref(false)
const unlockValue = ref('')
let navigationVersion = 0
let pendingMailboxAddress = ''
let pendingSavedToken: string | undefined
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
  loginAddress.value = ''
  mailboxPassword.value = ''
  openInbox(session)
}

function promptMailbox(address: string, error = ''): void {
  navigationVersion += 1
  current.value = null
  loading.value = false
  loginPending.value = false
  loginAddress.value = address
  pendingMailboxAddress = ''
  mailboxPassword.value = ''
  loginError.value = error
  view.value = 'address'
  const path = `/${encodeURIComponent(address)}`
  if (location.pathname !== path) history.pushState({}, '', path)
}

async function enterMailbox(address: string, password?: string): Promise<void> {
  const version = ++navigationVersion
  pendingMailboxAddress = address
  pendingSavedToken = loadSessions().find((saved) => saved.address === address)?.token
  current.value = null
  loading.value = password === undefined
  loginPending.value = password !== undefined
  try {
    const session = await openMailbox(address, accessToken.value || undefined, password)
    if (version === navigationVersion) {
      loginAddress.value = ''
      openInbox(session, false)
    }
  } catch (cause) {
    if (version !== navigationVersion) return
    if (authorizationFailed(cause)) promptMailbox(address, password === undefined ? t('password.required') : t('password.invalid'))
    else if (loginAddress.value) loginError.value = cause instanceof ApiError ? cause.message : t('error.unavailable')
    else toast.error(cause instanceof ApiError ? cause.message : t('error.unavailable'))
  } finally {
    if (version === navigationVersion) {
      loading.value = false
      loginPending.value = false
      pendingMailboxAddress = ''
    }
  }
}

async function signInMailbox(): Promise<void> {
  if (loginPending.value) return
  if (!validPassword(mailboxPassword.value)) {
    loginError.value = t('password.length')
    return
  }
  const password = mailboxPassword.value
  mailboxPassword.value = ''
  await enterMailbox(loginAddress.value, password)
}

function invalidateMailbox(preserveDialog = false): void {
  const session = current.value ?? passwordSession.value
  if (!session) return
  if (loadSessions().find((saved) => saved.address === session.address)?.token === session.token) removeSession(session.address)
  if (!preserveDialog) passwordSession.value = null
  promptMailbox(session.address, t('password.changed'))
}

function updatePassword(session: AddressSession): void {
  passwordSession.value = null
  openCreatedInbox(session)
  toast.success(t('password.saved'))
}

async function logoutMailbox(): Promise<void> {
  const session = current.value
  if (!session) return
  removeSession(session.address)
  promptMailbox(session.address)
  try {
    if (session.accessKind === 'admin' && session.csrf) await api.admin.logout(session.csrf)
    else if (session.accessKind !== 'public') await api.logout(session.token)
    toast.success(t('password.loggedOut'))
  } catch {
    toast.error(t('password.logoutUnconfirmed'))
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== 'tmail.addresses' && event.key !== null) return
  const session = current.value
  if (!session) {
    if (pendingMailboxAddress && loadSessions().find((saved) => saved.address === pendingMailboxAddress)?.token !== pendingSavedToken) {
      passwordSession.value = null
      promptMailbox(pendingMailboxAddress, t('password.changed'))
    }
    return
  }
  if (session.accessKind === 'public' || session.accessKind === 'admin') return
  const saved = loadSessions().find((value) => value.address === session.address)
  if (saved?.token === session.token) return
  passwordSession.value = null
  promptMailbox(session.address, t('password.changed'))
  if (saved) void enterMailbox(session.address)
}

async function reconcileRoute(): Promise<void> {
  ++navigationVersion
  pendingMailboxAddress = ''
  const route = parseRoute(window.location.pathname)
  passwordSession.value = null
  loginAddress.value = ''
  mailboxPassword.value = ''
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

  view.value = 'address'
  await enterMailbox(route.address)
}

function newAddress(): void {
  navigationVersion += 1
  pendingMailboxAddress = ''
  loading.value = false
  current.value = null
  passwordSession.value = null
  loginAddress.value = ''
  mailboxPassword.value = ''
  view.value = 'address'
  if (location.pathname !== '/') history.pushState({}, '', '/')
}

function openBulk(): void {
  navigationVersion += 1
  pendingMailboxAddress = ''
  current.value = null
  passwordSession.value = null
  view.value = 'bulk'
}

function openBulkCode(): void {
  navigationVersion += 1
  pendingMailboxAddress = ''
  current.value = null
  passwordSession.value = null
  view.value = 'bulkCode'
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

function handleAdminLogout(): void {
  if (current.value?.accessKind === 'admin') invalidateMailbox()
}

function handlePopState(): void {
  void reconcileRoute()
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
  window.addEventListener('storage', handleStorage)
  window.addEventListener('tmail-admin-logout', handleAdminLogout)
  void loadSite()
  void reconcileRoute()
})

onBeforeUnmount(() => {
  navigationVersion += 1
  siteVersion += 1
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('tmail-admin-logout', handleAdminLogout)
  cleanupSite()
})
</script>

<template>
  <div class="app-frame">
    <a class="skip-link" href="#main-content">{{ t('a11y.skipToContent') }}</a>
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
      :bulk-active="view === 'bulk'"
      :bulk-code-active="view === 'bulkCode'"
      :home-active="view === 'address' || view === 'inbox'"
      :admin-active="view === 'admin'"
      v-model:unlock-open="unlockOpen"
      v-model:unlock-value="unlockValue"
      @home="newAddress"
      @unlock="unlock"
      @lock="lock"
      @bulk="openBulk"
      @bulk-code="openBulkCode"
    />

    <main id="main-content" tabindex="-1">
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
          :access-token="accessToken"
          :fetch-seconds="site?.fetchSeconds ?? 5"
          @create="openCreatedInbox"
          @login="promptMailbox"
          @invalid="invalidateMailbox(Boolean(passwordSession))"
          @manage="passwordSession = current"
          @logout="logoutMailbox"
        />

        <BulkGenerateView
          v-else-if="view === 'bulk'"
          :access-token="accessToken"
        />

        <BulkCodeView
          v-else-if="view === 'bulkCode'"
          :access-token="accessToken"
          :fetch-seconds="site?.fetchSeconds ?? 5"
        />

        <section v-else-if="loading" class="handoff-loading" aria-live="polite">
          <span class="skeleton skeleton-label" />
          <span class="skeleton skeleton-title" />
          <span class="skeleton skeleton-field" />
          <span class="sr-only">{{ t('app.opening') }}</span>
        </section>

        <section v-else-if="loginAddress" class="panel mailbox-login" aria-labelledby="mailbox-login-title">
          <h1 id="mailbox-login-title">{{ t('password.login') }}</h1>
          <p class="mailbox-address">{{ loginAddress }}</p>
          <form class="settings-form" @submit.prevent="signInMailbox">
            <input type="hidden" name="username" autocomplete="username" :value="loginAddress">
            <div class="field">
              <label for="mailbox-login-password">{{ t('password.label') }}</label>
              <input id="mailbox-login-password" v-model="mailboxPassword" type="password" name="password" autocomplete="current-password" required :disabled="loginPending" :aria-invalid="Boolean(loginError)" aria-describedby="mailbox-login-error mailbox-login-help">
            </div>
            <p id="mailbox-login-help">{{ t('password.length') }}</p>
            <p id="mailbox-login-error" role="alert" class="reader-error">{{ loginError }}</p>
            <button class="primary-button" type="submit" :disabled="loginPending">{{ loginPending ? t('password.busy') : t('password.submit') }}</button>
            <button class="text-button" type="button" :disabled="loginPending" @click="enterMailbox(loginAddress)">{{ t('password.retry') }}</button>
          </form>
        </section>

        <AddressPanel
          v-else
          :access-token="accessToken"
          @open="openCreatedInbox"
          @login="promptMailbox"
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

    <MailboxPasswordDialog v-if="passwordSession" :session="passwordSession" @close="passwordSession = null" @updated="updatePassword" @invalid="invalidateMailbox" @replacing="invalidateMailbox(true)" />
    <ToastStack />
  </div>
</template>
