// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToastStack from '../components/ToastStack'
import { getToasts, toastActions } from '../toast'
import { renderWithTheme } from './renderWithTheme'

function clearToasts(): void {
  for (const toast of [...getToasts()]) toastActions.dismiss(toast.id)
}

afterEach(() => {
  cleanup()
  clearToasts()
})

describe('ToastStack', () => {
  it('renders toast roles and dismisses a toast', () => {
    const { container } = renderWithTheme(<ToastStack />)

    act(() => {
      toastActions.success('Saved')
    })
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Saved')

    act(() => {
      toastActions.error('Failed')
    })
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Failed')

    const dismissButton = container.querySelector('[role="status"] .toast-dismiss')
    expect(dismissButton).not.toBeNull()
    fireEvent.click(dismissButton!)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('runs a toast action and dismisses its toast', () => {
    const onClick = vi.fn()
    const { container } = renderWithTheme(<ToastStack />)

    act(() => {
      toastActions.success('With action', [{ label: 'Copy X', onClick }])
    })
    const action = container.querySelector('[role="status"] button.toast-action')
    expect(action?.textContent).toBe('Copy X')
    expect(action?.classList.contains('toast-action')).toBe(true)

    fireEvent.click(action!)
    expect(onClick).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="status"]')).toBeNull()

    act(() => {
      toastActions.success('No action')
    })
    expect(container.querySelectorAll('.toast-action')).toHaveLength(0)
  })

  it('renders mail toast with structured layout, grouped code chip, and tertiary primary action', () => {
    const { container } = renderWithTheme(<ToastStack />)

    act(() => {
      toastActions.mail('Your code is ready', {
        code: '482913',
        actions: [
          { label: 'Copy email', onClick: vi.fn() },
          { label: 'Copy code', onClick: vi.fn(), primary: true },
        ],
      })
    })

    const status = container.querySelector('[role="status"]')
    expect(status?.classList.contains('toast-mail')).toBe(true)
    expect(status?.classList.contains('toast-structured')).toBe(true)
    expect(status?.querySelector('.toast-code')?.textContent).toBe('482 913')

    const actions = status?.querySelectorAll('button.toast-action') ?? []
    expect(actions).toHaveLength(2)
    expect(actions[0]?.textContent).toBe('Copy email')
    expect(actions[0]?.classList.contains('toast-action-tertiary')).toBe(false)
    expect(actions[1]?.textContent).toBe('Copy code')
    expect(actions[1]?.classList.contains('toast-action-tertiary')).toBe(true)
  })

  it('pauses and resumes auto-dismiss on mouseenter/mouseleave and focusin/focusout', () => {
    vi.useFakeTimers()
    try {
      const { container } = renderWithTheme(<ToastStack />)

      act(() => {
        toastActions.success('Hover or focus me')
      })

      const item = container.querySelector('.toast')
      expect(item).not.toBeNull()

      fireEvent.mouseEnter(item!)
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      expect(container.querySelector('.toast')).not.toBeNull()

      fireEvent.mouseLeave(item!)
      act(() => {
        vi.advanceTimersByTime(4999)
      })
      expect(container.querySelector('.toast')).not.toBeNull()

      fireEvent.focus(item!)
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      expect(container.querySelector('.toast')).not.toBeNull()

      const dismissButton = container.querySelector('.toast-dismiss')
      fireEvent.blur(item!, { relatedTarget: dismissButton })
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      expect(container.querySelector('.toast')).not.toBeNull()

      fireEvent.blur(item!)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(container.querySelector('.toast')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
