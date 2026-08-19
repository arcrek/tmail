# Phase 1: Frontend Core Fixes & i18n

## Tasks

1. **Fix TypeScript Type in `AdminApp.vue`**
   - Import `MessageKey` from `../i18n`.
   - Update `tabs` array definition to use `key: MessageKey`.

2. **Fix Syntax Error in `styles.css`**
   - Move lines 1553-1556 inside `.admin-sidebar` CSS rule block.

3. **Add `.spinning` CSS Keyframe Animation in `styles.css`**
   - Add `@keyframes spin` (0%deg to 360%deg rotation).
   - Add `.spinning` utility class applying `animation: spin 1s linear infinite`.

4. **Add Missing i18n Keys & Replace Hardcoded Card Titles**
   - Update `en` and `vi` objects in `frontend/src/i18n.ts` with 9 keys.
   - Update `ContentTab.vue` (3 titles).
   - Update `DomainsTab.vue` (2 titles).
   - Update `GeneralTab.vue` (2 titles).
   - Update `MailServerTab.vue` (2 titles).

## Verification
- Run `npm --prefix frontend run build` and ensure zero errors.
- Run `npm --prefix frontend test` and ensure all vitest specs pass.
