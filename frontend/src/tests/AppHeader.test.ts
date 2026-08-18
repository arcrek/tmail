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
})
