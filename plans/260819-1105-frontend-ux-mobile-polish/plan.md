---
title: "Frontend UX and mobile polish"
description: "Fix mobile header navigation, address typography, remove duplicate bulk view headings, add auto-refresh countdown indicator, collapse sidebar create form, add bulk CSV export, sound alerts, and QR code sharing."
status: completed
priority: P2
effort: 4h
issue: null
branch: main
tags: [frontend, mobile, ux, responsive]
blockedBy: []
blocks: []
created: 2026-08-19
---

# Frontend UX and Mobile Polish

## Overview

Live browser audit and UX review identified key areas for polish across layout, responsive behavior, core inbox utilities, and bulk management:
1. **Header wrapping on Mobile (`< 600px`):** Navigation links (*API docs*, *Bulk generate*, *Bulk read*, *Admin*, *Unlock*, *Locale*, *Theme*) wrap into 3–4 stacked rows, degrading mobile viewport usability. Skip-link positioning also leaks on small screens.
2. **Typography clipping / awkward line breaks:** In `InboxView.vue`, long email addresses wrap awkwardly (e.g. `test.user@example.c` / `om`).
3. **Redundant headings & missing export on Bulk pages:** `BulkGenerateView.vue` and `BulkCodeView.vue` render duplicate H1 hero and H2 card titles with identical text, and lack an Export CSV action.
4. **Auto-refresh feedback:** Static "Auto-refreshes every 20s" text lacks dynamic feedback; a visual countdown / progress bar gives immediate feedback for when mail will poll.
5. **Left Sidebar clutter (`InboxView.vue`):** Section `#inbox-create-address` occupies large vertical space, pushing content down. Collapsing it into a toggleable panel cleaner layout.
6. **Sound Alert on New Mail:** Provide an audio notification (Web Audio API synth beep, no external assets needed) when new mail arrives via SSE/polling.
7. **QR Code Sharing for Email Address:** Allow quick scanning of the temporary email address from mobile devices via a lightweight canvas/SVG modal.
## Design Decisions

- **Mobile Header (`AppHeader.vue`):**
  - Keep brand logo + name on left; keep Theme Toggle + Mobile Menu trigger button on right at `< 768px`.
  - Collapse secondary links (*API docs*, *Bulk generate*, *Bulk read*, *Admin*, *Unlock*, *Locale*) into a clean dropdown / drawer menu when toggled on mobile.
  - On desktop (`≥ 768px`), retain the existing horizontal row layout.
- **Address typography (`styles.css`):**
  - Adjust `.inbox-address` with fluid `clamp(1.1rem, 4vw, 1.6rem)` and `word-break: break-word` / `overflow-wrap: anywhere` so addresses scale smoothly on narrow mobile screens (320px–390px).
- **Heading cleanup & CSV Export (`BulkGenerateView.vue`, `BulkCodeView.vue`):**
  - Remove redundant card-internal H2 headings that duplicate the page H1 hero, while preserving accessibility labels (`aria-labelledby` or `sr-only` heading).
  - Add "Export CSV" button to download generated addresses or extracted OTP codes as `.csv`.
- **Visual Auto-refresh Indicator (`InboxView.vue`):**
  - Add a lightweight circular or linear countdown timer (0 to `fetchSeconds`) that smoothly animates and resets on tick or manual refresh.
  - Pauses / restarts cleanly on `visibilitychange`.
- **Collapsible Sidebar Create Form (`InboxView.vue`):**
  - Wrap the inline address creation form in a collapsible disclosure/accordion (`<details>` or toggled `<section>`) defaulted to collapsed, expanding smoothly on demand.
- **Sound Alert (`frontend/src/sound.ts`):**
  - Use native Web Audio API oscillator (zero asset download, instant tone) with user toggle/permission to play a gentle chime when a new message arrives.
- **QR Code Sharing Modal (`frontend/src/components/QrCodeModal.vue` / `frontend/src/qrcode.ts`):**
  - Minimalist zero-dependency QR code generator rendered on `<canvas>` or SVG, triggered by a "QR" action button in `InboxView.vue`.
## Cross-Plan Dependencies

Scanned `plans/`: all prior plans are `completed`/`done`. No overlapping active plans.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Mobile navigation, visual fixes, and bulk polish](./phase-01-mobile-nav-and-visual-fixes.md) | Completed |
| 2 | [Visual auto-refresh countdown indicator and sidebar collapse](./phase-02-auto-refresh-countdown.md) | Completed |
| 3 | [Audio alerts and QR code address sharing](./phase-03-sound-and-qrcode.md) | Completed |

## Dependencies

- Zero new npm dependencies; purely Vue 3 + CSS tokens + Web Audio API + lightweight vanilla QR math.
