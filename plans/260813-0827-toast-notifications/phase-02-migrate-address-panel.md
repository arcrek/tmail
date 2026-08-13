# Phase 2: Migrate AddressPanel.vue + App.vue route error

## Context Links

- Plan overview: [plan.md](./plan.md)
- Depends on: [Phase 1 — Toast core](./phase-01-toast-core.md)
- Files: `frontend/src/components/AddressPanel.vue`, `frontend/src/App.vue`

## Overview

- Priority: P1
- Status: Pending
- First real migration. Touches the public-facing address/unlock flow. `domainError` is explicitly **out of scope** — it stays inline (see plan.md table).

## Key Insights

- `AddressPanel.vue` has the unlock-error paragraph duplicated verbatim in two places (empty-state variant, line ~177, and normal-form variant, line ~216) because the unlock form itself is duplicated across the two panel states. Moving `unlockError` to toast removes the duplicated `<p class="form-error">` line from both — a real DRY win, but the duplicated *form* itself (label/input/submit/cancel) stays duplicated; de-duplicating that is out of scope for this plan (YAGNI — not what was asked).
- `error` (submit failure at line 257) is combined today with `initialError` (a prop threaded down from `App.vue`'s route-reconciliation failure) via `{{ error || initialError }}`. After migration, `App.vue` calls `toast.error(...)` directly in `reconcileRoute()`'s catch block instead of setting `error.value` and passing it down — so `initialError` prop is deleted entirely, not just unused.
- `copied` (address-copy success) currently has a **separate** `sr-only` live-region paragraph (`address.copiedNotice`) purely for screen-reader announcement, while the button itself already visually swaps its label/icon to "Copied" — that visual swap is a persistent button state, not a message, and **stays**. Only the sr-only announcement paragraph is replaced by `toast.success(t('address.copiedNotice'))`.
- `error.value = t('error.copy')` (copy failure, line 121) moves to `toast.error(...)`.
- `domainError` (line 21, 43-52, 144-148): **do not touch**. It's read directly in the template's `v-else-if="domainError"` branch to pick which whole panel view renders. Converting it to a toast would lose the persistent retry UI.

## Requirements

- Every current `error.value = ...` / `unlockError.value = ...` assignment that is NOT `domainError` becomes a `toast.error(...)` call at the same point in the code, with the same message.
- Every current `''`-reset of those refs (e.g. `unlockError.value = ''` before opening the form) is deleted — toasts self-clear via auto-dismiss, there's nothing to reset.
- The `<p class="form-error">` elements tied to `error`/`unlockError` are deleted from the template (both unlock-form occurrences, and the submit-error one at line 257).
- The `error`/`unlockError` refs themselves are deleted (no longer read anywhere) — don't leave dead state.
- `initialError` prop removed from `AddressPanel`'s `defineProps`; `App.vue` stops passing it and stops keeping its own `error` ref for this purpose.
- The `copied`/`copiedNotice` sr-only paragraph is deleted from the template; `toast.success(t('address.copiedNotice'))` called at the point `copied.value = true` is set (both in `copyAddress()`).

## Architecture

No architectural change — this is a mechanical swap of `ref` + inline `<p>` for `useToast()` calls, file by file, following the table in `plan.md`.

## Related Code Files

- Modify: `frontend/src/components/AddressPanel.vue`
- Modify: `frontend/src/App.vue`

## Implementation Steps

**`AddressPanel.vue`:**
1. Add `import { useToast } from '../toast'` and `const toast = useToast()`.
2. In `submit()`: replace `error.value = message(cause)` with `toast.error(message(cause))`. Delete the now-dead `error.value = ''` reset at the top of `submit()`.
3. In `unlock()`: replace both `unlockError.value = ''` reset and the two possible `unlockError.value = ...` assignments with `toast.error(...)` at the point of failure.
4. In `copyAddress()`: replace `error.value = t('error.copy')` with `toast.error(t('error.copy'))`; keep `copied.value = true` on success but add `toast.success(t('address.copiedNotice'))` right after it.
5. Delete `error`, `domainError`... **no**, keep `domainError` — delete only `error` and `unlockError` refs (search-verify nothing else reads them first).
6. Delete `unlockOpen.value = !unlockOpen; unlockError = ''` — simplify to `unlockOpen = !unlockOpen` (both toggle-button click handlers, empty-state and normal variants) since there's no `unlockError` ref left to clear.
7. Delete the `<p class="form-error" aria-live="polite">{{ unlockError }}</p>` lines (both occurrences).
8. Delete the `<p class="form-error" aria-live="polite">{{ error || initialError }}</p>` line (submit form).
9. Delete the `<p class="sr-only" aria-live="polite">{{ copied ? t('address.copiedNotice') : '' }}</p>` line.
10. Remove `initialError` from `defineProps`/`withDefaults`.

**`App.vue`:**
11. Add `import { useToast } from './toast'` and `const toast = useToast()`.
12. In `reconcileRoute()`'s catch block: replace `error.value = cause instanceof ApiError ? cause.message : 'The mail service is unavailable. Try again.'` with `toast.error(cause instanceof ApiError ? cause.message : t('error.unavailable'))` (reuse the existing `error.unavailable` i18n key already used elsewhere instead of the current hardcoded English string — this was a pre-existing minor inconsistency, fix it while touching this line).
13. Delete the `error` ref entirely (was only used for this one purpose — verify with a search before deleting).
14. Delete `error.value = ''` resets in `reconcileRoute()` and `newAddress()`.
15. Stop passing `:initial-error="error"` to `<AddressPanel>`.

## Todo List

- [ ] `AddressPanel.vue`: `error`, `unlockError` refs removed; toast calls added at every prior assignment site
- [ ] `AddressPanel.vue`: `initialError` prop removed
- [ ] `AddressPanel.vue`: `domainError` untouched, still gates panel view
- [ ] `AddressPanel.vue`: copy-success toast added, sr-only paragraph removed
- [ ] `App.vue`: `error` ref removed, `initial-error` prop no longer passed, route failure now toasts with the existing `error.unavailable` key
- [ ] `npm run test` (frontend) passes after this phase — expect `address-flow.test.ts:284` to fail until updated in Phase 4

## Success Criteria

- Opening a bad `/address@domain` URL directly shows a toast, not inline text, and the address form still renders normally underneath.
- Submitting with a failing API call shows a toast; the form stays usable (no more inline error swallowing form context).
- Wrong unlock credential shows a toast in both the empty-state and normal-panel unlock forms.
- Copying an address shows a success toast; the button's own "Copied" label swap still works as before.
- `domains` load failure still shows the full-panel empty-state/retry view — verify this did NOT change.

## Risk Assessment

- Deleting `initialError` is a public prop change — confirm no test constructs `<AddressPanel :initial-error="...">` directly before removing (grep `initial-error`/`initialError` across `frontend/src/tests`).
- `vue-tsc --noEmit` will catch any leftover reference to deleted refs — run it after this phase, don't wait for Phase 4.

## Security Considerations

- No change to what data reaches the DOM — same messages, different container. `t()`/`Error.message` strings only, no `v-html`.

## Next Steps

- Phase 3 does the same mechanical migration across the 5 admin tabs (bulkier but more uniform, since they all share the exact `status`/`error` shape).
