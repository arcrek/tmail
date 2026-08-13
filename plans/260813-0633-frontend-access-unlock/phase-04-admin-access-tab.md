# Phase 4: Admin Access tab UI

## Context Links

- Plan: [plan.md](./plan.md)
- Depends on: [Phase 2](./phase-02-admin-credential-api.md) (admin credential endpoints)
- `frontend/src/admin/AdminApp.vue` — tab registration pattern
- `frontend/src/admin/DomainsTab.vue` or `GeneralTab.vue` — closest existing tab shape (form + list + `busy`/`updated` emits) to copy structurally
- `frontend/src/admin/MailServerTab.vue` — closest existing "masked secret, shown-once-ish" precedent (`MASKED_SECRET` for `jmap_token`)

## Overview

- Priority: P2
- Status: Complete
- New "Access" admin tab: list existing credentials, form to add a password, button to generate a token, revoke action per row.

## Key Insights

- `AdminApp.vue` tabs are a flat const array (`tabs`) rendered as `role="tab"` buttons plus a `v-else-if` chain in the template — adding a tab means one array entry + one template branch, not a router change.
- Existing tabs take `:csrf="csrf"` as a prop and emit `@busy` / `@updated` back to `AdminApp.vue`; `AccessTab.vue` doesn't need `@updated` (credentials aren't part of `AdminSettings`) but should still emit `@busy` so tab-switching is disabled mid-mutation, matching every other tab's behavior.
- A freshly-generated token/password must be shown in a clearly one-time, copyable panel (visually distinct, e.g. same treatment `mail.tokenHelp`'s masking implies for the reverse case) — once the admin navigates away or the list refreshes, it's gone for good (matches Phase 2's "shown once" API contract).

## Requirements

### Functional

- `AdminApp.vue`: add `{ id: 'access', key: 'admin.access' }` to the `tabs` array; add `<AccessTab v-else-if="activeTab === 'access'" :csrf="csrf" @busy="childBusy = $event" />` to the template's tab-panel chain.
- New `frontend/src/admin/AccessTab.vue`:
  - On mount, `GET /admin/api/access-credentials` → render a table/list: kind badge (password/token), label, created date, "Revoke" button per row.
  - "Add password" mini-form: label input + password input (+ confirm, client-side only) → `POST` with `kind: "password"`.
  - "Generate token" mini-form: label input + button → `POST` with `kind: "token"`.
  - On successful create, show the returned `secret` once in a dismissible, copy-to-clipboard panel (reuse `copyText` from `frontend/src/clipboard.ts`, same as `AddressPanel.vue`'s copy-address button), then refresh the list.
  - "Revoke" button per row → confirm (reuse the native `confirm()` pattern already used for `domains.confirm` in `DomainsTab.vue`, or an inline are-you-sure toggle — match whichever `DomainsTab.vue` actually does) → `DELETE /admin/api/access-credentials/{id}` → refresh the list.
- `api.ts` `admin` section: add `accessCredentials: { list, create, remove }` following the exact shape of `admin.syncDomains` / `admin.testMail` (all take `csrf` where mutating).
- `types.ts`: add `AccessCredential { id: string; kind: 'password' | 'token'; label: string; createdAt: string }` and a create-response type carrying the optional one-time `secret`.
- `i18n.ts`: add `admin.access` tab label plus an `access.*` namespace (eyebrow, list headers, add-password form labels, generate-token button, secret-reveal panel copy, revoke confirm/button, error strings) in both `en` and `vi`.

### Non-functional

- Match existing tab visual structure exactly (`panel`, `settings-form`, `field` classes) — no new CSS system, reuse `frontend/src/styles.css` classes already used by sibling tabs.

## Architecture

```
AdminApp.vue
  tabs: [...existing, {id:'access', key:'admin.access'}]
  <AccessTab :csrf @busy>

AccessTab.vue
  onMounted → api.admin.accessCredentials.list() → credentials.value
  addPassword() → api.admin.accessCredentials.create({kind:'password', label, password}, csrf) → show secret once → refresh list
  generateToken() → api.admin.accessCredentials.create({kind:'token', label}, csrf) → show secret once → refresh list
  revoke(id) → api.admin.accessCredentials.remove(id, csrf) → refresh list
```

## Related Code Files

- Create `frontend/src/admin/AccessTab.vue`
- Modify `frontend/src/admin/AdminApp.vue` — tab registration
- Modify `frontend/src/api.ts` — `admin.accessCredentials.{list,create,remove}`
- Modify `frontend/src/types.ts` — `AccessCredential` + create-response type
- Modify `frontend/src/i18n.ts` — `admin.access` + `access.*` strings, both locales

## Implementation Steps

1. Add `accessCredentials` to `api.ts`'s `admin` object: `list: () => request<{credentials: AccessCredential[]}>('/admin/api/access-credentials')`, `create: (body, csrf) => request<AccessCredential & {secret?: string}>('/admin/api/access-credentials', {method:'POST', csrf, ...json(body)})`, `remove: (id, csrf) => request<void>('/admin/api/access-credentials/' + encodeURIComponent(id), {method:'DELETE', csrf})`.
2. Add the `AccessCredential` type (and inline the create-response as `AccessCredential & { secret?: string }`, no separate type needed) to `types.ts`.
3. Scaffold `AccessTab.vue` with `<script setup lang="ts">` following `DomainsTab.vue`'s prop/emit shape (`defineProps<{ csrf: string }>()`, `defineEmits<{ busy: [boolean] }>()`).
4. Implement `loadCredentials()`, `addPassword()`, `generateToken()`, `revoke(id)` per the Architecture section; set `emit('busy', true/false)` around each mutating call.
5. Build the template: heading + eyebrow, credentials list/table, two forms (password / token), and a conditional one-time secret-reveal panel with a copy button (`copyText` from `../clipboard`).
6. Register the tab in `AdminApp.vue`: array entry + template branch, matching existing tabs exactly.
7. Add all new i18n keys to both `en` and `vi` in `i18n.ts`.

## Todo List

- [ ] `api.ts` `admin.accessCredentials` added
- [ ] `types.ts` `AccessCredential` added
- [ ] `AccessTab.vue` created (list, add-password, generate-token, revoke, one-time secret reveal)
- [ ] `AdminApp.vue` tab registered
- [ ] `i18n.ts` `admin.access` + `access.*` strings in both locales
- [ ] `npm run build` succeeds

## Success Criteria

- Admin can add a password credential, see it in the list without the password ever shown again after the initial reveal.
- Admin can generate a token credential, copy the shown-once secret, and it appears in the list afterward without the secret.
- Revoking a credential removes it from the list and (per Phase 1/2) invalidates future `/unlock` attempts with that secret.
- Tab switching is disabled while an Access-tab mutation is in flight, matching every other tab's `busy` behavior.

## Risk Assessment

- **Risk:** admin loses the one-time secret before copying it (closes panel, refreshes). **Mitigation:** no server-side recovery is possible by design (secret is only ever hashed) — call this out explicitly in the UI copy ("shown once, save it now") rather than trying to solve it technically.
- **Risk:** empty credential list on first visit could look broken. **Mitigation:** explicit empty state, matching `address.none` / `domains.none`'s empty-state pattern elsewhere in the codebase.

## Security Considerations

- Tab is only reachable inside the authenticated admin shell (`AdminApp.vue`'s `v-else` branch, already gated on a valid session) — no additional auth needed at the component level.
- All mutating calls carry `csrf`, consistent with every other admin tab.

## Next Steps

- Phase 5 covers end-to-end test coverage for this tab alongside the public unlock flow.
