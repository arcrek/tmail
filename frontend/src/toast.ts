import { readonly, ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'mail'
export interface ToastAction { label: string; onClick: () => void; primary?: boolean }
export interface ToastOptions { kind?: ToastKind; code?: string }
export interface ToastEntry { id: number; kind: ToastKind; message: string; code?: string; actions?: ToastAction[] }

export const MAX_TOASTS = 3

const DEFAULT_DURATION_MS = 5000
const ACTION_DURATION_MS = 8000
const toasts = ref<ToastEntry[]>([])
const timers = new Map<number, { timer?: ReturnType<typeof setTimeout>; duration: number }>()
let nextId = 0

function dismiss(id: number): void {
  const state = timers.get(id)
  if (state?.timer !== undefined) {
    clearTimeout(state.timer)
  }
  timers.delete(id)
  toasts.value = toasts.value.filter((entry) => entry.id !== id)
}

function pause(id: number): void {
  const state = timers.get(id)
  if (state?.timer !== undefined) {
    clearTimeout(state.timer)
    state.timer = undefined
  }
}

function resume(id: number): void {
  const state = timers.get(id)
  if (!state || state.timer !== undefined) return
  if (!toasts.value.some((entry) => entry.id === id)) return
  state.timer = setTimeout(() => dismiss(id), state.duration)
}

function startTimer(id: number, duration: number): void {
  const existing = timers.get(id)
  if (existing?.timer !== undefined) {
    clearTimeout(existing.timer)
  }
  const timer = setTimeout(() => dismiss(id), duration)
  timers.set(id, { timer, duration })
}

function push(kind: ToastKind, message: string, actions?: ToastAction[], options?: ToastOptions): number | undefined {
  if (!message) return undefined
  const effectiveKind = options?.kind ?? kind
  const code = options?.code || undefined
  const duration = (actions?.length || code) ? ACTION_DURATION_MS : DEFAULT_DURATION_MS

  const existingIndex = toasts.value.findIndex(
    (entry) => entry.kind === effectiveKind && entry.message === message && (entry.code ?? undefined) === code,
  )
  if (existingIndex !== -1) {
    const existing = toasts.value[existingIndex]!
    const updated: ToastEntry = {
      id: existing.id,
      kind: effectiveKind,
      message,
      ...(code ? { code } : {}),
      ...(actions ? { actions: [...actions] } : {}),
    }
    toasts.value = toasts.value.map((entry, idx) => (idx === existingIndex ? updated : entry))
    const currentTimer = timers.get(existing.id)
    if (currentTimer && currentTimer.timer === undefined) {
      currentTimer.duration = duration
    } else {
      startTimer(existing.id, duration)
    }
    return existing.id
  }

  while (toasts.value.length >= MAX_TOASTS) {
    dismiss(toasts.value[0]!.id)
  }

  const id = ++nextId
  toasts.value = [
    ...toasts.value,
    {
      id,
      kind: effectiveKind,
      message,
      ...(code ? { code } : {}),
      ...(actions ? { actions } : {}),
    },
  ]
  startTimer(id, duration)
  return id
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string, actions?: ToastAction[], options?: ToastOptions) =>
      push('success', message, actions, options),
    error: (message: string, actions?: ToastAction[], options?: ToastOptions) =>
      push('error', message, actions, options),
    mail: (message: string, options?: { code?: string; actions?: ToastAction[] }) =>
      push('mail', message, options?.actions, { kind: 'mail', code: options?.code }),
    dismiss,
    pause,
    resume,
  }
}
