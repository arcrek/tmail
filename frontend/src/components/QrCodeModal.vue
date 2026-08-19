<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { generateQrMatrix } from '../qrcode'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { useToast } from '../toast'

const props = defineProps<{ address: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const toast = useToast()

const matrix = computed(() => generateQrMatrix(props.address))
const matrixSize = computed(() => matrix.value.length)

async function copy(): Promise<void> {
  try {
    await copyText(props.address)
    toast.success(t('address.copiedNotice'))
  } catch {
    toast.error(t('error.copy'))
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="qr-modal-backdrop" @click.self="emit('close')">
    <div
      class="qr-modal panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'qr-title'"
    >
      <div class="qr-modal-header">
        <h2 id="qr-title">{{ t('inbox.qrTitle') }}</h2>
        <button
          class="qr-close-button"
          type="button"
          :aria-label="t('toast.dismiss')"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </div>

      <p class="qr-help">{{ t('inbox.qrHelp') }}</p>

      <div class="qr-code-wrapper">
        <svg
          class="qr-svg"
          :viewBox="`0 0 ${matrixSize} ${matrixSize}`"
          shape-rendering="crispEdges"
          aria-hidden="true"
        >
          <rect width="100%" height="100%" fill="white" />
          <template v-for="(row, r) in matrix" :key="r">
            <template v-for="(cell, c) in row" :key="c">
              <rect
                v-if="cell"
                :x="c"
                :y="r"
                width="1"
                height="1"
                fill="black"
              />
            </template>
          </template>
        </svg>
      </div>

      <div class="qr-address-card">
        <span class="qr-address-text">{{ address }}</span>
        <button class="primary-button compact-button" type="button" @click="copy">
          <AppIcon name="copy" />
          {{ t('address.copy') }}
        </button>
      </div>
    </div>
  </div>
</template>
