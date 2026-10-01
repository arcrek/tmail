<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { generateQrMatrix } from '../qrcode'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'

const props = defineProps<{ address: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
const copied = ref(false)
const copyError = ref('')
const copying = ref(false)

const matrix = computed(() => generateQrMatrix(props.address))
const matrixSize = computed(() => matrix.value.length)

async function copy(): Promise<void> {
  if (copying.value) return
  copying.value = true
  copied.value = false
  copyError.value = ''
  try {
    await copyText(props.address)
    copied.value = true
  } catch {
    copyError.value = t('error.copy')
  } finally {
    copying.value = false
  }
}

onMounted(() => dialog.value?.showModal?.())
onBeforeUnmount(() => dialog.value?.close?.())
</script>

<template>
  <dialog ref="dialog" class="qr-modal-backdrop" aria-labelledby="qr-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div
      class="qr-modal panel"
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
        <button class="primary-button compact-button" type="button" :disabled="copying" @click="copy">
          <AppIcon :name="copied ? 'check' : 'copy'" />
          {{ copied ? t('address.copied') : t('address.copy') }}
        </button>
        <span class="sr-only" role="status" aria-live="polite">{{ copied ? t('address.copiedNotice') : '' }}</span>
      </div>
      <p v-if="copyError" class="reader-error" role="alert">{{ copyError }}</p>
    </div>
  </dialog>
</template>
