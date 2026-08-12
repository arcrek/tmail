import { afterEach, describe, expect, it } from 'vitest'
import { en, normalizeLocale, setLocale, useI18n, vi } from '../i18n'

describe('i18n', () => {
  afterEach(() => setLocale('en'))
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
})
