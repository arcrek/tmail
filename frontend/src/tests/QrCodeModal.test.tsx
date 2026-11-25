// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as clipboard from '../clipboard'
import QrCodeModal from '../components/QrCodeModal'
import { initLocale, setLocale } from '../i18n'
import * as qrcode from '../qrcode'
import { renderWithTheme } from './renderWithTheme'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setLocale('en')
})

it('reports copy success and failure inside the dialog', async () => {
  initLocale()
  const copy = vi.spyOn(clipboard, 'copyText').mockResolvedValueOnce(undefined)
  const { container } = renderWithTheme(
    <QrCodeModal address="box@example.com" onClose={vi.fn()} />,
  )

  await act(async () => {
    fireEvent.click(container.querySelector('.primary-button')!)
  })
  expect(copy).toHaveBeenCalledWith('box@example.com')
  expect(container.querySelector('dialog [role="status"]')!.textContent).toBe('Address copied.')
  expect(container.querySelector('.primary-button')!.textContent).toBe('Copied')

  copy.mockRejectedValueOnce(new Error('Copy failed'))
  await act(async () => {
    fireEvent.click(container.querySelector('.primary-button')!)
  })
  expect(container.querySelector('dialog [role="alert"]')!.textContent).toContain('Copy failed.')
  expect(container.querySelector('[role="status"]')!.textContent).toBe('')
  expect(container.querySelector('.primary-button')!.textContent).toBe('Copy')
})

it('prevents overlapping copy attempts while the clipboard write is pending', async () => {
  initLocale()
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const copy = vi.spyOn(clipboard, 'copyText').mockReturnValue(pending)
  const { container } = renderWithTheme(
    <QrCodeModal address="box@example.com" onClose={vi.fn()} />,
  )
  try {
    const button = container.querySelector('.primary-button') as HTMLButtonElement
    fireEvent.click(button)
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(copy).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve()
      await pending
    })
    expect(button.disabled).toBe(false)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Address copied.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    resolve()
  }
})

it.each(['en', 'vi'])('keeps address copying available on QR failure in %s', async (locale) => {
  initLocale()
  setLocale(locale)
  vi.spyOn(qrcode, 'generateQrMatrix').mockImplementation(() => {
    throw new Error('Capacity exceeded')
  })
  const copy = vi.spyOn(clipboard, 'copyText').mockResolvedValue(undefined)
  const { container } = renderWithTheme(
    <QrCodeModal address="box@example.com" onClose={vi.fn()} />,
  )

  expect(container.querySelector('svg.qr-svg')).toBeNull()
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    locale === 'en'
      ? 'Could not generate a QR code. You can still copy the address.'
      : 'Không thể tạo mã QR. Vẫn có thể sao chép địa chỉ email.',
  )
  expect(container.querySelector('.qr-address-text')!.textContent).toBe('box@example.com')

  await act(async () => {
    fireEvent.click(container.querySelector('.primary-button')!)
  })
  expect(copy).toHaveBeenCalledWith('box@example.com')
  expect(container.querySelector('[role="status"]')!.textContent).not.toBe('')
  expect(container.querySelector('dialog')!.getAttribute('aria-labelledby')).toBe('qr-title')
})

it.each(['box@example.com', `${'a'.repeat(64)}@example.com`])(
  'renders a four-module white quiet zone for %s',
  (address) => {
    const matrix = qrcode.generateQrMatrix(address)
    const { container } = renderWithTheme(<QrCodeModal address={address} onClose={vi.fn()} />)
    const size = matrix.length + 8
    const svg = container.querySelector('.qr-svg')!
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`)
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    const background = svg.querySelector(':scope > rect')!
    expect(background.getAttribute('width')).toBe('100%')
    expect(background.getAttribute('height')).toBe('100%')
    expect(background.getAttribute('fill')).toBe('white')

    const modules = [...svg.querySelectorAll('rect[fill="black"]')]
    const xs = modules.map((rect) => Number(rect.getAttribute('x')))
    const ys = modules.map((rect) => Number(rect.getAttribute('y')))
    expect(Math.min(...xs)).toBe(4)
    expect(Math.min(...ys)).toBe(4)
    expect(Math.max(...xs)).toBe(size - 5)
    expect(Math.max(...ys)).toBe(size - 5)
    expect(modules.length).toBe(matrix.flat().filter(Boolean).length)
  },
)
