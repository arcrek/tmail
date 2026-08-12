// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../clipboard'

afterEach(() => vi.unstubAllGlobals())

describe('copyText', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    await copyText('box@example.com')

    expect(writeText).toHaveBeenCalledWith('box@example.com')
  })

  it('falls back to a temporary textarea and restores focus', async () => {
    const button = document.body.appendChild(document.createElement('button'))
    button.focus()
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const command = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: command })

    await copyText('box@example.com')

    expect(command).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(button)
    button.remove()
  })

  it('fails when neither copy mechanism works', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })

    await expect(copyText('box@example.com')).rejects.toThrow('Copy failed')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
