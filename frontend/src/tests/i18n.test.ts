import { afterEach, describe, expect, it, vi as vitest } from 'vitest'
import { en, initLocale, normalizeLocale, ru, selectLocale, setLocale, setSiteLocale, useI18n, vi, zh } from '../i18n'

describe('i18n', () => {
  afterEach(() => {
    localStorage.clear()
    initLocale()
    setSiteLocale(undefined)
    setLocale('en')
  })

  it('normalizes supported locales and falls back to English', () => {
    expect(normalizeLocale('vi-VN')).toBe('vi')
    expect(normalizeLocale('vi_VN')).toBe('vi')
    expect(normalizeLocale('ru-RU')).toBe('ru')
    expect(normalizeLocale('ru_RU')).toBe('ru')
    expect(normalizeLocale('ru')).toBe('ru')
    expect(normalizeLocale('zh-CN')).toBe('zh')
    expect(normalizeLocale('zh_CN')).toBe('zh')
    expect(normalizeLocale('zh-Hans')).toBe('zh')
    expect(normalizeLocale('zh-SG')).toBe('zh')
    expect(normalizeLocale('zh')).toBe('zh')
    expect(normalizeLocale('fr')).toBe('en')
  })

  it('translates, interpolates, and formats with the resolved locale', () => {
    const { t, formatNumber, formatDate } = useI18n()
    const testDate = '2026-10-21T12:00:00Z'

    setLocale('vi')
    expect(t('inbox.page', { page: 2 })).toBe('Trang 2')
    expect(formatNumber(1000)).toMatch(/1[.,]000/)
    expect(formatDate(testDate, { month: 'short' })).toBeTruthy()

    setLocale('ru')
    expect(t('inbox.page', { page: 2 })).toBe('Страница 2')
    expect(formatNumber(1000)).toMatch(/1[.,\s]000/)
    expect(formatDate(testDate, { month: 'short' })).toBeTruthy()

    setLocale('zh')
    expect(t('inbox.page', { page: 2 })).toBe('第 2 页')
    expect(formatNumber(1000)).toMatch(/1[.,]000/)
    expect(formatDate(testDate, { month: 'short' })).toBeTruthy()

    setLocale('fr')
    expect(t('inbox.page', { page: 2 })).toBe('Page 2')
  })

  it('falls back to English for untranslated administrative keys in Russian and Chinese', () => {
    const { t } = useI18n()

    setLocale('ru')
    expect(t('admin.dashboard')).toBe(en['admin.dashboard'])
    expect(t('mail.jmapConfig')).toBe(en['mail.jmapConfig'])

    setLocale('zh')
    expect(t('admin.dashboard')).toBe(en['admin.dashboard'])
    expect(t('mail.jmapConfig')).toBe(en['mail.jmapConfig'])
  })

  it('keeps the Vietnamese catalog complete', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
  })

  it('ensures Russian and Chinese catalogs cover all visitor keys', () => {
    const visitorPrefixes = [
      'address.', 'password.', 'nav.', 'a11y.', 'locale.', 'theme.',
      'toast.', 'app.', 'how.', 'trust.', 'bulk.', 'bulkCode.', 'inbox.', 'unlock.', 'reader.',
    ]
    const visitorErrors = [
      'error.unavailable', 'error.copy', 'error.inbox', 'error.message',
      'error.stale', 'error.download', 'error.source', 'error.delete', 'error.seen',
    ]

    const expectedKeys = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => visitorPrefixes.some((p) => key.startsWith(p)) || visitorErrors.includes(key),
    )

    for (const key of expectedKeys) {
      expect(ru[key], `Missing Russian translation for ${key}`).toBeDefined()
      expect(zh[key], `Missing Chinese translation for ${key}`).toBeDefined()
    }
  })

  it('safely handles prototype properties in parameter interpolation', () => {
    const { t } = useI18n()
    // Should not evaluate Object.prototype.toString
    expect(t('address.forget')).toBe('Forget {address}')
  })

  it('prefers a stored visitor choice over the site default', () => {
    localStorage.setItem('tmail.locale', 'ru')
    initLocale()
    setSiteLocale('en')
    expect(useI18n().locale.value).toBe('ru')

    selectLocale('zh')
    expect(localStorage.getItem('tmail.locale')).toBe('zh')
    expect(useI18n().locale.value).toBe('zh')

    selectLocale('en')
    expect(localStorage.getItem('tmail.locale')).toBe('en')
  })

  it('uses the site default when there is no visitor override', () => {
    initLocale()
    setSiteLocale('zh')
    expect(useI18n().locale.value).toBe('zh')
  })

  it('keeps a visitor choice in memory when storage is blocked', () => {
    vitest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    selectLocale('ru')
    expect(useI18n().locale.value).toBe('ru')
  })
})
// @vitest-environment jsdom
