---
title: "Inbox code column"
description: "Show each inbox message row's extracted verification code inline with a one-click copy button, so a visitor never has to open the message just to grab the code."
status: completed
priority: P2
effort: 3h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-08-19
---

# Inbox code column

## Overview

`InboxView.vue`'s message list currently shows sender, date, subject, and a preview snippet per row — the visitor must click into `MessageReader.vue` to see (and copy) a verification code. Add a compact code chip + copy button directly on each row, reusing the existing `extractVerificationCode()` extraction (`frontend/src/verificationCode.ts`, already shared with `BulkCodeView.vue` and the new-mail toast). No new backend endpoint.

## Design decisions (resolved during scope challenge)

- **Extraction source: full message body, not the list preview.** `MessageSummary.intro` (`GET /messages`) is a truncated JMAP preview — not reliable for a code that appears mid-body. Match the codebase's existing precedent (`BulkCodeView.vue`, the new-mail toast in `InboxView.vue`'s `announceToast`): fetch the full message via `GET /messages/{id}` and run `extractVerificationCode(subject, text, html)` on that.
- **Cache by message id, fetch only what's uncached.** Message content is immutable once created, so a `Map<string, string>` (`codeCache`, keyed by message id, `''` counts as "checked, no code") persists across poll ticks — a row already resolved is never re-fetched. On each `refresh()`, after the list loads, kick off `GET /messages/{id}` only for the current page's ids not yet in the cache, in parallel (`Promise.allSettled`, unthrottled — same pattern `BulkCodeView.vue` already uses, and `/messages/{id}` isn't behind the `/token` fixed-window limiter). Reset the cache in `resetSession()` (address switch) alongside the other per-session state.
- **No concurrency cap.** `message_limit` (site setting) tops out at 100/page (`src/admin_api.py`), so a worst-case first load of a full page fires up to 100 parallel fetches; the browser's per-origin connection cap naturally serializes the rest. Default is 15. Not worth throttling for v1 — flagged as a deferred follow-up if it proves to be a real problem.
- **Row markup must split, not nest.** Today `.message-row` is a single `<button>` wrapping the whole row (opens `MessageReader`). A nested `<button>` for copy would be invalid HTML (interactive-in-interactive) and bad for a11y. Follow the existing sibling-buttons pattern from `AddressPanel.vue`'s saved-address list (`<li><button class="saved-address">…open…</button><button class="forget-button">…action…</button></li>`): wrap each row in a non-interactive `<li>`/`<div>`, keep the existing open-button as one child, add the code chip + copy button as a sibling.
- **Visibility: only when a code exists.** No "(no code)" placeholder cluttering every non-OTP row — the chip/button renders only once `codeCache.get(id)` is a non-empty string. While the fetch for that row is in flight, show nothing (no per-row skeleton) — the list already has a page-level loading state, and a code chip is a bonus affordance, not core content.
- **Copy affordance:** icon-only button (`AppIcon name="copy"`), `aria-label` templated per-row (mirror `bulkCode.copyCodeFor` → new `inbox.copyCodeFor`), on click `copyText()` + `toast.success(t('inbox.codeCopied'))` (new key, mirrors `bulkCode.codeCopied`), errors via existing `error.copy`. Click must not trigger the row's open action — sibling element, so no `.stop` needed, but keep `type="button"` to avoid form-submit surprises (list isn't inside a `<form>`, but matches every other button in the file).
- **Deferred (NOT in scope):** copy-all-codes-on-page, showing the code in the collapsed/mobile row differently than desktop, re-extracting if a message's body could ever change (it can't — Stalwart messages are immutable), throttling parallel fetches.

## Cross-Plan Dependencies

Scanned `plans/`: all existing plans are `completed`/`done`. No unfinished plan touches `InboxView.vue`, `verificationCode.ts`, or `styles.css`'s `.message-row*` rules — no `blockedBy`/`blocks` relationship to record.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Code column: fetch/cache + row UI](./phase-01-code-column.md) | Completed |

## Dependencies

- No new npm package, no new backend endpoint.
- Reuses `extractVerificationCode` (`frontend/src/verificationCode.ts`), `api.message`, `copyText`, `useToast`, `useI18n`, `AppIcon` — all existing.
