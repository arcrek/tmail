---
title: "Inbox search/filter"
description: "Client-side filter of the currently loaded message page by sender or subject."
status: done
priority: P1
effort: 2h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-08-14
---

# Inbox search/filter

## Overview

`InboxView.vue` renders `messages.value` (the current page's `MessageSummary[]`) directly. Add a
text input that filters that same array client-side by `from.name`/`from.address`/`subject`
(case-insensitive substring). No backend change.

## Scope challenge

- Existing code: `messages` is already a `computed(() => collection.value?.['hydra:member'] ?? [])`
  — turn this into a filtered computed instead of adding a second array. `MessageSummary` already
  carries `from` and `subject` client-side; no new field needed.
- Minimum change: one `ref<string>('')` for the query, one computed filter, one `<input>` in the
  template, 2 new i18n keys (label + empty-state-when-filtered text).
- Complexity: 1 file (`InboxView.vue`) + 1 test file + 1 i18n file. Single phase.

## Decisions

- **Filters the loaded page only, not the whole mailbox.** `/messages` is paginated
  (`settings.message_limit`, default 15/page) and there is no backend search endpoint. Searching
  across all pages would need a new JMAP query capability — out of scope here per YAGNI; this is a
  quick client-side narrowing tool for "find the mail I can already see," not mailbox-wide search.
  Document this limitation directly in the empty-state copy so it isn't a silent surprise (e.g.
  "No messages on this page match — try Next page" rather than implying nothing matches anywhere).
- **No new backend endpoint, no debounce infra needed** — filtering an in-memory array of ≤
  `message_limit` items on every keystroke is not a performance concern; skip `useDebounceFn`-style
  machinery some Vue codebases reach for by default (YAGNI).
- **Query resets on page change and on address/session change** — same as the existing
  `selectedId = null` reset in `changePage()`/`resetSession()`, since a stale query silently
  hiding all of a new page's messages would be confusing.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Add client-side filter input](./phase-01-client-filter.md) | Done |

## Validation

- `npm test -- --run src/tests/InboxView.test.ts` — new filter tests pass, existing tests
  unaffected.
- Manual: type a sender name fragment, subject fragment; list narrows; clear query, full page
  list returns; change page or open a new address, query resets to empty.
