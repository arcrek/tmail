import { afterEach, describe, expect, it, vi as vitest } from 'vitest'
import { en, initLocale, normalizeLocale, selectLocale, setLocale, setSiteLocale, useI18n, vi } from '../i18n'

describe('i18n', () => {
  afterEach(() => {
    localStorage.clear()
    initLocale()
    setSiteLocale(undefined)
    setLocale('en')
  })
  it('normalizes supported locales and falls back to English', () => {
    expect(normalizeLocale('vi-VN')).toBe('vi')
    expect(normalizeLocale('fr')).toBe('en')
  })

  it('translates, interpolates, and formats with the resolved locale', () => {
    const { t, formatNumber } = useI18n()
    setLocale('vi')
    expect(t('inbox.page', { page: 2 })).toBe('Trang 2')
    expect(formatNumber(1000)).toMatch(/1[.,]000/)
    setLocale('fr')
    expect(t('inbox.page', { page: 2 })).toBe('Page 2')
  })

  it('keeps the Vietnamese catalog complete', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
  })

  it('prefers a stored visitor choice over the site default', () => {
    localStorage.setItem('tmail.locale', 'vi')
    initLocale()
    setSiteLocale('en')
    expect(useI18n().locale.value).toBe('vi')
    selectLocale('en')
    expect(localStorage.getItem('tmail.locale')).toBe('en')
  })

  it('uses the site default when there is no visitor override', () => {
    initLocale()
    setSiteLocale('vi')
    expect(useI18n().locale.value).toBe('vi')
  })

  it('keeps a visitor choice in memory when storage is blocked', () => {
    vitest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    selectLocale('vi')
    expect(useI18n().locale.value).toBe('vi')
  })
})
// @vitest-environment jsdom
