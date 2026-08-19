<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import type { IconName } from '../components/AppIcon.vue'
import type { AdminSettings } from '../types'
import AccessTab from './AccessTab.vue'
import ContentTab from './ContentTab.vue'
import DashboardTab from './DashboardTab.vue'
import DomainsTab from './DomainsTab.vue'
import GeneralTab from './GeneralTab.vue'
import MailServerTab from './MailServerTab.vue'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'

const tabs: Array<{ id: Tab; key: MessageKey; icon: IconName }> = [
  { id: 'dashboard', key: 'admin.dashboard', icon: 'layout-dashboard' },
  { id: 'general', key: 'admin.general', icon: 'sliders' },
  { id: 'mail', key: 'admin.mail', icon: 'server' },
  { id: 'domains', key: 'admin.domains', icon: 'globe' },
  { id: 'access', key: 'admin.access', icon: 'key' },
  { id: 'content', key: 'admin.content', icon: 'code-2' },
]
type Tab = 'dashboard' | 'general' | 'mail' | 'domains' | 'access' | 'content'
const { t } = useI18n()

const password = ref('')
const csrf = ref('')
const settings = ref<AdminSettings | null>(null)
const activeTab = ref<Tab>('dashboard')
const pending = ref(false)
const childBusy = ref(false)
const cleanupCsrf = ref('')
const error = ref('')

onMounted(async () => {
  try {
    const session = await api.admin.session()
    const loaded = await api.admin.settings()
    csrf.value = session.csrfToken
    settings.value = loaded
  } catch {
    // No valid cookie: keep showing the login form.
  }
})

function moveTab(event: KeyboardEvent, index: number): void {
  if (childBusy.value) return
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  const tab = tabs[next]
  if (!tab) return
  activeTab.value = tab.id
  const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')
  buttons?.[next]?.focus()
}

function selectTab(tab: Tab): void {
  if (!childBusy.value) activeTab.value = tab
}

function applyDomainSync(domains: string[], lastSync: AdminSettings['lastSync']): void {
  if (!settings.value) return
  settings.value = {
    ...settings.value,
    domains: [...domains],
    lastSync: { ...lastSync },
    lastSuccessfulSync: { ...lastSync },
  }
}

async function login(): Promise<void> {
  if (cleanupCsrf.value) return
  pending.value = true
  error.value = ''
  let newCsrf = ''
  try {
    const session = await api.admin.login(password.value)
    newCsrf = session.csrfToken
    const loaded = await api.admin.settings()
    csrf.value = newCsrf
    settings.value = loaded
    password.value = ''
  } catch (cause) {
    const loginError = cause instanceof Error ? cause.message : 'Could not sign in.'
    if (newCsrf) {
      try {
        await api.admin.logout(newCsrf)
      } catch (cleanupCause) {
        cleanupCsrf.value = newCsrf
        const detail = cleanupCause instanceof Error ? cleanupCause.message : 'Cleanup unavailable.'
        error.value = `${loginError} Session cleanup failed. ${detail}`
      }
    }
    csrf.value = ''
    settings.value = null
    if (!cleanupCsrf.value) error.value = loginError
  } finally {
    password.value = ''
    pending.value = false
  }
}

async function retryCleanup(): Promise<void> {
  const token = cleanupCsrf.value
  if (!token) return
  pending.value = true
  error.value = ''
  try {
    await api.admin.logout(token)
    cleanupCsrf.value = ''
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Cleanup unavailable.'
    error.value = `Session cleanup failed. ${detail}`
  } finally {
    pending.value = false
  }
}

async function logout(): Promise<void> {
  if (childBusy.value) return
  const token = csrf.value
  error.value = ''
  if (!token) return
  pending.value = true
  try {
    await api.admin.logout(token)
    csrf.value = ''
    settings.value = null
    activeTab.value = 'dashboard'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not log out.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section v-if="!settings" class="admin-login" aria-labelledby="admin-login-title">
    <div class="admin-login-panel panel">
      <p class="eyebrow">{{ t('admin.loginEyebrow') }}</p>
      <h1 id="admin-login-title">{{ t('admin.loginTitle') }}</h1>
      <p class="admin-note">{{ t('admin.loginNote') }}</p>
      <form class="settings-form" @submit.prevent="login">
        <div class="field"><label for="admin-password">{{ t('admin.password') }}</label><input id="admin-password" v-model="password" type="password" autocomplete="current-password" required autofocus :disabled="pending || Boolean(cleanupCsrf)"></div>
        <button class="primary-button" type="submit" :disabled="pending || Boolean(cleanupCsrf)">{{ pending ? t('admin.signingIn') : t('admin.signIn') }}</button>
        <button v-if="cleanupCsrf" class="secondary-button" type="button" :disabled="pending" @click="retryCleanup">{{ pending ? t('admin.retryingCleanup') : t('admin.cleanup') }}</button>
        <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
      </form>
    </div>
  </section>

  <div v-else class="admin-shell three-pane">
    <a class="skip-link" href="#admin-main-content">{{ t('a11y.skipToContent') }}</a>
    <aside class="admin-account-rail account-rail">
      <div class="api-status"><span class="pulse-dot" aria-hidden="true" /> {{ t('admin.apiStatus') }} <strong>{{ t('admin.healthy') }}</strong></div>
      <button class="rail-signout" type="button" :disabled="pending || childBusy" @click="logout">
        {{ pending ? t('admin.loggingOut') : t('admin.logout') }}
      </button>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </aside>

    <aside class="admin-sidebar">
      <div class="list-heading"><div><h2>{{ t('admin.settings') }}</h2><span>{{ t('admin.config') }}</span></div></div>
      <nav role="tablist" :aria-label="t('admin.sections')">
        <button
          v-for="(tab, index) in tabs"
          :id="`admin-tab-${index}`"
          :key="tab.id"
          role="tab"
          type="button"
          :disabled="childBusy"
          :aria-selected="activeTab === tab.id"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
          @keydown="moveTab($event, index)"
        >
          <AppIcon :name="tab.icon" />
          <span>{{ t(tab.key) }}</span>
        </button>
      </nav>
    </aside>

    <section id="admin-main-content" class="admin-content" tabindex="-1">
      <div role="tabpanel" tabindex="0" :aria-labelledby="`admin-tab-${tabs.findIndex((tab) => tab.id === activeTab)}`">
        <DashboardTab v-if="activeTab === 'dashboard'" />
        <GeneralTab v-else-if="activeTab === 'general'" :site="settings.site" :csrf="csrf" @busy="childBusy = $event" @updated="settings = $event" />
        <MailServerTab v-else-if="activeTab === 'mail'" :mail-server="settings.mailServer" :csrf="csrf" @busy="childBusy = $event" @updated="settings = $event" />
        <DomainsTab v-else-if="activeTab === 'domains'" :site="settings.site" :domains="settings.domains" :last-sync="settings.lastSync" :last-successful-sync="settings.lastSuccessfulSync" :last-sync-error="settings.lastSyncError" :csrf="csrf" @busy="childBusy = $event" @synced="applyDomainSync" @updated="settings = $event" />
        <AccessTab v-else-if="activeTab === 'access'" :csrf="csrf" @busy="childBusy = $event" />
        <ContentTab v-else :site="settings.site" :csrf="csrf" @busy="childBusy = $event" @updated="settings = $event" />
      </div>
    </section>
  </div>
</template>
