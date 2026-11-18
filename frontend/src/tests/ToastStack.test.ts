// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToastStack from '../components/ToastStack.vue'
import { useToast } from '../toast'

enableAutoUnmount(afterEach)

function clearToasts(): void {
  const { toasts, dismiss } = useToast()
  for (const toast of toasts.value) dismiss(toast.id)
}

afterEach(clearToasts)

describe('ToastStack', () => {
  it('renders toast roles and dismisses a toast', async () => {
    const toast = useToast()
    const wrapper = mount(ToastStack)

    toast.success('Saved')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('Saved')

    toast.error('Failed')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('Failed')

    await wrapper.get('[role="status"] .toast-dismiss').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('runs a toast action and dismisses its toast', async () => {
    const toast = useToast()
    const onClick = vi.fn()
    const wrapper = mount(ToastStack)

    toast.success('With action', [{ label: 'Copy X', onClick }])
    await nextTick()
    const action = wrapper.get('[role="status"] button.toast-action')
    expect(action.text()).toBe('Copy X')
    expect(action.classes()).toContain('toast-action')

    await action.trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    toast.success('No action')
    await nextTick()
    expect(wrapper.findAll('.toast-action')).toHaveLength(0)
  })

  it('renders mail toast with structured layout, grouped code chip, and tertiary primary action', async () => {
    const toast = useToast()
    const wrapper = mount(ToastStack)

    toast.mail('Your code is ready', {
      code: '482913',
      actions: [
        { label: 'Copy email', onClick: vi.fn() },
        { label: 'Copy code', onClick: vi.fn(), primary: true },
      ],
    })
    await nextTick()

    const status = wrapper.get('[role="status"]')
    expect(status.classes()).toContain('toast-mail')
    expect(status.classes()).toContain('toast-structured')
    expect(status.get('.toast-code').text()).toBe('482 913')

    const actions = status.findAll('button.toast-action')
    expect(actions).toHaveLength(2)
    expect(actions[0]!.text()).toBe('Copy email')
    expect(actions[0]!.classes()).not.toContain('toast-action-tertiary')
    expect(actions[1]!.text()).toBe('Copy code')
    expect(actions[1]!.classes()).toContain('toast-action-tertiary')
  })

  it('pauses and resumes auto-dismiss on mouseenter/mouseleave and focusin/focusout', async () => {
    vi.useFakeTimers()
    try {
      const toast = useToast()
      const wrapper = mount(ToastStack)

      toast.success('Hover or focus me')
      await nextTick()

      const item = wrapper.get('.toast')
      await item.trigger('mouseenter')
      vi.advanceTimersByTime(10000)
      await nextTick()
      expect(wrapper.find('.toast').exists()).toBe(true)

      await item.trigger('mouseleave')
      vi.advanceTimersByTime(4999)
      await nextTick()
      expect(wrapper.find('.toast').exists()).toBe(true)

      await item.trigger('focusin')
      vi.advanceTimersByTime(10000)
      await nextTick()
      expect(wrapper.find('.toast').exists()).toBe(true)

      const dismissButton = wrapper.get('.toast-dismiss').element
      await item.trigger('focusout', { relatedTarget: dismissButton })
      vi.advanceTimersByTime(10000)
      await nextTick()
      expect(wrapper.find('.toast').exists()).toBe(true)

      await item.trigger('focusout')
      vi.advanceTimersByTime(5000)
      await nextTick()
      expect(wrapper.find('.toast').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
