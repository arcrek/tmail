---
title: "Toast notification system for frontend"
description: "Add a global toast layer and replace the repeated inline form-status/form-error message pattern across the public and admin frontend with it."
status: pending
priority: P2
effort: 6.5h
issue: null
branch: main
tags: [feature, frontend, ux, refactor]
blockedBy: []
blocks: []
created: 2026-08-13
---

# Toast notification system for frontend

## Overview

The frontend (Vue 3 + TS, `frontend/src`) currently shows transient success/error messages by duplicating the same pattern in 6 places: a local `status`/`error` ref, reset to `''` at the start of every action, rendered as `<p class="form-status" aria-live="polite">` / `<p class="form-error" role="alert">` at the bottom of the form. This plan adds one global toast system (`useToast()` composable + `ToastStack.vue`, mounted once in `App.vue`) and migrates every one of those call sites to it, deleting the duplicated refs/markup.

Decision from scope review: **replace all** inline status/error messages, not just add toast alongside them. Persistent UI states that happen to be driven by an error ref (e.g. `AddressPanel`'s `domainError`, which swaps the whole panel to an empty-state/retry view) are **not** transient messages and stay inline — only messages whose job is "tell the user what just happened, then go away" move to toast.

No new npm dependency — codebase has zero UI libraries today (`frontend/package.json` deps: `vue` only), so the toast is a small hand-rolled composable in the same style as `frontend/src/i18n.ts`/`session.ts`/`access.ts` (plain module-level reactive state, no Pinia).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Toast core: composable, component, styles, mount](./phase-01-toast-core.md) | Pending |
| 2 | [Migrate AddressPanel + App.vue route error](./phase-02-migrate-address-panel.md) | Pending |
| 3 | [Migrate 5 admin tabs](./phase-03-migrate-admin-tabs.md) | Pending |
| 4 | [i18n keys, tests, cleanup](./phase-04-tests-cleanup.md) | Pending |

## What moves to toast vs. what stays inline

| Location | Ref | Moves to toast? | Why |
|---|---|---|---|
| `AddressPanel.vue` | `domainError` | **No** | Gates which whole panel variant renders (loading/empty-state/form); not a transient message |
| `AddressPanel.vue` | `error` (submit/copy failure), `copied`/`copiedNotice` sr-only text | **Yes** | Transient result of an action |
| `AddressPanel.vue` | `unlockError` (×2, duplicated block) | **Yes** | Transient; also collapses duplicated markup into one call site pattern |
| `App.vue` | `error` (route token fetch failure, passed to `AddressPanel` as `initialError`) | **Yes** | Becomes a direct `toast.error()` call in `reconcileRoute()`; `initialError` prop removed entirely |
| `GeneralTab.vue`, `MailServerTab.vue`, `DomainsTab.vue`, `ContentTab.vue`, `AccessTab.vue` | `status`, `error` | **Yes** (all call sites) | Textbook transient save/validate/sync result messages |
| `DomainsTab.vue` | `displayedSync`/`displayedSuccessfulSync`/`displayedSyncError` + `.status-error` class | **No** | Persistent "last sync" history table, not a transient message — untouched |

## Dependencies

- No cross-plan dependencies (scan found no unfinished plan touching these files; one unrelated blocked plan exists: `260812-1455-domain-blacklist-patterns`).
- No new package dependency.
