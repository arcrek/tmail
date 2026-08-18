# Phase 1: Bulk generate feature

## Context Links

- Plan: [plan.md](./plan.md)
- Existing single-random flow: `frontend/src/components/AddressPanel.vue:71-82` (`randomize()`)
- Route reconciliation (reused unmodified for opening): `frontend/src/App.vue:104-133` (`reconcileRoute`, `openInbox`)
- Header: `frontend/src/components/AppHeader.vue`
- i18n dictionary: `frontend/src/i18n.ts` (flat `'namespace.key': string` maps, `en` + `vi`)
- Icons: `frontend/src/components/AppIcon.vue` (`external-link`, `copy`, `check`, `sparkles` already exist)

## Overview

- **Priority:** P2
- **Status:** Completed
- Add a self-contained bulk-generator view reachable from a new header tab. No backend touched.

## Key Insights

- `POST /token` (`src/api_server.py:562`) is public and per-address — no auth, no rate limit, already called directly by the existing single-random flow (`api.token()`, not `api.accounts()`). This is why bulk generation needs zero backend work: generating N address *strings* is pure client-side randomness, and "opening" one is just navigating the SPA to `/{address}`, which independently triggers its own `/token` call when that tab loads.
- `App.vue: reconcileRoute()` already handles the case of a fresh tab landing on `/{address}` with no remembered session: it calls `api.token(route.address)` and opens the inbox. Opening a generated address in a new tab requires nothing more than `window.open(`/${encodeURIComponent(address)}`, '_blank', 'noopener')`.
- Existing rate limiter (`plans/260814-1811-account-creation-rate-limit`) only guards `POST /accounts`. This feature never calls `/accounts`. Confirmed no interaction.
- `AddressPanel.vue`'s `randomize()` (lines 71-82) already contains the exact local-part algorithm to reuse: alternating consonant/vowel from `crypto.getRandomValues`, plus random domain pick. Extract it to a shared util so both call sites stay in sync (DRY) instead of duplicating the alphabet arrays.

## Requirements

