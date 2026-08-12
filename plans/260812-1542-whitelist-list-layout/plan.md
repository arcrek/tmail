---
title: "Repair active whitelist list layout"
description: "Make every active-whitelist domain a stable, readable row at all viewport widths."
status: completed
priority: P2
effort: 1h
issue: null
branch: main
tags: [bugfix, frontend]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Repair active whitelist list layout

## Overview

Replace the unstable two-column whitelist layout with one row per domain. Each row gives the domain the flexible column and keeps its Remove button in a non-shrinking action column, so long names wrap only inside the domain area.

## Scope challenge

- Existing code: `DomainsTab.vue` already provides the semantic list, domain text, per-row accessible Remove label, and disabled state. `styles.css` owns its layout.
- Minimum change: modify the two `.domain-list` CSS rules only. No template, component state, API, or persistence change.
- Complexity: one file, no new abstraction or dependency.

## Decisions

- Use a single-column list rather than trying to tune the existing two-column grid at more breakpoints. The admin task is review/remove, not side-by-side comparison.
- Make each `li` a two-track grid: `minmax(0, 1fr)` for the domain and `auto` for the button. This preserves readable wrapping and prevents the button from splitting a row.
- Keep the existing compact button, border rhythm, keyboard behavior, and `aria-label` unchanged.

## Cross-plan dependencies

None. The unfinished wildcard-domain plan changes policy behavior and tests; it neither depends on nor is blocked by this presentation-only fix.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Stabilize whitelist rows](./phase-01-stabilize-whitelist-rows.md) | Completed |

## Validation

- Open Domains & Inbox with a mix of short and long domains at desktop and narrow/mobile widths.
- Confirm one domain per bordered row; text may wrap, but each matching Remove control remains aligned on the right and does not overlap another row.
- Run `npm test -- --run src/tests/AdminApp.test.ts` from `frontend/` to preserve removal behavior.
