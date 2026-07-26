<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeToggle from './ThemeToggle.vue'

withDefaults(defineProps<{
  appName?: string
  logoDataUrl?: string
}>(), { appName: 'Temporary Inbox', logoDataUrl: '' })

const emit = defineEmits<{ home: [] }>()

function onBrandClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('home')
}
</script>

<template>
  <header class="app-header">
    <a class="brand" href="/" @click="onBrandClick">
      <img v-if="logoDataUrl" :src="logoDataUrl" alt="">
      <span>{{ appName }}</span>
    </a>

    <nav class="app-header-nav" aria-label="Site navigation">
      <a href="/docs">
        <AppIcon name="external-link" />
        API docs
      </a>
      <a class="admin-link" href="/admin">
        <AppIcon name="shield" />
        Admin
      </a>
      <ThemeToggle />
    </nav>
  </header>
</template>
