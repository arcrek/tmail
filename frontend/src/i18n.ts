import { readonly, ref } from 'vue'
import { en } from './locales/en'
import { vi } from './locales/vi'
import { ru } from './locales/ru'
import { zh } from './locales/zh'

export { en, vi, ru, zh }

export type Locale = 'en' | 'vi' | 'ru' | 'zh'
export type MessageKey = keyof typeof en
type Params = Record<string, string | number>
const STORAGE_KEY = 'tmail.locale'

export const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  vi,
  ru,
  zh,
}

const locale = ref<Locale>('en')
let siteLocale: Locale | null = null
let visitorLocale: Locale | null = null

export function normalizeLocale(value?: string): Locale {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0]
  if (code === 'vi') return 'vi'
  if (code === 'ru') return 'ru'
  if (code === 'zh') return 'zh'
  return 'en'
}

function readStoredLocale(): Locale | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'en' || value === 'vi' || value === 'ru' || value === 'zh' ? value : null
  } catch {
    return null
  }
}

function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const lang of languages) {
    if (!lang) continue
    const code = lang.trim().toLowerCase().split(/[-_]/)[0]
    if (code === 'vi' || code === 'ru' || code === 'zh') return code
  }
  return 'en'
}

function resolveLocale(): void { locale.value = visitorLocale ?? siteLocale ?? browserLocale() }

/** Compatibility helper for tests and one-off in-memory locale changes. */
export function setLocale(value?: string): void { locale.value = normalizeLocale(value) }

export function setSiteLocale(value?: string): void {
  siteLocale = value === undefined ? null : normalizeLocale(value)
  resolveLocale()
}

export function selectLocale(value?: string): void {
  visitorLocale = normalizeLocale(value)
  resolveLocale()
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, visitorLocale)
  } catch {
    // Visitor choice is a convenience; keep the in-memory selection for this page.
  }
}

export function initLocale(): void {
  visitorLocale = readStoredLocale()
  resolveLocale()
}

export function useI18n() {
  const t = (key: MessageKey, params: Params = {}) => {
    const raw = catalogs[locale.value]?.[key] ?? en[key] ?? key
    return raw.replace(/\{(\w+)\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
    )
  }
  const formatDate = (value: string, options: Intl.DateTimeFormatOptions) => {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale.value, options).format(date)
  }
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale.value, options).format(value)
  return { locale: readonly(locale), selectLocale, t, formatDate, formatNumber }
}
