import { readonly, ref } from 'vue'

export type ToastKind = 'success' | 'error'
export interface ToastEntry { id: number; kind: ToastKind; message: string }

const DURATION_MS = 5000
const toasts = ref<ToastEntry[]>([])
let nextId = 0

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((entry) => entry.id !== id)
}

function push(kind: ToastKind, message: string): void {
  if (!message) return
  const id = ++nextId
  toasts.value = [...toasts.value, { id, kind, message }]
  setTimeout(() => dismiss(id), DURATION_MS)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    dismiss,
  }
}
