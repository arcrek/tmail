<script setup lang="ts">
import { useI18n } from '../i18n'

defineProps<{ inputId: string; accessToken: string; unlocking: boolean }>()
const emit = defineEmits<{ unlock: []; lock: [] }>()
const unlockOpen = defineModel<boolean>('unlockOpen', { required: true })
const unlockValue = defineModel<string>('unlockValue', { required: true })
const { t } = useI18n()
</script>

<template>
  <template v-if="accessToken">
    <span aria-live="polite">{{ t('unlock.unlocked') }}</span>
    <button class="text-button" type="button" @click="emit('lock')">{{ t('unlock.lock') }}</button>
  </template>
  <template v-else>
    <button class="text-button" type="button" @click="unlockOpen = !unlockOpen">
      {{ t('unlock.open') }}
    </button>
    <form v-if="unlockOpen" class="field" @submit.prevent="emit('unlock')">
      <label :for="inputId">{{ t('unlock.credential') }}</label>
      <input
        :id="inputId"
        v-model="unlockValue"
        type="text"
        name="access-credential"
        :placeholder="t('unlock.placeholder')"
        autocomplete="off"
      >
      <button class="text-button" type="submit" :disabled="unlocking || !unlockValue">
        {{ unlocking ? t('unlock.unlocking') : t('unlock.submit') }}
      </button>
      <button class="text-button" type="button" :disabled="unlocking" @click="unlockOpen = false">
        {{ t('unlock.cancel') }}
      </button>
    </form>
  </template>
</template>
