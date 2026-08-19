<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import type { AdminSettings, AdminSiteSettings, SyncStatus } from '../types'
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const props = defineProps<{
  site: AdminSiteSettings
  domains: string[]
  lastSync: SyncStatus
  lastSuccessfulSync: SyncStatus
  lastSyncError: SyncStatus
  csrf: string
}>()
const emit = defineEmits<{
  updated: [settings: AdminSettings]
  busy: [value: boolean]
  synced: [domains: string[], lastSync: SyncStatus]
}>()

const draft = reactive({
  autoSyncDomains: props.site.autoSyncDomains,
  fetchSeconds: props.site.fetchSeconds,
  messageLimit: props.site.messageLimit,
  localPartMin: props.site.localPartMin,
  localPartMax: props.site.localPartMax,
  forbiddenIds: props.site.forbiddenIds.join('\n'),
  blockedSenderDomains: props.site.blockedSenderDomains.join('\n'),
  blacklistedDomains: props.site.blacklistedDomains.join('\n'),
})
const manualDomain = ref('')
const displayedDomains = ref([...props.domains])
const displayedSync = ref({ ...props.lastSync })
const displayedSuccessfulSync = ref({ ...props.lastSuccessfulSync })
const displayedSyncError = ref({ ...props.lastSyncError })
const pending = ref(false)
const syncing = ref(false)
const { t, formatDate, formatNumber } = useI18n()
const toast = useToast()

watch([pending, syncing], ([saving, synchronizing]) => emit('busy', saving || synchronizing))

watch(() => props.site, (value) => {
  if (!pending.value && !syncing.value) Object.assign(draft, {
    autoSyncDomains: value.autoSyncDomains,
    fetchSeconds: value.fetchSeconds,
    messageLimit: value.messageLimit,
    localPartMin: value.localPartMin,
    localPartMax: value.localPartMax,
    forbiddenIds: value.forbiddenIds.join('\n'),
    blockedSenderDomains: value.blockedSenderDomains.join('\n'),
    blacklistedDomains: value.blacklistedDomains.join('\n'),
  })
})
watch(() => props.domains, (value) => { if (!pending.value && !syncing.value) displayedDomains.value = [...value] })
watch(() => props.lastSync, (value) => { if (!pending.value && !syncing.value) displayedSync.value = { ...value } })
watch(() => props.lastSuccessfulSync, (value) => { if (!pending.value && !syncing.value) displayedSuccessfulSync.value = { ...value } })
watch(() => props.lastSyncError, (value) => { if (!pending.value && !syncing.value) displayedSyncError.value = { ...value } })

function list(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}

function dateTime(value?: string): string {
  return value ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('domains.notYet')
}

function syncText(value: SyncStatus, empty: string): string {
  if (!value.created_at) return empty
  return `${value.detail || t('domains.noDetail')}, ${dateTime(value.created_at)}`
}

function applySettings(settings: AdminSettings, replaceDomains: boolean): void {
  if (replaceDomains) displayedDomains.value = [...settings.domains]
  displayedSync.value = { ...settings.lastSync }
  displayedSuccessfulSync.value = { ...settings.lastSuccessfulSync }
  displayedSyncError.value = { ...settings.lastSyncError }
}

async function changeAutoSync(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const previous = draft.autoSyncDomains
  if (!input.checked && !window.confirm(t('domains.confirm'))) {
    input.checked = previous
    return
  }
  const checked = input.checked
  draft.autoSyncDomains = checked
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: { autoSyncDomains: checked } }, props.csrf)
    draft.autoSyncDomains = settings.site.autoSyncDomains
    input.checked = settings.site.autoSyncDomains
    emit('updated', settings)
    applySettings(settings, true)
    toast.success(t('domains.autoStatus', { status: t(settings.site.autoSyncDomains ? 'domains.enabled' : 'domains.disabled') }))
  } catch (cause) {
    draft.autoSyncDomains = previous
    input.checked = previous
    toast.error(cause instanceof Error ? cause.message : t('error.syncUpdate'))
  } finally {
    pending.value = false
  }
}

