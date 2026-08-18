---
title: "Toast notification actions"
description: "Extend the toast system with inline action buttons (copy email, copy code, ...) and wire a new-mail toast with copy actions into InboxView."
status: done
priority: P2
effort: 5h
issue: null
branch: main
tags: [feature, frontend, ux]
blockedBy: [260818-0722-bulk-code-reader]
blocks: []
created: 2026-08-18
---

# Toast notification actions

## Overview

The global toast system (`frontend/src/toast.ts` + `ToastStack.vue`, shipped in `260813-0827-toast-notifications`) currently only shows a message with a dismiss button. This plan generalizes `ToastEntry` to carry optional **actions** (label + click handler), renders them as buttons inside the toast, and applies the capability to a real call site: when a new message arrives in `InboxView.vue`, show a toast with **Copy email** and (when a verification code is found) **Copy code** actions — the concrete "copy email, copy code" example from the feature request — instead of only the existing silent browser `Notification`.

## Design decisions

- **Backward-compatible API.** `useToast().success(message, actions?)` / `.error(message, actions?)` — existing call sites (every one currently in the codebase) keep working unchanged with `actions` omitted.
- **Action click dismisses the toast.** Clicking an action button runs its handler then dismisses that toast immediately — matches common toast UX and keeps the composable simple (no separate "keep open" flag, YAGNI).
- **Longer duration for actionable toasts.** Plain toasts keep the existing 5s auto-dismiss; a toast with one or more actions gets 8s (needs enough time to notice + act, but the toast module already handles per-entry timers so this is a one-field change, not new machinery).
- **New-mail toast is additive, not a replacement.** `InboxView.vue`'s existing browser `Notification` (for granted permission) stays untouched — the in-app toast fires unconditionally (no permission needed) alongside it. Some users never grant browser notification permission; this gives them equivalent value.
- **Code extraction for the new-mail toast reuses `extractVerificationCode()`** from `260818-0722-bulk-code-reader` (`frontend/src/verificationCode.ts`) rather than duplicating the regex a third time — this is why this plan is `blockedBy` that one.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| Blocked by | [260818-0722-bulk-code-reader](../260818-0722-bulk-code-reader/plan.md) | pending — needs `frontend/src/verificationCode.ts` (created in that plan's Phase 1) |

No other unfinished plan touches `toast.ts`/`ToastStack.vue`/`InboxView.vue`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Toast core: action buttons](./phase-01-toast-actions-core.md) | Done |
| 2 | [InboxView new-mail toast with copy actions](./phase-02-inbox-new-mail-toast.md) | Done |
| 3 | [Tests & i18n](./phase-03-tests.md) | Done |

## Dependencies

- No new npm package.
- Requires `frontend/src/verificationCode.ts` from `260818-0722-bulk-code-reader` (Phase 1 of that plan is sufficient — don't wait for that plan's Phase 2/3).
