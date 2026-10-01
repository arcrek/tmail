// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import QrCodeModal from '../components/QrCodeModal.vue'
import * as clipboard from '../clipboard'
import { initLocale } from '../i18n'

afterEach(() => vi.restoreAllMocks())

it('reports copy success and failure inside the dialog', async () => {
  initLocale()
  const copy = vi.spyOn(clipboard, 'copyText').mockResolvedValueOnce(undefined)
  const wrapper = mount(QrCodeModal, { props: { address: 'box@example.com' } })
  try {
    await wrapper.get('.primary-button').trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith('box@example.com')
    expect(wrapper.get('dialog [role="status"]').text()).toBe('Address copied.')
    expect(wrapper.get('.primary-button').text()).toBe('Copied')

    copy.mockRejectedValueOnce(new Error('Copy failed'))
    await wrapper.get('.primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog [role="alert"]').text()).toContain('Copy failed.')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.get('.primary-button').text()).toBe('Copy')
  } finally {
    wrapper.unmount()
  }
})

it('prevents overlapping copy attempts while the clipboard write is pending', async () => {
  initLocale()
  let resolve!: () => void
  const pending = new Promise<void>((done) => { resolve = done })
  const copy = vi.spyOn(clipboard, 'copyText').mockReturnValue(pending)
  const wrapper = mount(QrCodeModal, { props: { address: 'box@example.com' } })
  try {
    await wrapper.get('.primary-button').trigger('click')
    expect(wrapper.get('.primary-button').attributes('disabled')).toBeDefined()
    await wrapper.get('.primary-button').trigger('click')
    expect(copy).toHaveBeenCalledTimes(1)
    resolve()
    await flushPromises()
    expect(wrapper.get('.primary-button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[role="status"]').text()).toBe('Address copied.')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  } finally {
    resolve()
    wrapper.unmount()
  }
})