### Functional
- Header nav shows a "Bulk generate" tab-style button alongside existing `/docs`, `/admin` links.
- Clicking it swaps the main content area to a new `BulkGenerateView` (no URL/history change — `view.value = 'bulk'` only, mirrors how `'admin'`/`'inbox'` already swap `App.vue`'s main content).
- View shows: a count input (`type="number"`, `min="1"`, `max="50"`, default e.g. `10`), a "Generate" button, and (after generating) a list of addresses.
- Each list row shows the address, a **Copy** button (reuse `copyText` from `frontend/src/clipboard.ts`, same pattern as `AddressPanel.copyAddress`), and an **Open in new tab** button (`AppIcon name="external-link"`).
- Generation is 100% client-side: no `/token` or `/accounts` call happens until a row's open button is clicked.
- Addresses within one generated batch are unique (Set-based dedupe with a bounded retry loop — see Architecture).
- Domains list is loaded the same way `AddressPanel.vue` does (`api.domains(1, accessToken)`, filtered to `isActive !== false`); handle loading/error/empty states with the same panel patterns (`loading-panel` / `empty-state` classes already in `styles.css`).
- Brand-click ("home") from the header still works and returns to `'address'` view when in `'bulk'` view (reuse existing `newAddress()` handler — no change needed there since it unconditionally sets `view.value = 'address'`).

### Non-functional
- No new backend endpoint, no new persistence, no rate-limit change.
- Batch is ephemeral: not saved to `localStorage` (existing `session.ts` `saveSession` is only called once a row is actually opened, by the *destination* tab's own `reconcileRoute` — unchanged).
- i18n: every new user-facing string gets `en` + `vi` entries in `frontend/src/i18n.ts`, following existing flat-key convention (`bulk.*` namespace).
- Respect existing accessibility patterns: `aria-live` on loading/result regions (see `AddressPanel.vue`'s `loading-panel`), `aria-label` on icon-only buttons, `aria-current="page"` on the active header tab.

## Architecture

### New util: `frontend/src/randomAddress.ts`

```ts
const CONSONANTS = 'bcdfghjkmnprstvwxz'
const VOWELS = 'aeiou'

export function randomLocalPart(): string {
  const values = crypto.getRandomValues(new Uint32Array(6))
  return Array.from(values, (value, index) => {
    const alphabet = index % 2 ? VOWELS : CONSONANTS
    return alphabet[value % alphabet.length]!
  }).join('')
}

export function randomDomain(domains: string[]): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1))
  return domains[value! % domains.length]!
}

/** Generates up to `count` unique `local@domain` addresses, one random domain per address. */
export function randomAddressBatch(domains: string[], count: number): string[] {
  const seen = new Set<string>()
  const maxAttempts = count * 20
  for (let attempts = 0; seen.size < count && attempts < maxAttempts; attempts += 1) {
    seen.add(`${randomLocalPart()}@${randomDomain(domains)}`)
  }
  return [...seen]
}
```

- `maxAttempts` guard: with 6 chars alternating from 9/18-letter alphabets and up to N domains, collision probability at count=50 is negligible, but the cap prevents any theoretical infinite loop; if the cap is hit, the batch is simply shorter than requested (surface this — see Todo).

### Modify `AddressPanel.vue`

- Replace the inline algorithm in `randomize()` (lines 73-80) with:
  ```ts
  import { randomDomain, randomLocalPart } from '../randomAddress'
  // ...
  localPart.value = randomLocalPart()
  selectedDomain.value = randomDomain(domains.value.map((d) => d.domain))
  ```
- Behavior-preserving refactor only — `AddressPanel.test.ts` / `address-flow.test.ts` must still pass unchanged.

### New `frontend/src/components/BulkGenerateView.vue`

- Props: `{ accessToken?: string }` (same as `AddressPanel`).
- State: `domains`, `loadingDomains`, `domainError` (loaded via `api.domains`, same pattern as `AddressPanel.vue:38-53` — duplicated here rather than extracted into a shared composable; the loading logic is ~12 lines and extracting a composable for two call sites is not worth the indirection per YAGNI).
- State: `count = ref(10)`, `addresses = ref<string[]>([])`, `copiedAddress = ref('')`.
- `generate()`: clamps `count.value` to `[1, 50]`, calls `randomAddressBatch(domains.value.map(d => d.domain), count.value)`, assigns to `addresses.value`.
- `openInNewTab(address: string)`: `window.open(`/${encodeURIComponent(address)}`, '_blank', 'noopener')`.
- `copy(address: string)`: reuse `copyText` from `../clipboard`, same success/failure toast pattern as `AddressPanel.copyAddress`.
- Template: panel-style layout matching existing `.panel` / `.panel-heading` classes; count `<input type="number">` + Generate `<button class="primary-button">`; result `<ul>` reusing `.saved-inboxes`-style row layout (address + two action buttons) — add a small `.bulk-list` variant in `styles.css` since rows need 2 actions (copy + open) vs. `saved-inboxes`' 1 (forget).

### Modify `AppHeader.vue`

- Add emit `bulk: []` to `defineEmits`.
- Add nav entry after `/docs`, before `/admin` (or after `/admin` — either order fine, keep visually grouped with internal-view links):
  ```html
  <a
    class="bulk-link"
    href="#"
    :aria-current="props.activeView === 'bulk' ? 'page' : undefined"
    @click.prevent="emit('bulk')"
  >
    <AppIcon name="sparkles" />
    {{ t('nav.bulk') }}
  </a>
  ```
- Add new prop `activeView?: View` (or simpler: `isBulkActive?: boolean`) so the tab can show active state — keep it minimal, just a boolean prop `bulkActive`.

### Modify `App.vue`

- `type View = 'address' | 'inbox' | 'admin' | 'bulk'`.
- Add handler:
  ```ts
  function openBulk(): void {
    navigationVersion += 1
    view.value = 'bulk'
  }
  ```
- Wire `@bulk="openBulk"` on `<AppHeader>`, pass `:bulk-active="view === 'bulk'"`.
- In `<main>` template, add a branch: `<BulkGenerateView v-else-if="view === 'bulk'" :access-token="accessToken" />` alongside the existing `AdminApp` / inbox / address branches (mirror the existing `v-if`/`v-else-if` chain structure at `App.vue:230-260`).
- `showLocalePicker`/`showUnlock` header props: keep `true` for `'bulk'` view (same as `'address'`/`'inbox'`) — only `'admin'` hides them today; no change needed since those props already default from `view !== 'admin'`.

### i18n (`frontend/src/i18n.ts`)

Add to both `en` and `vi` maps (flat keys, follow existing naming style):

| Key | en | vi |
|---|---|---|
| `nav.bulk` | Bulk generate | Tạo hàng loạt |
| `bulk.title` | Generate multiple addresses | Tạo nhiều địa chỉ |
| `bulk.lede` | Pick how many random addresses to create. | Chọn số lượng địa chỉ ngẫu nhiên cần tạo. |
| `bulk.countLabel` | Number of addresses | Số lượng địa chỉ |
| `bulk.generate` | Generate | Tạo |
| `bulk.generating` | Generating | Đang tạo |
| `bulk.empty` | Generate a batch to see addresses here. | Tạo một đợt để xem địa chỉ ở đây. |
| `bulk.open` | Open in new tab | Mở ở tab mới |
| `bulk.copy` | Copy | Sao chép |
| `bulk.copied` | Copied | Đã sao chép |
| `bulk.copiedNotice` | Address copied. | Đã sao chép địa chỉ. |
| `bulk.partial` | Only {count} unique addresses could be generated. | Chỉ tạo được {count} địa chỉ duy nhất. |

(Reuse existing `address.loading` / `address.failed` / `address.retry` / `address.none` / `address.noneHelp` / `error.copy` keys for the domain-loading states instead of duplicating them.)

### Styles (`frontend/src/styles.css`)

- `.app-header-nav a[aria-current="page"]` (or a `.bulk-link.active` class) — small color/underline treatment so the tab reads as "active" while in bulk view.
- `.bulk-list` — row layout like `.saved-inboxes li` but `grid-template-columns: minmax(0,1fr) auto auto` (address, copy, open).

## Related Code Files

**Create:**
- `frontend/src/randomAddress.ts`
- `frontend/src/components/BulkGenerateView.vue`

**Modify:**
- `frontend/src/components/AddressPanel.vue` (swap inline random algorithm for `randomAddress.ts` import)
- `frontend/src/components/AppHeader.vue` (new nav tab + emit)
- `frontend/src/App.vue` (`View` type, `openBulk`, render branch)
- `frontend/src/i18n.ts` (new keys, en + vi)
- `frontend/src/styles.css` (active-tab + bulk-list styles)

## Implementation Steps

1. Create `frontend/src/randomAddress.ts` with `randomLocalPart`, `randomDomain`, `randomAddressBatch`.
2. Refactor `AddressPanel.vue.randomize()` to use the new util; run `npx vitest run frontend/src/tests/address-flow.test.ts` to confirm no regression.
3. Add `bulk.*` and `nav.bulk` keys to both locales in `i18n.ts`.
4. Build `BulkGenerateView.vue`: domain loading (mirroring `AddressPanel.vue`), count input, generate, list with copy/open actions, loading/error/empty states.
5. Add active-tab styling + `.bulk-list` styles to `styles.css`.
6. Add the `bulk` emit + nav link + `bulkActive` prop to `AppHeader.vue`.
7. Wire `View` type, `openBulk()`, header props, and the new render branch in `App.vue`.
8. Manually verify via the `run-tmail` skill: generate a batch, open one address in a new tab, confirm the inbox loads.

## Todo List

- [x] `randomAddress.ts` created and unit-testable in isolation
- [x] `AddressPanel.vue` refactored, existing tests still pass
- [x] `BulkGenerateView.vue` built with loading/error/empty/populated states
- [x] Header tab added, active-state visible, keyboard/`aria-current` correct
- [x] `App.vue` wiring complete, brand-click still returns to address view from bulk view
- [x] i18n keys present in both `en` and `vi`, no missing-key fallback triggered
- [x] Styles added, responsive at narrow viewport (reuse existing breakpoint patterns near `styles.css:1540`)

## Success Criteria

- From the header, a visitor can open the bulk view, set a count (1-50), click Generate, and see that many unique addresses.
- Clicking "Open in new tab" on any row opens a new browser tab that lands on a working inbox for that address (via existing route reconciliation — no new backend code involved).
- Copy button copies the row's address and shows the copied state, matching `AddressPanel`'s existing copy UX.
- No network request fires until Generate (domain load) or Open/Copy is used — confirmed via browser devtools network tab during manual check.
- `AddressPanel.vue`'s existing behavior and tests are unaffected by the refactor.

## Risk Assessment

- **Popup blockers:** browsers only allow `window.open` from a direct user click (which this is, per-row) — no risk since we deliberately avoided "open all". Document this is why bulk-open-all was descoped.
- **Collision retry loop:** bounded by `maxAttempts`; if hit, batch is shorter than requested — surface via `bulk.partial` toast/notice rather than silently returning fewer addresses with no explanation.
- **Duplicate logic drift:** mitigated by extracting `randomAddress.ts` instead of copy-pasting the algorithm a second time.

## Security Considerations

- No new attack surface: address generation is client-side only; opening an address still goes through the exact same public `/token` exchange every existing address open already uses. Generating a large batch cannot be used to enumerate real mailboxes any more than the existing single "Random" button already allows (same alphabet, same domains).
- Count is clamped client-side to 50; since no request is sent at generation time, there's no server-side abuse vector to worry about (nothing to rate-limit).

## Next Steps

- Phase 2: tests + manual verification via `run-tmail`.
