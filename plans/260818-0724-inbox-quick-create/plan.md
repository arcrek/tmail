---
title: "Inline quick-create address in inbox view"
description: "Add a 'Create an address' shortcut below the address hero in InboxView so a visitor can spin up and switch to a new inbox without navigating back to the main page."
status: pending
priority: P2
effort: 4h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-08-18
---

# Inline quick-create address in inbox view

## Overview

`InboxView.vue`'s hero currently shows the current address and a "New address" button that navigates back to the main page (`AddressPanel`) to pick a name/domain. This plan adds an inline, collapsible **"Create an address"** section directly in `InboxView.vue` — local-part input + domain select + submit (+ a "Random" shortcut, matching `AddressPanel`'s existing pattern) — so creating and switching to a new inbox never leaves the inbox view or hits the main page.

## Design decisions

- **Submit replaces the current inbox in place** (resolved via scope challenge): on success, the view switches to the newly created address's inbox and the URL updates to `/{newAddress}` — same end state `App.vue`'s `openInbox()` already produces for every other creation path. The just-left address is not lost: `openInbox()` already calls `saveSession()`, so it remains reachable from `AddressPanel`'s "Saved inboxes" list.
- **Additive, not a replacement** for the existing "New address" button — that one's job (go back to the main page, browse saved inboxes, change site/locale context) stays. This is a fast path for the common case ("I just want another address, right now").
- **Domain list loads lazily**, only when the user expands the "Create an address" section — `InboxView.vue` currently never fetches `/domains`; no reason to pay that request on every inbox view when the shortcut may go unused.
- **Reuses existing i18n key** `address.create` (`"Create an address"` / `"Tạo địa chỉ"`) already defined in `frontend/src/i18n.ts` for `AddressPanel`'s heading — same label, same concept, no new key needed for the section title.

## Cross-Plan Dependencies

None. Scanned `plans/`: no unfinished plan touches `InboxView.vue`'s hero section or `App.vue`'s session-switch logic. (`260814-1830-realtime-inbox-sse` touches `InboxView.vue`'s polling/streaming internals, not the hero markup — worth a quick diff-conflict check at implementation time if both are in flight simultaneously, but no structural dependency.)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Inline create form + App.vue in-place switch](./phase-01-inline-create.md) | Pending |
| 2 | [Tests, i18n, accessibility](./phase-02-tests.md) | Pending |

## Dependencies

- No new npm package.
- Reuses `api.domains`, `api.token`, `randomLocalPart`/`randomDomain`, `useToast`, `useI18n`, `saveSession` — all existing.
