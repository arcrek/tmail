// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import QrCodeModal from '../components/QrCodeModal.vue'
import * as clipboard from '../clipboard'
import { initLocale, setLocale } from '../i18n'
import * as qrcode from '../qrcode'

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

it.each(['en', 'vi'])('keeps address copying available on QR failure in %s', async (locale) => {
  initLocale()
  setLocale(locale)
  vi.spyOn(qrcode, 'generateQrMatrix').mockImplementation(() => { throw new Error('Capacity exceeded') })
  const copy = vi.spyOn(clipboard, 'copyText').mockResolvedValue(undefined)
  const wrapper = mount(QrCodeModal, { props: { address: 'box@example.com' } })
  try {
    expect(wrapper.find('svg.qr-svg').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe(locale === 'en'
      ? 'Could not generate a QR code. You can still copy the address.'
      : 'Không thể tạo mã QR. Vẫn có thể sao chép địa chỉ email.')
    expect(wrapper.get('.qr-address-text').text()).toBe('box@example.com')
    await wrapper.get('.primary-button').trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith('box@example.com')
    expect(wrapper.get('[role="status"]').text()).not.toBe('')
    expect(wrapper.get('dialog').attributes('aria-labelledby')).toBe('qr-title')
  } finally {
    wrapper.unmount()
    setLocale('en')
  }
})

it.each(['box@example.com', `${'a'.repeat(64)}@example.com`])('renders a four-module white quiet zone for %s', (address) => {
  const matrix = qrcode.generateQrMatrix(address)
  const wrapper = mount(QrCodeModal, { props: { address } })
  try {
    const size = matrix.length + 8
    expect(wrapper.get('.qr-svg').attributes('viewBox')).toBe(`0 0 ${size} ${size}`)
    expect(wrapper.get('.qr-svg').attributes('shape-rendering')).toBe('crispEdges')
    expect(wrapper.get('.qr-svg > rect').attributes()).toMatchObject({ width: '100%', height: '100%', fill: 'white' })
    const modules = wrapper.findAll('rect[fill="black"]')
    const xs = modules.map((rect) => Number(rect.attributes('x')))
    const ys = modules.map((rect) => Number(rect.attributes('y')))
    expect(Math.min(...xs)).toBe(4)
    expect(Math.min(...ys)).toBe(4)
    expect(Math.max(...xs)).toBe(size - 5)
    expect(Math.max(...ys)).toBe(size - 5)
    expect(modules.length).toBe(matrix.flat().filter(Boolean).length)
  } finally {
    wrapper.unmount()
  }
})
