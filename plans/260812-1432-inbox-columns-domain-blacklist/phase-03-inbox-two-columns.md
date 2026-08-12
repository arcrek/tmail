# Phase 3 — Lay out the inbox in two columns

## Overview

**Priority:** P2  
**Status:** Completed  
**Estimate:** 2h

Put the temporary-address panel left of the message list or reader on desktop, retaining the present one-column mobile experience and accessibility behavior.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/InboxView.vue` — group the address panel and message region as the two layout children if required by the existing DOM/CSS.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/styles.css` — two-column grid, widths, action wrapping, and compact-screen collapse.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/InboxView.test.ts` — assert stable layout hooks/semantics and preserve reader/list focus behavior.

## Implementation steps

1. Retain the current semantic headings, button labels, focus restoration, polling, and reader replacement behavior.
2. Make `.inbox-view` the desktop two-column grid: the existing `.inbox-hero` is the left address/actions panel; the message list or `MessageReader` is the right content region. Use `minmax(0, …)` so long email addresses cannot force overflow.
3. At the existing compact breakpoint, reset to one column and ensure action buttons remain reachable/wrap instead of shrinking below the project’s 44px control target.
4. Add a focused component/style assertion for the two named regions and run the existing reader focus/polling tests unchanged.

## Success criteria

- Desktop shows address/actions left and Messages or an open message right.
- Phone/tablet compact layouts remain a single readable column.
- Long addresses, loading/error/empty states, and the reader do not cause horizontal overflow.
- Keyboard focus returns to the Messages heading after closing the reader exactly as before.

## Todo

- [x] Apply the minimal inbox grid and responsive rules.
- [x] Verify states and focus regression coverage.
