<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '../theme'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'

const { resolved, toggle } = useTheme()
const { t } = useI18n()

const label = computed(() =>
  resolved.value === 'dark' ? t('theme.light') : t('theme.dark'),
)
const icon = computed(() => (resolved.value === 'dark' ? 'sun' : 'moon'))
</script>

<template>
  <button type="button" class="theme-toggle" :aria-label="label" @click="toggle">
    <AppIcon :name="icon" />
  </button>
</template>
