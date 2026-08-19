# Phase 1: Code column — fetch/cache + row UI

## Context Links

- Plan: [plan.md](./plan.md)
- Row/list to modify: `frontend/src/components/InboxView.vue`
- Extraction util (reuse as-is, no changes): `frontend/src/verificationCode.ts` — `extractVerificationCode(subject, text, html)`
- Fetch/cache precedent: `frontend/src/components/BulkCodeView.vue` (`fetchLatestMessage`, `resolveRow`, `Promise.allSettled` refresh)
- Sibling-buttons-in-a-row precedent (avoids nested `<button>`): `frontend/src/components/AddressPanel.vue:171-182`
- Row CSS to extend: `frontend/src/styles.css` — `.message-row` (line ~948) and neighbors (`.message-row-top`, `.message-subject`, `.message-intro`)
- i18n: `frontend/src/i18n.ts` (single flat-object file, `en` then `vi`, ~line 16/35 for existing `inbox.*` keys)
- Tests: `frontend/src/tests/InboxView.test.ts`

## Overview

- Priority: P2
- Status: Completed
- Fetch and cache the extracted code for each visible message row (full-body fetch, not the list preview), and render a copy chip on rows where a code was found — without opening the message.

## Key Insights

- `MessageSummary` (`GET /messages`) only has `subject`/`intro` (truncated preview) — accurate extraction needs the full body from `GET /messages/{id}` (`MessageResource.text`/`.html`), same as `BulkCodeView.vue` and `announceToast()` already do in this same file.
- Message content is immutable post-delivery — once a message id's code is resolved (found or not), it never needs re-fetching. A `Map<string, string>` cache keyed by id, persisted across poll ticks and cleared only on address switch, turns "N rows × every poll" into "only new rows, once."
- `.message-row` is currently a single `<button type="button">` — the entire row is the click target that opens `MessageReader`. Adding a second interactive control inside it is invalid HTML and breaks keyboard/AT navigation. `AddressPanel.vue`'s saved-address `<li>` already solved this exact shape in this codebase: non-interactive wrapper, one button for "open," one sibling button for the row action.
- `requestVersion` already guards `refresh()` against races (page change, address switch mid-flight) — the code-fetch pass added in this phase must respect the same version token so a stale batch of `/messages/{id}` responses can't write into `codeCache` after the user has switched pages/addresses.

## Requirements

### Functional

