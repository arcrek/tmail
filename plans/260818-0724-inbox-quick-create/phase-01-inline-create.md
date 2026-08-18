# Phase 1: Inline create form + App.vue in-place switch

## Context Links

- Plan: [plan.md](./plan.md)
- Hero markup to extend: `frontend/src/components/InboxView.vue` (`.inbox-hero`/`.inbox-hero-address`/`.inbox-hero-actions`)
- Form pattern to mirror: `frontend/src/components/AddressPanel.vue` (`localPart`/`selectedDomain`/`randomize`/`submit`)
- Session-switch logic to reuse: `frontend/src/App.vue` (`openInbox`, `openCreatedInbox`)

## Overview

- Priority: P2
- Status: Done
- Add a collapsible "Create an address" section below the address hero in `InboxView.vue`: local-part input, domain select (lazy-loaded), submit, Random shortcut. Wire its success to `App.vue` so the current inbox is replaced in place.

## Key Insights

- `AddressPanel.vue`'s `submit()`/`randomize()`/domain-loading logic is the exact pattern to reuse — same shape, different mount point. Don't invent a new address-creation flow; copy the proven one.
- `App.vue`'s `openInbox(session, updatePath = true)` already does everything needed for "switch to this new address in place, update the URL" — `openCreatedInbox()` is literally `navigationVersion += 1; openInbox(session)`. The new InboxView emit should trigger the same call, not a new code path.
- `InboxView.vue` has a `watch([() => props.session.address, () => props.session.token], resetSession)` — when `App.vue` swaps `current.value` to the new session, this watcher already fires and resets all the inbox state (messages, pagination, polling) for the new address. **The quick-create form doesn't need to manually reset anything** — just emit the new session and let the existing prop-watch machinery do its job, same as it already does when `App.vue`'s `openInbox` is called from any other path.
- The section must be collapsed by default — this is a secondary/power-user action, not competing for primary visual weight with the message list.

## Requirements

### Functional

