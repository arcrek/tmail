import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_TOASTS, useToast } from '../toast'
import { groupCode } from '../verificationCode'

function clearToasts(): void {
  const { toasts, dismiss } = useToast()
  for (const toast of [...toasts.value]) dismiss(toast.id)
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

  it('deduplicates in-place when pushing the same (kind, message, code), resetting timer and updating actions', async () => {
    vi.useFakeTimers()
    const toast = useToast()
    const firstActions = [{ label: 'First', onClick: vi.fn() }]
    const secondActions = [{ label: 'Second', onClick: vi.fn(), primary: true }]

    const id1 = toast.mail('Verification mail', { code: '482913', actions: firstActions })
    expect(toast.toasts.value).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(6000)
    expect(toast.toasts.value).toHaveLength(1)

    const id2 = toast.mail('Verification mail', { code: '482913', actions: secondActions })
    expect(id2).toBe(id1)
    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]!.actions).toEqual(secondActions)
    expect(toast.toasts.value[0]!.actions).not.toBe(secondActions)

    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('does not deduplicate distinct (kind, message, code) combinations', () => {
    vi.useFakeTimers()
    const toast = useToast()

    toast.success('Same text')
    toast.error('Same text')
    toast.mail('Same text', { code: '111222' })
    expect(toast.toasts.value).toHaveLength(3)
  })

  it('enforces MAX_TOASTS = 3 cap by evicting the oldest toast and clearing its timer', async () => {
    vi.useFakeTimers()
    const toast = useToast()
    expect(MAX_TOASTS).toBe(3)

    const id1 = toast.success('One')
    const id2 = toast.success('Two')
    const id3 = toast.success('Three')
    const id4 = toast.success('Four')

    expect(toast.toasts.value.map((t) => t.id)).toEqual([id2, id3, id4])
    expect(toast.toasts.value.some((t) => t.id === id1)).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('pauses and resumes auto-dismiss timer', async () => {
    vi.useFakeTimers()
    const toast = useToast()

    const id = toast.success('Hover me')!
    await vi.advanceTimersByTimeAsync(3000)
    toast.pause(id)

    await vi.advanceTimersByTimeAsync(10000)
    expect(toast.toasts.value).toHaveLength(1)

    toast.resume(id)
    await vi.advanceTimersByTimeAsync(4999)
    expect(toast.toasts.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('keeps timer paused when an active paused toast is deduplicated in-place', async () => {
    vi.useFakeTimers()
    const toast = useToast()

    const id = toast.success('Paused copy')!
    toast.pause(id)
    toast.success('Paused copy')

    await vi.advanceTimersByTimeAsync(10000)
    expect(toast.toasts.value).toHaveLength(1)

    toast.resume(id)
    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('clears the underlying timer cleanly on dismiss(id)', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const toast = useToast()

    const id = toast.success('Dismiss me')!
    toast.dismiss(id)

    expect(clearSpy).toHaveBeenCalled()
    expect(toast.toasts.value).toHaveLength(0)
    clearSpy.mockRestore()
  })

  it('creates a mail toast entry with code and 8000ms duration', async () => {
    vi.useFakeTimers()
    const toast = useToast()
    const actions = [{ label: 'Open', onClick: vi.fn() }]

    const id = toast.mail('New subject', { code: '482913', actions })
    expect(id).toBeDefined()
    expect(toast.toasts.value[0]).toEqual({
      id,
      kind: 'mail',
      message: 'New subject',
      code: '482913',
      actions,
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(toast.toasts.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(toast.toasts.value).toHaveLength(0)
  })
})

describe('groupCode', () => {
  it('groups 6+ digit numeric codes in threes and leaves shorter or hyphenated codes unchanged', () => {
    expect(groupCode('482913')).toBe('482 913')
    expect(groupCode('12345678')).toBe('123 456 78')
    expect(groupCode('859-133')).toBe('859-133')
    expect(groupCode('1234')).toBe('1234')
  })
})
