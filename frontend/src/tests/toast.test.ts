import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../toast'

function clearToasts(): void {
  const { toasts, dismiss } = useToast()
  for (const toast of toasts.value) dismiss(toast.id)
}

afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

describe('toast', () => {
  it('pushes, dismisses, and automatically removes messages', async () => {
    vi.useFakeTimers()
    const toast = useToast()

    toast.success('Saved')
    toast.error('Failed')
    expect(toast.toasts.value.map(({ kind, message }) => ({ kind, message }))).toEqual([
      { kind: 'success', message: 'Saved' },
      { kind: 'error', message: 'Failed' },
    ])

    toast.dismiss(toast.toasts.value[0]!.id)
    expect(toast.toasts.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(0)

    toast.success('')
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('keeps actionable messages visible longer', async () => {
    vi.useFakeTimers()
    const toast = useToast()
    const actions = [{ label: 'A', onClick: vi.fn() }]

    toast.success('Msg', actions)
    expect(toast.toasts.value[0]!.actions).toEqual(actions)

    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(toast.toasts.value).toHaveLength(0)
  })
})