async function save(): Promise<void> {
  if (draft.localPartMin > draft.localPartMax) {
    toast.error(t('domains.localRange'))
    return
  }
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: {
      autoSyncDomains: draft.autoSyncDomains,
      fetchSeconds: draft.fetchSeconds,
      messageLimit: draft.messageLimit,
      localPartMin: draft.localPartMin,
      localPartMax: draft.localPartMax,
      forbiddenIds: list(draft.forbiddenIds),
      blockedSenderDomains: list(draft.blockedSenderDomains),
      blacklistedDomains: list(draft.blacklistedDomains),
    } }, props.csrf)
    emit('updated', settings)
    applySettings(settings, true)
    toast.success(t('domains.saved'))
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.domains'))
  } finally {
    pending.value = false
  }
}

async function addManualDomain(): Promise<void> {
  const domain = manualDomain.value.trim()
  if (!domain) return
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: {
      manualDomains: [...props.site.manualDomains, domain],
    } }, props.csrf)
    manualDomain.value = ''
    emit('updated', settings)
    applySettings(settings, true)
    toast.success(t('domains.added'))
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.domains'))
  } finally {
    pending.value = false
  }
}

async function removeDomain(domain: string): Promise<void> {
  const manual = props.site.manualDomains.includes(domain)
  pending.value = true
  try {
    const settings = await api.admin.updateSettings({ site: manual
      ? { manualDomains: props.site.manualDomains.filter((value) => value !== domain) }
      : { blacklistedDomains: [...new Set([...props.site.blacklistedDomains, domain])] }
    }, props.csrf)
    emit('updated', settings)
    applySettings(settings, true)
    toast.success(manual ? t('domains.removed') : t('domains.hidden'))
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('error.domains'))
  } finally {
    pending.value = false
  }
}

