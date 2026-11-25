import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToasts, MAX_TOASTS, toastActions } from '../toast'
import { groupCode } from '../verificationCode'

function clearToasts(): void {
  for (const toast of [...getToasts()]) toastActions.dismiss(toast.id)
}

afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

describe('toast', () => {
  it('pushes, dismisses, and automatically removes messages', async () => {
    vi.useFakeTimers()

    toastActions.success('Saved')
    toastActions.error('Failed')
    expect(getToasts().map(({ kind, message }) => ({ kind, message }))).toEqual([
      { kind: 'success', message: 'Saved' },
      { kind: 'error', message: 'Failed' },
    ])

    toastActions.dismiss(getToasts()[0]!.id)
    expect(getToasts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(0)

    toastActions.success('')
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps actionable messages visible longer', async () => {
    vi.useFakeTimers()
    const actions = [{ label: 'A', onClick: vi.fn() }]

    toastActions.success('Msg', actions)
    expect(getToasts()[0]!.actions).toEqual(actions)

    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(getToasts()).toHaveLength(0)
  })

  it('deduplicates in-place when pushing the same (kind, message, code), resetting timer and updating actions', async () => {
    vi.useFakeTimers()
    const firstActions = [{ label: 'First', onClick: vi.fn() }]
    const secondActions = [{ label: 'Second', onClick: vi.fn(), primary: true }]

    const id1 = toastActions.mail('Verification mail', { code: '482913', actions: firstActions })
    expect(getToasts()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(6000)
    expect(getToasts()).toHaveLength(1)

    const id2 = toastActions.mail('Verification mail', { code: '482913', actions: secondActions })
    expect(id2).toBe(id1)
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]!.actions).toEqual(secondActions)
    expect(getToasts()[0]!.actions).not.toBe(secondActions)

    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(getToasts()).toHaveLength(0)
  })

  it('does not deduplicate distinct (kind, message, code) combinations', () => {
    vi.useFakeTimers()

    toastActions.success('Same text')
    toastActions.error('Same text')
    toastActions.mail('Same text', { code: '111222' })
    expect(getToasts()).toHaveLength(3)
  })

  it('enforces MAX_TOASTS = 3 cap by evicting the oldest toast and clearing its timer', async () => {
    vi.useFakeTimers()
    expect(MAX_TOASTS).toBe(3)

    const id1 = toastActions.success('One')
    const id2 = toastActions.success('Two')
    const id3 = toastActions.success('Three')
    const id4 = toastActions.success('Four')

    expect(getToasts().map((t) => t.id)).toEqual([id2, id3, id4])
    expect(getToasts().some((t) => t.id === id1)).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(0)
  })

  it('pauses and resumes auto-dismiss timer', async () => {
    vi.useFakeTimers()

    const id = toastActions.success('Hover me')!
    await vi.advanceTimersByTimeAsync(3000)
    toastActions.pause(id)

    await vi.advanceTimersByTimeAsync(10000)
    expect(getToasts()).toHaveLength(1)

    toastActions.resume(id)
    await vi.advanceTimersByTimeAsync(4999)
    expect(getToasts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps timer paused when an active paused toast is deduplicated in-place', async () => {
    vi.useFakeTimers()

    const id = toastActions.success('Paused copy')!
    toastActions.pause(id)
    toastActions.success('Paused copy')

    await vi.advanceTimersByTimeAsync(10000)
    expect(getToasts()).toHaveLength(1)

    toastActions.resume(id)
    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(0)
  })

  it('clears the underlying timer cleanly on dismiss(id)', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const id = toastActions.success('Dismiss me')!
    toastActions.dismiss(id)

    expect(clearSpy).toHaveBeenCalled()
    expect(getToasts()).toHaveLength(0)
    clearSpy.mockRestore()
  })

  it('creates a mail toast entry with code and 8000ms duration', async () => {
    vi.useFakeTimers()
    const actions = [{ label: 'Open', onClick: vi.fn() }]

    const id = toastActions.mail('New subject', { code: '482913', actions })
    expect(id).toBeDefined()
    expect(getToasts()[0]).toEqual({
      id,
      kind: 'mail',
      message: 'New subject',
      code: '482913',
      actions,
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(getToasts()).toHaveLength(0)
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
