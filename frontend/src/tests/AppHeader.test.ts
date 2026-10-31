// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
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

  it('renders the home link and emits home when clicked', async () => {
    initLocale()
    const wrapper = mount(AppHeader, {
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: false, showUnlock: false, homeActive: true },
      global: { stubs: { ThemeToggle: true } },
    })

    const link = wrapper.get('.home-link')
    expect(link.text()).toContain('Home')
    expect(link.attributes('aria-current')).toBe('page')
    await link.trigger('click')
    expect(wrapper.emitted('home')).toHaveLength(1)
    await wrapper.setProps({ homeActive: false })
    expect(link.attributes('aria-current')).toBeUndefined()
    expect(wrapper.find('.admin-link').exists()).toBe(false)
  })

  it('keeps the language picker outside the collapsible menu and labels the current language', async () => {
    initLocale()
    const wrapper = mount(AppHeader, {
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: true, showUnlock: false },
      global: { stubs: { ThemeToggle: true } },
    })

    const picker = wrapper.get('.header-actions .locale-picker')
    expect(wrapper.find('.app-header-nav .locale-picker').exists()).toBe(false)
    expect(picker.get('select').attributes('aria-label')).toBe('Language')
    expect(picker.get('.locale-current-long').text()).toBe('English')
    expect(picker.get('.locale-current-short').text()).toBe('EN')
  })

  it('toggles mobile menu and closes on escape', async () => {
    initLocale()
    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: true, showUnlock: true },
      global: { stubs: { ThemeToggle: true, UnlockControl: true } },
    })

    const toggleBtn = wrapper.get('.mobile-menu-button')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.app-header-nav').classes()).not.toContain('mobile-open')

    await toggleBtn.trigger('click')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.app-header-nav').classes()).toContain('mobile-open')

    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#app-header-nav a').element)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.app-header-nav').classes()).not.toContain('mobile-open')
  })

  it('renders distinct function-matched SVG icons across header navigation and AppIcon catalog', async () => {
    const { default: AppIcon } = await import('../components/AppIcon.vue')
    type IconName = InstanceType<typeof AppIcon>['$props']['name']
    const allNames: IconName[] = [
      'home', 'copy', 'check', 'check-circle', 'refresh-cw', 'plus', 'trash-2',
      'download', 'file-down', 'bell', 'bell-ring', 'sun', 'moon', 'arrow-left',
      'paperclip', 'external-link', 'file-text', 'book-open', 'sparkles', 'shuffle',
      'shield', 'shield-check', 'shield-cog', 'clock-shield', 'menu', 'x',
      'volume-2', 'volume-x', 'qr', 'layout-dashboard', 'sliders', 'server',
      'globe', 'globe-plus', 'key', 'lock', 'unlock', 'log-out', 'badge-check',
      'code-2', 'scan-code', 'alert-triangle', 'mail', 'brand-mail', 'mail-open',
      'mail-plus', 'mails', 'inbox', 'clock', 'calendar-range', 'trending-up', 'activity',
    ]

    for (const name of allNames) {
      const icon = mount(AppIcon, { props: { name } })
      expect(icon.find('svg.app-icon').exists()).toBe(true)
      expect(icon.find('svg.app-icon').element.children.length).toBeGreaterThan(0)
    }

    initLocale()
    const wrapper = mount(AppHeader, {
      props: { unlockOpen: false, unlockValue: '', showLocalePicker: false, showUnlock: false },
      global: { stubs: { ThemeToggle: true } },
    })

    const navSvgs = wrapper.findAll('.app-header-nav a svg.app-icon').map((svg) => svg.html())
    expect(navSvgs).toHaveLength(4)
    expect(new Set(navSvgs).size).toBe(4)
  })
})
