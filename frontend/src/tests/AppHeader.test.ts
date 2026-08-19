// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppHeader from '../components/AppHeader.vue'
import { initLocale } from '../i18n'

describe('AppHeader', () => {
  it('renders the bulk read tab, emits bulkCode, and marks it current when active', async () => {
    initLocale()
    const wrapper = mount(AppHeader, {
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: false, showUnlock: false, bulkCodeActive: true },
      global: { stubs: { ThemeToggle: true } },
    })

    const link = wrapper.get('.bulk-code-link')
    expect(link.text()).toContain('Bulk read')
    expect(link.attributes('aria-current')).toBe('page')
    await link.trigger('click')
    expect(wrapper.emitted('bulkCode')).toHaveLength(1)
  })

  it('toggles mobile menu and closes on escape', async () => {
    initLocale()
    const wrapper = mount(AppHeader, {
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: true, showUnlock: true },
      global: { stubs: { ThemeToggle: true, UnlockControl: true } },
    })

    const toggleBtn = wrapper.get('.mobile-menu-button')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.app-header-nav').classes()).not.toContain('mobile-open')

    await toggleBtn.trigger('click')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.app-header-nav').classes()).toContain('mobile-open')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.app-header-nav').classes()).not.toContain('mobile-open')
  })
})
