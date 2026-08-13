// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
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
})
