# Phase 1 — Add client-side filter input

## Overview

**Priority:** P1
**Status:** Done
**Estimate:** 2h

## Related code files

- Modify: `frontend/src/components/InboxView.vue`
- Modify: `frontend/src/i18n.ts` — add `inbox.searchLabel`, `inbox.searchPlaceholder`,
  `inbox.noSearchResults` (EN + VI, matching the existing flat-key style in that file).
- Modify: `frontend/src/tests/InboxView.test.ts`

## Implementation steps

1. Add `const query = ref('')` near the other refs.
2. Change:
   ```ts
   const messages = computed(() => collection.value?.['hydra:member'] ?? [])
   ```
   to keep that as `pageMessages` (or similar internal name) and add:
   ```ts
   const messages = computed(() => {
     const needle = query.value.trim().toLowerCase()
     if (!needle) return pageMessages.value
     return pageMessages.value.filter((item) =>
       item.subject.toLowerCase().includes(needle) ||
       item.from.address.toLowerCase().includes(needle) ||
       (item.from.name ?? '').toLowerCase().includes(needle),
     )
   })
   ```
   Every existing template usage of `messages` (row `v-for`, empty-state `v-else-if`) keeps
   working unchanged since the exposed name is the same.
3. Reset `query.value = ''` inside `changePage()` and `resetSession()`, alongside the existing
   `selectedId.value = null` resets.
4. Template: add a search `<input type="search">` above the message list (inside `.list-heading`
   or directly above it), bound to `query` with `v-model`, labelled via `t('inbox.searchLabel')`
   and `:placeholder="t('inbox.searchPlaceholder')"`. Follow the existing accessible-label pattern
   used elsewhere in this file (visible `<label>` or `aria-label`, not a bare placeholder-only
   input — check how other form inputs in this codebase are labelled, e.g. `AddressPanel.vue`,
   and match it).
5. Add a distinct empty state for "page has messages, but none match the query" — reuse the
   `!messages.length` branch's structure but branch on `query.value` to show
   `t('inbox.noSearchResults')` instead of `t('inbox.waiting')`/`t('inbox.waitingHelp')` when a
   query is active and `pageMessages.value.length > 0`.
6. Add tests to `InboxView.test.ts`:
   - typing a subject fragment narrows the rendered rows to matches only.
   - typing a sender fragment (both `from.name` and `from.address` cases) narrows correctly.
   - clearing the query restores the full page list.
   - changing page clears the query.
   - a query matching nothing on the current page shows the "no results on this page" empty
     state, not the generic "waiting for mail" one.

## Success criteria

- Filter is case-insensitive, matches subject or sender (name or address).
- Filtering never triggers a network request — pure client-side over the already-loaded page.
- Query resets on page change and on session/address change.
- Distinct, honest empty-state copy when the query matches nothing on the current page (doesn't
  imply "no mail exists anywhere").

## Todo

- [x] Add `query` ref and filtered `messages` computed.
- [x] Reset query on page change and session reset.
- [x] Add labelled search input to the template.
- [x] Add the "no matches on this page" empty state.
- [x] Add 2 new i18n keys (EN + VI) for the search label/placeholder + no-results copy.
- [x] Add the 5 tests above.
- [x] Run `npm test -- --run src/tests/InboxView.test.ts`.
