---
title: "Frontend design audit fixes"
description: "Implement the P0/P1/P2 findings from the frontend visual + accessibility audit: skip links and sub-12px text, a non-stock brand default with verified dark-mode contrast, a hero-weight address preview, and a screen-reader signal for unread messages."
status: completed
priority: P1
effort: 4h
issue: null
branch: main
tags: [frontend, backend, a11y, design, refactor]
blockedBy: []
blocks: []
created: 2026-08-13
---

# Frontend design audit fixes

## Overview

Follow-up to the standalone design audit (ui-ux-pro-max + frontend-design review of `frontend/src`, published as an artifact). Three independent, low-risk fixes, ordered by the audit's own priority:

- **P0** — accessibility floor: no skip-to-content link anywhere; five text sizes render under the 12px readability floor.
- **P1** — visual identity: the shipped brand default (`#4f46e5`/`#4338ca`) is Tailwind's unmodified `indigo-600`/`indigo-700`, and the one thing this product does — hand someone a disposable address — is styled as the smallest text on its own creation screen.
- **P2** — accessibility depth: unread messages are signalled only by font-weight + a border, both visual-only; screen reader users get no "unread" signal at all.

All three are additive/token-level changes. No component is restructured, no dependency added, no existing test's assertions about DOM structure should need to change (only class/style additions).

## Phases

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| 1 | [Accessibility floor: skip links + text-size cleanup](./phase-01-a11y-floor.md) | P0 | Done |
| 2 | [Visual identity: brand default + address-preview hero](./phase-02-visual-identity.md) | P1 | Done |
| 3 | [Unread message: add a non-visual signal](./phase-03-unread-signal.md) | P2 | Done |

Phases are independent — any order or subset can ship. Numbered here by audit priority, not by dependency.

## Correction vs. the published audit artifact

The audit artifact's swatch proposed `#3f3ad6` / `#2b2894` as the new brand default. Re-verified here with actual `color-mix()` math against every derived token (button hover, dark-mode tints, on-primary text) before writing this plan, and that pair **regresses** two dark-mode pairs below AA (4.35:1 and 3.37:1 — the second is a real fail, not just marginal). Phase 2 uses a different, verified pair instead: `#3454e0` / `#4a4fce`. See Phase 2 for the full before/after contrast table. This also happens to fix a pre-existing marginal fail in the *current* shipped colors (dark-mode `--accent` text was already at 4.27:1, under the 4.5:1 line) — a bonus, not the goal.

## Dependencies

- Plan scan: no unfinished plan touches `styles.css`, `App.vue`, `AdminApp.vue`, `AddressPanel.vue`, `InboxView.vue`, `i18n.ts`, or `src/api_state.py`. One unrelated plan is `blocked` (`260812-1455-domain-blacklist-patterns`, domain-list backend logic) — no overlap.
- No new npm/pip dependency.
- Phase 2 touches one backend file (`src/api_state.py`) in addition to frontend — the shipped brand default is duplicated there (server-side default settings) and in `styles.css` (pre-hydration fallback paint). Both must change together or the "fix" only affects the flash-of-fallback-color, not the actual default a fresh install serves.
