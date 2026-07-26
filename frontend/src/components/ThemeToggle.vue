<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '../theme'
import AppIcon from './AppIcon.vue'

const { resolved, toggle } = useTheme()

const label = computed(() =>
  resolved.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)
const icon = computed(() => (resolved.value === 'dark' ? 'sun' : 'moon'))
</script>

<template>
  <button type="button" class="theme-toggle" :aria-label="label" @click="toggle">
    <AppIcon :name="icon" />
  </button>
</template>
