import { useSyncExternalStore } from 'react'
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

let currentLocale: Locale = 'en'
let siteLocale: Locale | null = null
let visitorLocale: Locale | null = null
const listeners = new Set<() => void>()

function emitLocaleChange(): void {
  for (const listener of listeners) listener()
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getLocale(): Locale {
  return currentLocale
}

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

function updateLocale(next: Locale): void {
  if (currentLocale === next) return
  currentLocale = next
  emitLocaleChange()
}

function resolveLocale(): void {
  updateLocale(visitorLocale ?? siteLocale ?? browserLocale())
}

/** Compatibility helper for tests and one-off in-memory locale changes. */
export function setLocale(value?: string): void {
  updateLocale(normalizeLocale(value))
}

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

export function translate(key: MessageKey, params: Params = {}, activeLocale: Locale = currentLocale): string {
  const raw = catalogs[activeLocale]?.[key] ?? en[key] ?? key
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`,
  )
}

export function formatLocaleDate(value: string, options: Intl.DateTimeFormatOptions, activeLocale: Locale = currentLocale): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(activeLocale, options).format(date)
}

export function formatLocaleNumber(value: number, options?: Intl.NumberFormatOptions, activeLocale: Locale = currentLocale): string {
  return new Intl.NumberFormat(activeLocale, options).format(value)
}

/** Non-hook helper for imperative callers and pure-TS tests. */
export function getI18n() {
  return {
    get locale(): Locale { return currentLocale },
    selectLocale,
    t: (key: MessageKey, params: Params = {}) => translate(key, params, currentLocale),
    formatDate: (value: string, options: Intl.DateTimeFormatOptions) => formatLocaleDate(value, options, currentLocale),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => formatLocaleNumber(value, options, currentLocale),
  }
}

/** React hook that subscribes to locale changes. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  return {
    locale,
    selectLocale,
    t: (key: MessageKey, params: Params = {}) => translate(key, params, locale),
    formatDate: (value: string, options: Intl.DateTimeFormatOptions) => formatLocaleDate(value, options, locale),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => formatLocaleNumber(value, options, locale),
  }
}