async function syncNow(): Promise<void> {
  syncing.value = true
  try {
    try {
      const result = await api.admin.syncDomains(props.csrf)
      displayedDomains.value = [...result.domains]
      displayedSync.value = { ...result.lastSync }
      displayedSuccessfulSync.value = { ...result.lastSync }
      emit('synced', result.domains, result.lastSync)
      toast.success(t('domains.complete', { count: formatNumber(result.domains.length) }))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('error.sync'))
      try {
        const settings = await api.admin.settings()
        emit('updated', settings)
        applySettings(settings, false)
      } catch {
        // Keep the sync error and last known whitelist when refresh also fails.
      }
      return
    }

    try {
      const settings = await api.admin.settings()
      emit('updated', settings)
      applySettings(settings, true)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : t('error.settingsRefresh')
      toast.error(t('error.domainsSynced', { detail }))
    }
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <section class="admin-section" aria-labelledby="domains-title">
    <div class="admin-section-heading">
      <div>
        <p class="eyebrow">{{ t('domains.eyebrow') }}</p>
        <h1 id="domains-title">{{ t('admin.domains') }}</h1>
      </div>
      <button class="secondary-button compact-button" type="button" :disabled="syncing || pending" @click="syncNow">
        <AppIcon name="refresh-cw" :class="{ spinning: syncing }" />
        <span>{{ syncing ? t('domains.syncing') : t('domains.sync') }}</span>
      </button>
    </div>

    <div class="admin-data-grid domains-overview">
      <section aria-labelledby="whitelist-title" class="settings-card panel">
        <div class="card-header-with-badge">
          <h2 id="whitelist-title" class="card-title">{{ t('domains.whitelist') }}</h2>
          <span class="count-badge">{{ displayedDomains.length }}</span>
        </div>
        <ul class="domain-list">
          <li v-for="domain in displayedDomains" :key="domain" class="domain-list-item">
            <span class="domain-name font-mono">{{ domain }}</span>
            <button class="secondary-button compact-button" type="button" :disabled="pending || syncing" :aria-label="t('domains.remove', { domain })" @click="removeDomain(domain)">
              {{ t('domains.removeText') }}
            </button>
          </li>
          <li v-if="!displayedDomains.length" class="empty-domain-message">{{ t('domains.none') }}</li>
        </ul>
      </section>

      <section class="sync-summary settings-card panel" aria-labelledby="last-sync-title">
        <h2 id="last-sync-title" class="card-title">{{ t('domains.lastSync') }}</h2>
        <dl class="sync-details-list">
          <div class="sync-detail-row">
            <dt>{{ t('domains.time') }}</dt>
            <dd class="font-mono">{{ dateTime(displayedSync.created_at) }}</dd>
          </div>
          <div class="sync-detail-row">
            <dt>{{ t('domains.result') }}</dt>
            <dd>
              <span class="status-pill" :class="displayedSync.success === true ? 'pill-success' : displayedSync.success === false ? 'pill-error' : 'pill-neutral'">
                {{ displayedSync.success === undefined ? t('domains.notYet') : displayedSync.success ? t('domains.success') : t('domains.failed') }}
              </span>
            </dd>
          </div>
          <div class="sync-detail-row">
            <dt>{{ t('domains.detail') }}</dt>
            <dd>{{ displayedSync.detail || t('domains.noDetail') }}</dd>
          </div>
          <div class="sync-detail-row">
            <dt>{{ t('domains.lastSuccess') }}</dt>
            <dd class="font-mono">{{ syncText(displayedSuccessfulSync, t('domains.notYet')) }}</dd>
          </div>
          <div class="sync-detail-row">
            <dt>{{ t('domains.lastError') }}</dt>
            <dd :class="{ 'status-error': displayedSyncError.created_at }" class="font-mono">{{ syncText(displayedSyncError, t('domains.noDetail')) }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <form class="settings-form" @submit.prevent="addManualDomain">
      <fieldset class="settings-fields" :disabled="pending || syncing">
        <div class="settings-card panel">
          <h2 class="card-title">Add Whitelist Domain</h2>
          <div class="field">
            <label for="manual-domain">{{ t('address.domain') }}</label>
            <div class="form-actions inline-add-row">
              <input id="manual-domain" v-model="manualDomain" name="manualDomain" type="text" inputmode="url" autocomplete="off" autocapitalize="none" class="font-mono" required>
              <button class="secondary-button compact-button" type="submit">{{ t('domains.add') }}</button>
            </div>
            <small>{{ t('domains.addHelp') }}</small>
          </div>
        </div>
      </fieldset>
    </form>

    <form class="settings-form" @submit.prevent="save">
      <fieldset class="settings-fields" :disabled="pending || syncing">
        <div class="settings-card panel">
          <h2 class="card-title">Domain Sync & Policy Configuration</h2>
          <label class="check-field margin-bottom-md">
            <input :checked="draft.autoSyncDomains" name="autoSyncDomains" type="checkbox" @change="changeAutoSync">
            <span>{{ t('domains.auto') }}</span>
          </label>
          <div class="settings-grid">
            <div class="field">
              <label for="fetch-seconds">{{ t('domains.poll') }}</label>
              <input id="fetch-seconds" v-model.number="draft.fetchSeconds" name="fetchSeconds" type="number" min="10" max="300" required>
            </div>
            <div class="field">
              <label for="message-limit">{{ t('domains.limit') }}</label>
              <input id="message-limit" v-model.number="draft.messageLimit" name="messageLimit" type="number" min="1" max="100" required>
            </div>
            <div class="field">
              <label for="local-min">{{ t('domains.min') }}</label>
              <input id="local-min" v-model.number="draft.localPartMin" name="localPartMin" type="number" min="1" max="64" required>
            </div>
            <div class="field">
              <label for="local-max">{{ t('domains.max') }}</label>
              <input id="local-max" v-model.number="draft.localPartMax" name="localPartMax" type="number" min="1" max="64" required>
            </div>
          </div>

          <div class="settings-grid settings-grid-three margin-top-md">
            <div class="field">
              <label for="forbidden-ids">{{ t('domains.forbidden') }}</label>
              <textarea id="forbidden-ids" v-model="draft.forbiddenIds" name="forbiddenIds" rows="7" class="font-mono" />
              <small>{{ t('domains.listHelp') }}</small>
            </div>
            <div class="field">
              <label for="blocked-senders">{{ t('domains.blocked') }}</label>
              <textarea id="blocked-senders" v-model="draft.blockedSenderDomains" name="blockedSenderDomains" rows="7" class="font-mono" />
              <small>{{ t('domains.listHelp') }}</small>
            </div>
            <div class="field">
              <label for="blacklisted-domains">{{ t('domains.blacklisted') }}</label>
              <textarea id="blacklisted-domains" v-model="draft.blacklistedDomains" name="blacklistedDomains" rows="7" class="font-mono" />
              <small>{{ t('domains.blacklistHelp') }}</small>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="primary-button" type="submit" :disabled="pending || syncing">
            {{ pending ? t('reader.saving') : t('domains.save') }}
          </button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