- After `collection.value` is set in `refresh()`, for the current page's messages (`value['hydra:member']`), fetch `api.message(session.token, id)` for every id not already in `codeCache`, in parallel (`Promise.allSettled`) — do not block `loading.value = false` on this pass (list renders immediately; code chips populate as fetches resolve, since `codeCache` is a `ref`/reactive `Map`).
- Store `extractVerificationCode(subject, text, html)` result per id in `codeCache`, including `''` for "checked, no code" (prevents re-fetching a row with no code every poll).
- Guard the fetch pass with the same `requestVersion` `refresh()` already uses: if the version has advanced by the time a `message()` call resolves, discard the result.
- Render the row (see Architecture below) as a non-button wrapper containing: the existing open-button (unchanged content/behavior) as one child, plus — only when `codeCache.get(item.id)` is a non-empty string — a code chip showing the code text and a copy icon-button as a sibling.
- Copy button: `type="button"`, `@click="copyAction(codeCache.get(item.id) ?? '')"` (reuse the existing `copyAction()` helper already in the file, just change the success toast message), `aria-label` from a new `t('inbox.copyCodeFor', { address: item.from.address })`-style key — actually key on something row-identifying; use the message subject or address, whichever reads better in the label (decide during implementation, follow `bulkCode.copyCodeFor`'s `{ address }` param shape if an address is natural, else drop the param and rely on visual context like the existing per-row buttons in this codebase do).
- Reset `codeCache` (`new Map()`) in `resetSession()` alongside `knownIds`/`initialized`.

### Non-functional

- No new npm dependency, no new backend call shape (`api.message` already exists and is used elsewhere in this file).
- Must not regress existing `InboxView.test.ts` coverage — row click still opens `MessageReader`, search/pagination/polling tests unaffected.
- Works with 0, 1, and many rows per page; works when `message_limit` is raised (admin setting, max 100) — no hard-coded assumption about page size.

## Architecture

```
InboxView.vue
├── codeCache = ref(new Map<string, string>())     // new
├── refresh()
│     ...existing collection load...
│     if success: void resolveCodes(value['hydra:member'], version)   // new, fire-and-forget
├── async function resolveCodes(items, version)     // new
│     targets = items.filter(i => !codeCache.value.has(i.id))
│     await Promise.allSettled(targets.map(fetch api.message → extract → codeCache.value.set(id, code || '')))
│     (each write checked against `version === requestVersion` before applying)
├── resetSession(): codeCache.value = new Map()      // extended
└── template: message-row v-for
      <li class="message-row-item">                 // was: <button class="message-row" ...>
        <button class="message-row" @click="selectedId = item.id"> …unchanged inner content… </button>
        <button v-if="codeCache.get(item.id)" class="message-row-code" @click="copyAction(codeCache.get(item.id))">
          <span class="code-value">{{ codeCache.get(item.id) }}</span>
          <AppIcon name="copy" />
        </button>
      </li>
```

Outer list container changes from a bare `<template v-else>` list of `<button>`s to a `<ul>`/`<div>` wrapping `<li>`/`<div class="message-row-item">` per message — check current markup (`InboxView.vue` lines ~473-495) before editing; keep `v-if="error"` list-error paragraph and the `v-for` key/`:class="{ unread }"` binding intact, just move `unread` class + click handler onto the inner open-button, and move the wrapper's `key` onto the new outer element.

## Related Code Files

- Modify: `frontend/src/components/InboxView.vue` — `codeCache` state, `resolveCodes()`, `resetSession()` cache clear, row markup split, new `copyAction()` call site (or a small `copyCode(id)` wrapper if the label logic needs the row's address/subject).
- Modify: `frontend/src/styles.css` — restyle `.message-row` rules for the new wrapper (`.message-row-item` container, `.message-row` no longer needs to be the full-width block if a sibling sits beside/below it — decide inline-trailing vs. second-line placement during implementation, keep it readable at the existing 640px mobile breakpoint), new `.message-row-code`/`.code-value` rules.
- Modify: `frontend/src/i18n.ts` — add `inbox.copyCodeFor` (or equivalent) and `inbox.codeCopied` keys, both `en` and `vi`.
- Modify: `frontend/src/tests/InboxView.test.ts` — new coverage (see Implementation Steps).
- No change: `frontend/src/verificationCode.ts`, `src/api_server.py`, `src/api_models.py` (list endpoint stays preview-only; this feature reads the same `/messages/{id}` the reader already exposes).

## Implementation Steps

1. Add `codeCache` ref + `resolveCodes()` in `InboxView.vue`; call it from `refresh()` right after `collection.value = value` (only for `requestedPage === 1` and beyond — actually for whichever page loaded, current page's own ids). Clear it in `resetSession()`.
2. Split the row markup: wrap each message in a non-button element, keep the existing content/behavior inside the open-button unchanged, add the conditional code chip + copy button as a sibling. Verify no nested interactive elements (`<button>` inside `<button>`).
3. Wire the copy button to `copyAction(code)` (existing helper) with a distinct success toast — either reuse `t('address.copied')` or add `t('inbox.codeCopied')` for clarity; match whichever the `bulkCode.*` precedent used (`bulkCode.codeCopied` — mirror that).
4. Add/update CSS for the new wrapper and code chip — compact, monospace-ish for the digits, doesn't push the row height up meaningfully, stays legible at the 640px breakpoint.
5. Add new `en`/`vi` i18n keys (`inbox.copyCodeFor` or similar, `inbox.codeCopied`).
6. Tests in `InboxView.test.ts`:
   - a row whose message body contains a code shows the code chip and copy button; clicking it calls `copyText` with the right value and shows the success toast.
   - a row whose message has no code shows no chip.
   - `codeCache` isn't re-fetched on a subsequent poll tick for an already-resolved id (assert `api.message` call count doesn't grow across two `refresh()`s for the same id).
   - switching address (`resetSession`) clears previously shown codes for the old session's ids.
   - clicking the row (not the copy button) still opens `MessageReader` (regression check on the markup split).

## Todo List

- [x] `codeCache` populated via `resolveCodes()`, guarded by `requestVersion`, cleared on `resetSession()`
- [x] Row markup split into wrapper + open-button + conditional copy button, no nested `<button>`
- [x] Copy button copies the right value, shows success/error toast, doesn't trigger row open
- [x] CSS: chip readable at desktop and 640px mobile breakpoint, doesn't visually clutter rows with no code
- [x] i18n keys added in both `en` and `vi`
- [x] New tests green, full existing `InboxView.test.ts` suite still green (`npx vitest run frontend/src/tests/InboxView.test.ts`)

## Success Criteria

- Opening the inbox with a code-bearing message shows the code + copy button on that row without clicking into it; clicking the button copies the code and shows a toast.
- Rows without a detectable code show no chip — no visual noise.
- Polling doesn't re-fetch a row already resolved (verified by call-count assertion in tests, not just eyeballing).
- Clicking anywhere on the row's open-button still opens `MessageReader`; clicking the copy button does not.

## Risk Assessment

- **Markup split regressing keyboard/focus behavior:** `InboxView.test.ts` already has a focus-management test (`moves focus to the back button when the reader opens and back to the list when it closes`) — rerun it after the split; the `listHeading` focus-return target is unaffected (that's the list's `<h2>`, not a row), but tab order through rows changes (now two focusable elements per row instead of one) — confirm intentional per Design Decisions, not a defect.
- **First page load with many uncached rows** fires one fetch per row in parallel — acceptable per plan-level scope decision (no throttling), but watch for this being visibly slow/janky in the `run-tmail` live check with a page full of messages; if so, that's a follow-up, not a blocker for this phase.

## Security Considerations

- No new attack surface — `GET /messages/{id}` is the same bearer-token-gated endpoint `MessageReader.vue` already calls for the currently-open message; this phase just calls it eagerly for more rows. No new data exposed beyond what opening each message already reveals to the session's token holder.

## Next Steps

- None — this is the only phase. After merge, consider (not now): copy-all-codes-on-page if user feedback asks for it; concurrency-limited fetch if `message_limit` at 100 proves janky in practice.
