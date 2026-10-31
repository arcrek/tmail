<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import type { DashboardResource } from '../types'
import { useI18n } from '../i18n'

const emit = defineEmits<{ attention: [count: number]; 'open-domains': [] }>()

const dashboard = ref<DashboardResource | null>(null)
const loadedAt = ref<Date | null>(null)
const loading = ref(false)
const error = ref('')
const { t, locale, formatDate, formatNumber } = useI18n()

const mxFailures24h = computed(() => dashboard.value?.domains.mxFailures24h ?? 0)
// True only while the latest request succeeded; a failed refresh must not keep claiming a live mail server.
const connected = ref(false)

const sync = computed(() => {
  const last = dashboard.value?.lastSync
  if (!last?.created_at) return { state: 'never' as const, label: t('dashboard.syncNever') }
  if (last.success === false) return { state: 'failed' as const, label: t('dashboard.syncFailed') }
  return { state: 'ok' as const, label: t('dashboard.syncOk', { time: relativeTime(last.created_at) }) }
})

function relativeTime(value: string): string {
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return value
  const seconds = Math.round((at - (loadedAt.value?.valueOf() ?? Date.now())) / 1000)
  const format = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(seconds, 'second')
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86400), 'day')
}

function failureKind(kind: string): string {
  return t(kind === 'mx_mismatch' ? 'dashboard.mxMismatch' : 'dashboard.mxLookupError')
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    dashboard.value = await api.admin.dashboard()
    loadedAt.value = new Date()
    connected.value = true
    emit('attention', mxFailures24h.value)
  } catch (cause) {
    connected.value = false
    error.value = cause instanceof Error ? cause.message : t('error.dashboard')
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="admin-section dashboard" aria-labelledby="dashboard-title">
    <div class="admin-section-heading">
      <div class="admin-title-block">
        <h1 id="dashboard-title">{{ t('admin.dashboard') }}</h1>
        <span v-if="loadedAt" class="admin-subtitle">
          {{ t('dashboard.updatedAt', { time: formatDate(loadedAt.toISOString(), { timeStyle: 'short' }) }) }}
        </span>
      </div>
      <button class="tonal-button" type="button" :disabled="loading" @click="refresh">
        <AppIcon name="refresh-cw" :class="{ spinning: loading }" />
        <span>{{ loading ? t('inbox.refreshing') : t('inbox.refresh') }}</span>
      </button>
    </div>

    <div v-if="loading && !dashboard" class="metric-grid" aria-live="polite">
      <span v-for="index in 3" :key="index" class="skeleton metric-skeleton" />
      <span class="sr-only">{{ t('dashboard.loading') }}</span>
    </div>

    <template v-else-if="dashboard">
      <ul class="status-chips" :aria-label="t('dashboard.status')">
        <li class="status-chip" :class="{ 'status-chip-error': !connected }">
          <AppIcon :name="connected ? 'check' : 'alert-triangle'" :class="{ 'status-ok': connected }" />
          {{ connected ? t('dashboard.mailConnected') : t('dashboard.mailUnreachable') }}
        </li>
        <li class="status-chip" :class="{ 'status-chip-error': sync.state === 'failed' }">
          <AppIcon :name="sync.state === 'ok' ? 'check' : 'alert-triangle'" :class="{ 'status-ok': sync.state === 'ok' }" />
          {{ sync.label }}
        </li>
        <li class="status-chip" :class="{ 'status-chip-error': mxFailures24h }">
          <AppIcon :name="mxFailures24h ? 'alert-triangle' : 'check'" :class="{ 'status-ok': !mxFailures24h }" />
          {{ mxFailures24h ? t('dashboard.mxErrors24h', { count: formatNumber(mxFailures24h) }) : t('dashboard.mxClear24h') }}
        </li>
      </ul>

      <div class="kpi-cards">
        <section class="kpi-card" aria-labelledby="kpi-mail-title">
          <div class="kpi-card-heading">
            <span class="kpi-icon kpi-icon-primary" aria-hidden="true"><AppIcon name="mail" /></span>
            <h2 id="kpi-mail-title">{{ t('dashboard.mailCard') }}</h2>
          </div>
          <dl class="kpi-stats">
            <div><dt>{{ t('dashboard.stored') }}</dt><dd>{{ formatNumber(dashboard.messages.stored) }}</dd></div>
            <div><dt>{{ t('dashboard.today') }}</dt><dd>{{ formatNumber(dashboard.messages.today) }}</dd></div>
            <div><dt>{{ t('dashboard.week') }}</dt><dd>{{ formatNumber(dashboard.messages.sevenDays) }}</dd></div>
          </dl>
        </section>
        <section class="kpi-card" aria-labelledby="kpi-domain-title">
          <div class="kpi-card-heading">
            <span class="kpi-icon kpi-icon-secondary" aria-hidden="true"><AppIcon name="globe" /></span>
            <h2 id="kpi-domain-title">{{ t('dashboard.domainCard') }}</h2>
          </div>
          <dl class="kpi-stats">
            <div><dt>{{ t('dashboard.domainsActive') }}</dt><dd>{{ formatNumber(dashboard.domains.active) }}</dd></div>
            <div><dt>{{ t('dashboard.domainsToday') }}</dt><dd>{{ formatNumber(dashboard.domains.domainsToday) }}</dd></div>
            <div><dt>{{ t('dashboard.domainsWeek') }}</dt><dd>{{ formatNumber(dashboard.domains.domainsSevenDays) }}</dd></div>
          </dl>
        </section>
      </div>

      <section class="mx-failures-panel" aria-labelledby="mx-failures-title">
        <div class="mx-failures-header">
          <h2 id="mx-failures-title">{{ t('dashboard.mxFailures') }}</h2>
          <button class="text-button" type="button" @click="emit('open-domains')">{{ t('dashboard.viewDomains') }}</button>
        </div>
        <div v-if="dashboard.domains.recentMxFailures.length" class="mx-table-scroll">
          <table class="mx-table">
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.colDomain') }}</th>
                <th scope="col">{{ t('dashboard.colKind') }}</th>
                <th scope="col">{{ t('dashboard.colTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="failure in dashboard.domains.recentMxFailures" :key="`${failure.created_at}-${failure.domain}-${failure.kind}`">
                <td class="mx-failure-domain">{{ failure.domain }}</td>
                <td>
                  <span class="mx-failure-badge" :class="failure.kind === 'mx_mismatch' ? 'badge-amber' : 'badge-red'" :title="failure.detail || undefined">
                    <AppIcon name="alert-triangle" />
                    {{ failureKind(failure.kind) }}
                  </span>
                </td>
                <td class="mx-failure-time">
                  <time :datetime="failure.created_at">{{ formatDate(failure.created_at, { dateStyle: 'medium', timeStyle: 'short' }) }}</time>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="mx-empty-state">
          <AppIcon name="check-circle" class="empty-check-icon" />
          <span>{{ t('dashboard.mxFailuresEmpty') }}</span>
        </p>
      </section>
    </template>

    <p v-if="error" class="dashboard-error" role="alert">{{ error }}</p>
  </section>
</template>
