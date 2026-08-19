---
title: "Admin Panel UI Redesign"
description: "Comprehensive UI/UX overhaul of the admin panel (AdminApp, DashboardTab, GeneralTab, MailServerTab, DomainsTab, AccessTab, ContentTab) using ck:ui-ux-pro-max design guidelines."
status: completed
priority: P1
effort: 4h
issue: null
branch: main
tags: [admin, frontend, ui-ux, design-system, responsive, accessibility]
blockedBy: []
blocks: []
created: 2026-08-19
---

# Admin Panel UI Redesign

## Executive Summary

The Tmail Admin Panel currently provides robust operational features (dashboard metrics, general site settings, mail server config, domain whitelist sync, access tokens, custom content/ads), but its visual layout relies on basic stacked forms and generic list styles. 

Using the **`ck:ui-ux-pro-max`** design system intelligence (Data-Dense Operational Dashboard style, high-contrast accessible color tokens, SVG iconography, refined card/table hierarchy, and mobile responsive rails), this plan transforms the admin panel into an enterprise-grade control console.

## Key Design Principles & Standards (`ck:ui-ux-pro-max`)

1. **Style**: Data-Dense Operational Dashboard / Minimal Slate Console.
2. **Color Palette & Contrast**:
   - Surface background: `--canvas` (#f6f7fb light / #0e1015 dark)
   - Panel cards: `--surface` (#ffffff light / #161923 dark) with subtle borders (`--line`).
   - Primary accents: Brand primary (`--brand-primary`), Status green (`#15803d` / `#22c55e`), Status red (`#dc2626` / `#ef4444`), Status amber (`#d97706` / `#f59e0b`).
   - Contrast ratio: Minimum 4.5:1 for body text and labels against surfaces.
3. **Typography**: Inter Variable for structural text; JetBrains Mono Variable for URLs, API tokens, JMAP endpoints, retention days, and system timestamps.
4. **Iconography & Visual Affordance**: Zero emojis. Clean inline SVG icons for navigation tabs, status indicators, action buttons, and metric cards.
5. **Mobile & Responsive**: Sidebar transforms into a responsive tab bar or slide-out menu on narrow screens (<768px), maintaining touch targets ≥44px.
6. **Accessibility**: Keyboard navigable (`tablist` arrow navigation, explicit focus rings `2px solid var(--primary)`), WCAG AA contrast, aria labels for icon buttons.

---

## Architectural & Visual Breakdown

### 1. Shell & Login (`AdminApp.vue` & `styles.css`)
- **Login Screen**: Minimalist centered login card with brand header, input field with clear focus ring, password visibility toggle or clear labeling, and session cleanup fallback button.
- **Admin Shell Header / Rail**: API Status pill with green pulse dot ("API Healthy"), current session indicator, and quick logout button.
- **Tab Navigation Rail**: Vertical/Horizontal tab list with SVG icons for each tab (`Dashboard`, `General`, `Mail Server`, `Domains`, `Access`, `Content`), active state highlighting (`--surface-selected`), and complete keyboard navigation (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`/`Home`/`End`).

### 2. Dashboard Console (`DashboardTab.vue`)
- **KPI Metrics Grid**: 6 distinct stat cards with SVG icon badges:
  - Messages Stored, Today's Inbound, 7-Day Inbound Volume.
  - Active Whitelist Domains, Today's New Domains, 7-Day Active Domains.
- **MX Failures Monitoring Feed**: Filterable/expandable failure event list with status pills (`MX Mismatch`, `MX Lookup Error`), formatted timestamps, and clear empty state graphic/badge.
- **Header Actions**: Refresh button with spinning indicator during reload.

### 3. General, Mail Server & Domains Settings (`GeneralTab.vue`, `MailServerTab.vue`, `DomainsTab.vue`)
- **General Settings**: App branding card, image uploader cards for Logo and Favicon with drag/click dropzone preview, primary/accent color picker previews, and cookie consent options.
- **Mail Server Config**: Card grid for JMAP URL & token, catchall address, mail account ID, retention days control with preset buttons (7d, 30d, 90d, 365d), and interactive "Test Connection" diagnostic action with success/failure notification toast.
- **Domains Management**: Two-column layout with Whitelist Domains table (with count badge, search filter, domain pill list, and quick remove buttons) and JMAP Sync Status widget (last sync time, success badge, failure error message details).

### 4. Security Access & Custom Content (`AccessTab.vue`, `ContentTab.vue`)
- **Access Credentials**: Structured sections for API Tokens & Admin Passwords. Token generator with 1-click copy feedback card (`secret` copy banner with masked dots `••••••••`). List table of active credentials with revocation trigger.
- **Content & Ads**: Header/Footer HTML editor cards with line numbers/code styling, custom CSS sandbox, and dynamic Ad Slot manager (add/remove slot, live sandbox preview).

---

## Phase Breakdown

| Phase | Description | Deliverable | Status |
|-------|-------------|-------------|--------|
| Phase 1 | Admin Login, App Shell, & Navigation Rail | `AdminApp.vue`, SVG Icons, CSS Tokens | Completed |
| Phase 2 | Operational Dashboard & KPI Metric Cards | `DashboardTab.vue` UI & MX Feed | Completed |
| Phase 3 | General Settings, Mail Server, & Domain Whitelist Tabs | `GeneralTab.vue`, `MailServerTab.vue`, `DomainsTab.vue` UI | Completed |
| Phase 4 | Access Security, Content Customization, & Tests | `AccessTab.vue`, `ContentTab.vue`, Vitest regression suite | Completed |

---

## Verification Plan

1. **Automated Unit Tests**:
   - `npm --prefix frontend test` must pass all existing tests (AdminApp, DashboardTab, AccessTab, etc.) and any new component tests.
2. **Visual & Responsive Inspection**:
   - Verify layout on Desktop (1440px), Tablet (768px), and Mobile (375px).
   - Test light and dark theme contrast modes.
3. **Accessibility Audit**:
   - Keyboard tab navigation across admin tabs.
   - Screen reader attributes (`aria-selected`, `aria-labelledby`, `role="tablist"`, `role="tabpanel"`).
