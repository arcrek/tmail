# Phase 1: Stabilize whitelist rows

## Overview

- Priority: P2
- Status: Completed
- Estimate: 1h
- Goal: keep every active-whitelist domain and its action visually paired at every supported width.

## Context

- [Domains tab component](../../frontend/src/admin/DomainsTab.vue) renders the existing `<ul class="domain-list">` and must remain unchanged.
- [Shared stylesheet](../../frontend/src/styles.css) currently makes `.domain-list` a two-column grid, while its `<li>` elements have no internal action layout. That is the source of the broken wrapping shown in the report.

## Files

| Action | File | Purpose |
|---|---|---|
| Modify | `/home/arcrek/workspace/tmail_add_domain/frontend/src/styles.css` | Replace the two-column list with stable one-row-per-domain layout. |

## Implementation steps

1. Change `.domain-list` to one column at all widths; remove the mobile-only override because it becomes redundant.
2. Turn `.domain-list li` into a two-column grid: flexible/min-width-zero domain track plus content-sized Remove-button track. Vertically align content and add a small gap.
3. Ensure the domain span can wrap inside the flexible track without pushing, clipping, or separating its button. Retain current borders, type, padding, disabled state, and `overflow-wrap` behavior.
4. Do not change `DomainsTab.vue`, click handlers, labels, API calls, or domain policy behavior.

## Acceptance criteria

- [x] Every whitelist entry occupies exactly one visual list row.
- [x] Long domains wrap within their own row; their Remove button stays with that row and remains tappable.
- [x] At narrow widths, the layout has no interleaved domain/button pairs or horizontal overflow.
- [x] Existing Remove behavior and accessible labels remain intact.

## Verification

1. Use representative long values (including multi-label subdomains) and short values in the active whitelist.
2. Inspect desktop and narrow/mobile widths, including the width shown in the report.
3. Run `npm test -- --run src/tests/AdminApp.test.ts` in `frontend/`.

## Risks and non-goals

- Risk: a fixed action column could leave less text width on very narrow screens. Mitigation: retain `overflow-wrap:anywhere`; the row still has one domain/action pairing.
- No security, API, storage, or performance impact.
- Do not add search, pagination, badges, bulk removal, or a new list component; there is no evidence those are needed for this defect.
