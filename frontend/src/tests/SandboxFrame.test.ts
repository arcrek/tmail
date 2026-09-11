// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SandboxFrame from '../components/SandboxFrame.vue'

describe('SandboxFrame', () => {
  it('posts message HTML once to the nonce-protected opaque renderer', async () => {
    const postMessage = vi.fn()
    const contentWindow = vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    const wrapper = mount(SandboxFrame, {
      props: { html: '<p style="color:red">Hello</p>', mode: 'message' },
    })
    const frame = wrapper.get('iframe')
    await frame.trigger('load')

    expect(frame.attributes('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    )
    expect(frame.attributes('sandbox')).not.toContain('allow-same-origin')
    expect(frame.attributes('src')).toBe('/message-sandbox?revision=0')
    expect(frame.attributes('srcdoc')).toBeUndefined()
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tmail:sandbox-content',
      html: '<p style="color:red">Hello</p>',
      css: '',
      mode: 'message',
    }, '*')
    await frame.trigger('load')
    expect(postMessage).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    contentWindow.mockRestore()
  })

  it('posts script and CSS content to the dedicated opaque sandbox document', async () => {
    const postMessage = vi.fn()
    const contentWindow = vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    const wrapper = mount(SandboxFrame, {
      props: { html: '<script>void 0</script>', css: 'body { color: red }', mode: 'content' },
    })
    const frame = wrapper.get('iframe')
    await frame.trigger('load')

    expect(frame.attributes('sandbox')).toContain('allow-scripts')
    expect(frame.attributes('sandbox')).not.toContain('allow-same-origin')
    expect(frame.attributes('src')).toBe('/sandbox?revision=0')
    expect(frame.attributes('srcdoc')).toBeUndefined()
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tmail:sandbox-content',
      html: '<script>void 0</script>',
      css: 'body { color: red }',
      mode: 'content',
    }, '*')
    wrapper.unmount()
    contentWindow.mockRestore()
  })

  it('replaces the iframe document when content changes and unmounts cleanly', async () => {
    const wrapper = mount(SandboxFrame, { props: { html: '<p>First</p>', mode: 'content' } })
    const first = wrapper.get('iframe').element
    await wrapper.setProps({ html: '<p>Second</p>' })
    expect(wrapper.get('iframe').attributes('src')).toBe('/sandbox?revision=1')
    expect(wrapper.get('iframe').element).not.toBe(first)

    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('responds to tmail:sandbox-ready from its own iframe contentWindow', async () => {
    const postMessage = vi.fn()
    const mockWindow = { postMessage } as unknown as Window
    const contentWindow = vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const wrapper = mount(SandboxFrame, {
      props: { html: '<p>Ready handshake test</p>', mode: 'message' },
    })

    // Ignore messages from unknown sources or with other types
    window.dispatchEvent(new MessageEvent('message', {
      source: {} as Window,
      data: { type: 'tmail:sandbox-ready' },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      source: mockWindow,
      data: { type: 'extension:noise' },
    }))
    expect(postMessage).not.toHaveBeenCalled()

    // Dispatch authentic ready event from frame contentWindow
    window.dispatchEvent(new MessageEvent('message', {
      source: mockWindow,
      data: { type: 'tmail:sandbox-ready' },
    }))

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tmail:sandbox-content',
      html: '<p>Ready handshake test</p>',
      css: '',
      mode: 'message',
    }, '*')

    // Subsequent load event should not duplicate send
    const frame = wrapper.get('iframe')
    await frame.trigger('load')
    expect(postMessage).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    contentWindow.mockRestore()
  })

  it('re-sends on sandbox-ready even if load event fired prematurely', async () => {
    const postMessage = vi.fn()
    const mockWindow = { postMessage } as unknown as Window
    const contentWindow = vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const wrapper = mount(SandboxFrame, {
      props: { html: '<p>Premature load test</p>', mode: 'message' },
    })
    const frame = wrapper.get('iframe')

    // Initial load event fires (e.g. on about:blank)
    await frame.trigger('load')
    expect(postMessage).toHaveBeenCalledTimes(1)

    // Then the real sandbox document signals it is ready
    window.dispatchEvent(new MessageEvent('message', {
      source: mockWindow,
      data: { type: 'tmail:sandbox-ready' },
    }))
    expect(postMessage).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    contentWindow.mockRestore()
  })
})
