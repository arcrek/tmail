<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DashboardResource } from '../types'
import { useI18n } from '../i18n'

const dashboard = ref<DashboardResource | null>(null)
const loading = ref(false)
const error = ref('')
const { t, formatNumber } = useI18n()

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
        {{ loading ? t('inbox.refreshing') : t('inbox.refresh') }}
      </button>
    </div>

    <div v-if="loading && !dashboard" class="metric-grid" aria-live="polite">
      <span v-for="index in 3" :key="index" class="skeleton metric-skeleton" />
      <span class="sr-only">{{ t('dashboard.loading') }}</span>
    </div>

    <template v-else-if="dashboard">
      <dl class="metric-grid">
        <div><dt>{{ t('dashboard.stored') }}</dt><dd>{{ formatNumber(dashboard.messages.stored) }}</dd></div>
        <div><dt>{{ t('dashboard.today') }}</dt><dd>{{ formatNumber(dashboard.messages.today) }}</dd></div>
        <div><dt>{{ t('dashboard.week') }}</dt><dd>{{ formatNumber(dashboard.messages.sevenDays) }}</dd></div>
      </dl>
    </template>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
