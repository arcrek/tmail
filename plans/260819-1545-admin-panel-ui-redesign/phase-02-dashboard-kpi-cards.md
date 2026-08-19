# Phase 2: Operational Dashboard & KPI Metric Cards

## Overview

- Priority: P1
- Status: Completed

## Objective
Overhaul `DashboardTab.vue` to deliver a data-dense, highly visual monitoring dashboard with metric cards, status indicators, and formatted event feeds.

## Design Details (`ck:ui-ux-pro-max`)

1. **Dashboard KPI Metric Cards Grid**:
   - 2 rows / grid layout of cards (`.metric-card`):
     - **Inbound Volume Group**: Messages Stored (total), Today's Messages, 7-Day Messages.
     - **Domain Health Group**: Active Whitelist Domains, Today's New Domains, 7-Day Active Domains.
   - Each metric card features:
     - Clear text label with uppercase/muted caption font.
     - Tabular monospaced numbers (`font-family: var(--font-mono)`) to prevent layout shifts.
     - Subtle icon accent in card header.
     - Card container background (`--surface`) with subtle border (`--line`) and rounded corners (`--radius`).

2. **MX Failure Monitoring Section**:
   - Card container with section header, failure count badge, and refresh timestamp.
   - Failure list items with status tags:
     - `MX Mismatch`: amber badge (`var(--amber-soft)` + amber text).
     - `MX Lookup Error`: red badge (`var(--red-soft)` + red text).
   - Datetime badge formatted with JetBrains Mono font.
   - Empty state card when 0 failures exist, with green checkmark icon ("All domain MX records healthy").

3. **Actions & Loading States**:
   - Compact header refresh button with spinning icon during async fetch.
   - Skeleton loader with shimmer animation during initial data load.

## Implementation Steps

1. Update `DashboardTab.vue` template with semantic grid structure, KPI cards, and icon indicators.
2. Add CSS styles in `styles.css` for `.metric-card`, `.metric-value`, `.mx-failure-badge`, and `.mx-empty-state`.
3. Keep i18n formatting (`formatNumber`, `formatDate`) intact.

## Verification
- Run `npm --prefix frontend test` to verify `DashboardTab.test.ts` passes.
- Validate metric cards layout on narrow mobile (375px) and widescreen (1440px).
