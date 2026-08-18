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
})
