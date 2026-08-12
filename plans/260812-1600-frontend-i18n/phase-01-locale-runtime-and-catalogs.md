# Phase 1 — Create locale runtime and catalogs

## Overview

Priority: P2. Create the one shared source of translated UI strings and connect it to the existing site language lifecycle.

## Related code files

- Create `/home/arcrek/workspace/tmail_add_domain/frontend/src/i18n.ts` — supported-locale types, `en`/`vi` catalogs, locale normalization, interpolation, `t`, and locale-aware formatters.
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/main.ts` — initialize locale state before mounting Vue.
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/App.vue` — set the locale from `SiteResource.language` beside existing branding/lang handling and provide the translator to descendants.
- Create `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/i18n.test.ts` — locale normalization, fallback, interpolation, and `Intl` formatting coverage.

## Design

`i18n.ts` exposes only the capabilities this app uses:

```ts
type Locale = 'en' | 'vi'
export function setLocale(value: string | undefined): void
export function useI18n(): { locale: Readonly<Ref<Locale>>; t: Translate; formatDate: ...; formatNumber: ... }
```

Use dot-delimited literal keys and a typed catalog derived from English. Interpolate named values (`{count}`, `{seconds}`, `{address}`) with escaped text inserted by Vue interpolation, never raw HTML. Missing Vietnamese keys fall back to English in development and tests; the catalog test must make omissions visible before release.

## Implementation steps

1. Inventory every human-facing string in `frontend/src`; categorize product UI, variable template, server/API error, and untrusted/message content.
2. Add complete English and Vietnamese product-UI catalogs. Keep public, reader, header/theme, and admin keys grouped by feature so a string has one key and no duplicate translations.
3. Normalize browser/site tags by base language (`vi-VN` → `vi`); select English for unsupported/malformed values. Initialize from `navigator.languages` defensively for SSR/test environments.
4. Provide reactive locale state to the Vue tree. In `App.vue`, update it when `site` arrives and retain the existing configured `root.lang` behavior.
5. Make date and number formatting accept the resolved locale. Do not change payload dates, mail metadata, or API request behavior.

## Success criteria

- A component can translate a static or parameterized label without a new dependency or prop drilling.
- `vi`, `vi-VN`, `en`, unsupported values, missing keys, and interpolation have deterministic tests.
- The public app does not flash a runtime error if locale storage/browser APIs are unavailable.

## Risks and safeguards

- `site.language` currently accepts arbitrary strings. Preserve it for document metadata, but normalize only the UI catalog lookup so existing saved values remain valid.
- Do not put user-controlled `appName` or `cookieText` in catalogs; they are configuration data and must remain verbatim.

## Todo

- [x] Add the minimal locale runtime and full EN/VI catalogs.
- [x] Apply existing site language as the reactive app locale.
- [x] Add unit coverage for locale selection and formatting.
