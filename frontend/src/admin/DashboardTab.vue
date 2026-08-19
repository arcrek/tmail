<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import AppIcon from '../components/AppIcon.vue'
import type { DashboardResource } from '../types'
import { useI18n } from '../i18n'

const dashboard = ref<DashboardResource | null>(null)
const loading = ref(false)
const error = ref('')
const { t, formatDate, formatNumber } = useI18n()

function failureKind(kind: string): string {
  return t(kind === 'mx_mismatch' ? 'dashboard.mxMismatch' : 'dashboard.mxLookupError')
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    dashboard.value = await api.admin.dashboard()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.dashboard')
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="admin-section" aria-labelledby="dashboard-title">
    <div class="admin-section-heading">
      <div>
        <p class="eyebrow">{{ t('dashboard.eyebrow') }}</p>
        <h1 id="dashboard-title">{{ t('admin.dashboard') }}</h1>
      </div>
      <button class="secondary-button compact-button" type="button" :disabled="loading" @click="refresh">
        <AppIcon name="refresh-cw" :class="{ spinning: loading }" />
        <span>{{ loading ? t('inbox.refreshing') : t('inbox.refresh') }}</span>
      </button>
    </div>

    <div v-if="loading && !dashboard" class="metric-grid" aria-live="polite">
      <span v-for="index in 3" :key="index" class="skeleton metric-skeleton" />
      <span class="sr-only">{{ t('dashboard.loading') }}</span>
    </div>

    <template v-else-if="dashboard">
      <div class="dashboard-kpi-container">
        <h2 class="sr-only">Key Performance Indicators</h2>
        <dl class="metric-grid">
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.stored') }}</dt>
              <AppIcon name="mail" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.messages.stored) }}</dd>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.today') }}</dt>
              <AppIcon name="clock" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.messages.today) }}</dd>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.week') }}</dt>
              <AppIcon name="sparkles" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.messages.sevenDays) }}</dd>
          </div>
        </dl>

        <dl class="metric-grid">
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.domainsActive') }}</dt>
              <AppIcon name="globe" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.domains.active) }}</dd>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.domainsToday') }}</dt>
              <AppIcon name="plus" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.domains.domainsToday) }}</dd>
          </div>
          <div class="metric-card">
            <div class="metric-header">
              <dt>{{ t('dashboard.domainsWeek') }}</dt>
              <AppIcon name="shield" class="metric-icon" />
            </div>
            <dd class="metric-value">{{ formatNumber(dashboard.domains.domainsSevenDays) }}</dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="mx-failures-title" class="mx-failures-panel panel">
        <div class="mx-failures-header">
          <h2 id="mx-failures-title">{{ t('dashboard.mxFailures') }}</h2>
          <span v-if="dashboard.domains.recentMxFailures.length" class="mx-count-badge">
            {{ dashboard.domains.recentMxFailures.length }}
          </span>
        </div>
        <ul class="domain-list mx-failures-list">
          <li v-for="failure in dashboard.domains.recentMxFailures" :key="`${failure.created_at}-${failure.domain}-${failure.kind}`" class="mx-failure-item">
            <div class="mx-failure-info">
              <span class="mx-failure-domain">{{ failure.domain }}</span>
              <span class="mx-failure-badge" :class="failure.kind === 'mx_mismatch' ? 'badge-amber' : 'badge-red'">
                <AppIcon name="alert-triangle" />
                {{ failureKind(failure.kind) }}
              </span>
            </div>
            <time :datetime="failure.created_at" class="mx-failure-time">{{ formatDate(failure.created_at, { dateStyle: 'medium', timeStyle: 'short' }) }}</time>
          </li>
          <li v-if="!dashboard.domains.recentMxFailures.length" class="mx-empty-state">
            <AppIcon name="check" class="empty-check-icon" />
            <span>{{ t('dashboard.mxFailuresEmpty') }}</span>
          </li>
        </ul>
      </section>
    </template>

    <p v-if="error" class="dashboard-error" role="alert">{{ error }}</p>
  </section>
</template>
