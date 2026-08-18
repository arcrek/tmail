import { readonly, ref } from 'vue'

export type ToastKind = 'success' | 'error'
export interface ToastAction { label: string; onClick: () => void }
export interface ToastEntry { id: number; kind: ToastKind; message: string; actions?: ToastAction[] }

const DEFAULT_DURATION_MS = 5000
const ACTION_DURATION_MS = 8000
const toasts = ref<ToastEntry[]>([])
let nextId = 0

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((entry) => entry.id !== id)
}

function push(kind: ToastKind, message: string, actions?: ToastAction[]): void {
  if (!message) return
  const id = ++nextId
  toasts.value = [...toasts.value, { id, kind, message, actions }]
  setTimeout(() => dismiss(id), actions?.length ? ACTION_DURATION_MS : DEFAULT_DURATION_MS)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string, actions?: ToastAction[]) => push('success', message, actions),
    error: (message: string, actions?: ToastAction[]) => push('error', message, actions),
    dismiss,
  }
}