- New collapsible section in `InboxView.vue`'s hero, below the current address display, toggled by a button labeled with the existing `address.create` i18n key ("Create an address"). Use `<details>`/`<summary>` or a button + `v-if` region with `aria-expanded` — pick whichever the codebase already leans toward (check `AddressPanel.vue`/`UnlockControl.vue` for a collapsible-section precedent before deciding).
- On first expand, lazy-fetch domains: `api.domains(1, accessToken)` — `InboxView.vue` needs an `accessToken` prop it doesn't currently have; add it (optional, default `''`, same contract as `AddressPanel`/`BulkGenerateView`) and have `App.vue` pass it through.
- Form fields: local-part text input (same validation attributes as `AddressPanel`'s: `minlength="1" maxlength="64" pattern="[A-Za-z0-9](?:[A-Za-z0-9._+\-]*[A-Za-z0-9])?"`), domain `<select>`, submit button, "Random" shortcut button (mirrors `AddressPanel.randomize()` — fills local part + domain and submits immediately).
- On submit: `api.token(newAddress, accessToken)` → emit `create: [session: AddressSession]` up to `App.vue`.
- `App.vue` handles the new `@create` emit by calling the same logic `openCreatedInbox` already encapsulates (reuse that function directly — `@create="openCreatedInbox"` if the emitted payload matches its signature).
- Loading/error states for the inline form mirror `AddressPanel`'s (`domainError` empty-state, `submitting` disabled state) but scoped to the collapsible section — a domain-load failure here must not affect the rest of the inbox view (messages keep working).
- Errors on submit (bad domain, rate-limited `/token`, etc.) surface via `toast.error()`, consistent with every other creation path in the app.

### Non-functional

- No new npm dependency.
- Domain fetch only happens once per expand-lifetime of the component (don't refetch on every toggle open/close — cache after first successful load, same one-shot pattern `AddressPanel`'s `onMounted(loadDomains)` uses, just triggered by first-expand instead of mount).

## Architecture

```
InboxView.vue
  + prop accessToken?: string = ''
  + emit create: [session: AddressSession]
  + createOpen = ref(false)
  + domains = ref<DomainResource[]>([]); domainsLoaded = ref(false); loadingDomains, domainError
  + createLocalPart = ref(''); createDomain = ref(''); createSubmitting = ref(false)
  + function toggleCreate(): open/close, triggers loadCreateDomains() on first open
  + async function loadCreateDomains(): same shape as AddressPanel.loadDomains, scoped to this section
  + async function submitCreate(): api.token(...) → emit('create', { address, token }) → collapse section, clear fields
  + async function randomizeCreate(): fills fields from randomLocalPart()/randomDomain(domains), then submitCreate()

App.vue
  <InboxView
    ...
    :access-token="accessToken"
    @new-address="newAddress"
    @create="openCreatedInbox"
  />
```

## Related Code Files

- Modify: `frontend/src/components/InboxView.vue` — new prop, emit, collapsible section state + template
- Modify: `frontend/src/App.vue` — pass `access-token` prop, wire `@create="openCreatedInbox"`

## Implementation Steps

1. Add `accessToken` prop to `InboxView.vue` (optional, default `''`); update `App.vue`'s `<InboxView>` usage to pass `:access-token="accessToken"`.
2. Add the collapsible section state (`createOpen`, domain-loading refs, form refs) and `toggleCreate`/`loadCreateDomains` following `AddressPanel.vue`'s domain-loading shape.
3. Add `submitCreate`/`randomizeCreate`, mirroring `AddressPanel.vue`'s `submit`/`randomize` but emitting `create` instead of calling a route-changing function directly.
4. Build the template: toggle button (`address.create` label) + collapsible region with local-part input, domain select, submit button, random button, loading/error states.
5. In `App.vue`, add `@create="openCreatedInbox"` to the `<InboxView>` element — confirm the emitted payload shape (`{ address, token }`) matches `openCreatedInbox`'s `AddressSession` parameter exactly (it should, given `api.token`'s `TokenResponse` shape already used elsewhere).
6. Manually verify: expand section, create an address, confirm the view switches in place (URL updates to `/{newAddress}`, message list resets to the new inbox's messages, no full page navigation).

## Todo List

- [x] `InboxView.vue` accepts `accessToken` prop, passed from `App.vue`
- [x] Collapsible "Create an address" section collapsed by default, expands on toggle
- [x] Domain list lazy-loads on first expand only (verified: no `/domains` request until the section is opened)
- [x] Submit creates the address and switches the current inbox in place (URL + message list both update, no navigation to `AddressPanel`)
- [x] Random shortcut works (fills + submits in one action, same as `AddressPanel.randomize()`)
- [x] Errors (bad domain, rate-limited) surface via toast, don't break the rest of the inbox view

## Success Criteria

- From an open inbox, expanding "Create an address", picking/typing a new address, and submitting lands on the new inbox's message list without ever showing the main `AddressPanel` page.
- The previously-open address is still reachable afterward via `AddressPanel`'s "Saved inboxes" list (confirms `saveSession` still ran as part of `openCreatedInbox`/`openInbox`).
- No `/domains` request fires for a user who never opens the "Create an address" section.

## Risk Assessment

- **Prop-watch double-reset:** `InboxView.vue`'s existing `watch([...], resetSession)` fires when `App.vue` swaps `current.value` — confirm this doesn't race with the quick-create form's own `createSubmitting`/cleanup state (the form's local refs live in the same component instance that's about to have its session props change out from under it via the watch; verify the component doesn't unmount/remount in a way that loses in-flight state, and that resetting `createOpen`/`createLocalPart` etc. on session change, if needed, doesn't fight the watch — likely fine since Vue keeps the component instance alive across a prop change, just confirm during implementation).
- **`accessToken` prop drift:** if the site's access-token changes (unlock/lock) while the create section is open with stale domains loaded under the old token, resubmitting could 401 — mirror `AddressPanel.vue`'s `watch(() => props.accessToken, loadDomains)` pattern for the create-section's domain list too, so it's not the one form in the app that doesn't react to unlock state changes.

## Security Considerations

- No new surface: `api.token` is the same public/stateless endpoint already called from `AddressPanel.vue`, `BulkGenerateView.vue`, and `App.vue`'s `reconcileRoute`. This phase adds a fourth call site, not a new capability.

## Next Steps

- Phase 2 covers tests, i18n for any new copy (toggle button aria-label, empty/loading states scoped to this section), and an accessibility pass on the collapsible region.
