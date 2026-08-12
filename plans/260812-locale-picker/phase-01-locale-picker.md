# Phase 1 — Locale precedence, picker, and tests

## Overview

Priority: P2. Extend the existing two-locale runtime just enough to distinguish a visitor override from defaults, then expose it in the already-mounted public header.

## Related code files

- Modify `frontend/src/i18n.ts` — add safe read/write helpers for `tmail.locale`, resolve precedence, expose the reactive locale and an explicit visitor-selection action.
- Modify `frontend/src/App.vue` — supply the configured site language to the resolver and write the resulting locale to `<html lang>` without allowing later `/site` loads to replace an override.
- Modify `frontend/src/components/AppHeader.vue` — render the labelled native EN/VI selector next to `ThemeToggle`; hide it when the admin app replaces the public shell.
- Modify `frontend/src/tests/i18n.test.ts` — cover precedence, normalization, invalid/unavailable local storage, and the effective locale.
- Modify the smallest existing public-app/header test (or add one only if no suitable mount exists) — assert the control’s label/options, changing it updates translations and `lang`, and the value persists.

## Implementation steps

1. Keep `normalizeLocale()` as the sole validator. Add a small storage boundary that returns `null` for absent/invalid values and catches read/write exceptions, mirroring the existing theme preference behavior.
2. Track the site default separately from the resolved locale. Recompute as `override ?? siteDefault ?? browserLocale ?? 'en'`, including startup before `/site` returns; an explicit picker selection writes the override and updates the same reactive locale.
3. Change `App.vue` so `applySite()` passes the configured language into the locale runtime, then assigns `document.documentElement.lang` from the resolved locale. Preserve existing brand/title/favicon handling and cleanup.
4. Add a minimal `<label>` + `<select>` to `AppHeader`, with translated label and language names, `value` bound to the resolved locale, and one change handler. Reuse existing header/nav styles; add only spacing needed for the native control and retain keyboard/focus visibility.
5. Add focused tests for every precedence rung and blocked storage. Mount the public flow/header to verify the selector changes visible text and effective `html[lang]`; retain current catalog-completeness coverage.

## Success criteria

- Visitor selection is immediately reflected in public UI and `<html lang>`, survives reload when storage is available, and does not alter server settings.
- A saved `vi` choice wins over site `en`; with no saved choice, site `vi` wins over browser `en`; absent/unsupported inputs reach English safely.
- Keyboard users can identify and operate the control using its accessible name.
- Admin language configuration remains the default for browsers without an override.

## Risks and safeguards

- `localStorage` may throw in privacy-restricted contexts. Catch errors at the one storage boundary and keep the selected locale in memory.
- Do not use translated label text as a state value: option values stay stable locale IDs.
- Do not mutate `site.language`, call an admin endpoint, or synchronize a visitor preference across devices.

## Todo

- [x] Implement storage-safe locale precedence and effective document language.
- [x] Add the native accessible public-header picker.
- [x] Add precedence, storage-failure, header interaction, and document-language tests.
- [x] Run focused tests and production build.
