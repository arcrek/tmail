# Phase 1: Admin Shell, Login & Navigation Rail

## Overview

- Priority: P1
- Status: Completed

## Objective
Redesign the admin shell, login interface, and navigation rail (`AdminApp.vue` and `styles.css`) following `ck:ui-ux-pro-max` guidelines for accessibility, visual density, and responsive navigation.

## Design Details (`ck:ui-ux-pro-max`)

1. **Login Interface (`.admin-login`)**:
   - Card container with subtle border (`var(--line)`), elevation shadow, and brand header.
   - Clean password input field with explicit focus ring (`2px solid var(--primary)`).
   - Styled primary submit button with loading state spinner / indicator.
   - Distinct fallback button for CSRF cleanup when session issues occur.

2. **Admin Account Rail & Header (`.admin-account-rail`)**:
   - API status indicator with a animated green pulse dot (`.pulse-dot`) indicating healthy JMAP connection.
   - Accessible sign-out button with subtle hover state and distinct focus boundary.

3. **Admin Navigation Tabs (`.admin-sidebar`)**:
   - Section heading with clear hierarchy (e.g. "Admin Console" with subtitle "System Configuration").
   - Navigation list formatted with inline SVG icons for each tab:
     - Dashboard: `layout-dashboard` / grid icon
     - General: `sliders` / settings icon
     - Mail Server: `server` / mail icon
     - Domains: `globe` / network icon
     - Access: `key-round` / shield icon
     - Content: `code-2` / page layout icon
   - Selected state using `--surface-selected` background, left border indicator, and font-weight contrast.
   - Mobile responsive layout: on `<768px`, navigation transforms into a horizontal scrollable tab strip with touch targets ≥44px.

## Implementation Steps

1. Add SVG icons / helper functions in `frontend/src/admin/icons.ts` or inline SVG strings for admin navigation.
2. Refactor `AdminApp.vue` template structure to enhance semantic accessibility (`<nav role="tablist">`, SVG icons, status pill).
3. Update `styles.css` with CSS rules for `.admin-shell`, `.admin-sidebar`, `.admin-account-rail`, and `.admin-login`.
4. Ensure keyboard arrow key navigation (`moveTab`) works seamlessly with visual focus indicators.

## Verification
- Run `npm --prefix frontend test` to verify `AdminApp.test.ts` passes.
- Test keyboard tab navigation (`ArrowRight`, `ArrowLeft`, `Tab`) and visual highlight in light and dark mode.
