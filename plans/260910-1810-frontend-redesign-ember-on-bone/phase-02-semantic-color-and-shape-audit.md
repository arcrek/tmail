---
phase: 2
title: "Semantic Color and Shape Audit"
status: complete
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Semantic Color and Shape Audit

## Goal

Sweep every hardcoded hex/`rgba()` literal left in `frontend/src/styles.css` outside the token blocks and repoint it to a token, so status colors (success/warning/error), the secret-reveal banner, and radius fallbacks track the new tokens from Phase 1 instead of frozen old values — in both light and dark theme.

## Context Links

- Accepted brief: `plans/reports/brainstorm-260910-1753-frontend-redesign.html` (token specimen, admin mockup callouts on `pill-warn` vs `pill-error`/`--red`)
- Phase 1: `./phase-01-start.md` (tokens this phase consumes)
- Literal inventory gathered during planning: `frontend/src/styles.css` lines ~943, 954, 996, 1440, 1888, 1906-1914, 1993-1994, 2041-2047, 2068, 2156, 2195-2201, 2213-2216, 2275, 2370.

## Key Insights

- `.secret-banner`/`.secret-banner-header` (around line 2213) hardcode `rgba(52, 84, 224, 0.3)` / `rgba(52, 84, 224, 0.05)` — this is the **old** `--brand-primary` (`#3454e0`) baked in as a literal. It is already stale today (independent of the redesign) and must derive from the live `var(--primary)`/`var(--primary-soft)` tokens instead.
- `.badge-amber` and `.counter-warn` hardcode `#d97706` — an amber unrelated to any token. Both are "needs attention" warning roles that the accepted brief maps onto `--ember` (see the admin mockup's `pill-warn` callout), so they collapse onto the existing accent token instead of inventing a second warm hue.
- `.badge-red`, `.pill-error`, `.mx-count-badge` hardcode red literals (`#dc2626`, `#ef4444`, `rgba(239,68,68,…)`) that must track the Phase 1 `--red` value (now a crimson distinct from ember) so dark theme gets the correct tint automatically instead of a mismatched fixed literal.
- `.pill-success`, `.pulse-dot`, `.api-status` hardcode green literals (`#22c55e`, `#15803d`, `rgba(34,197,94,…)`) — same hue family kept (success semantics are out of scope for the redesign), just de-duplicated onto `var(--green)` as the single source of truth.
- A few admin cards fall back to stale radius literals (e.g. `var(--radius, 8px)`, `var(--radius, 4px)`) predating the current 8/12/16 scale — align every fallback to the Phase 1 scale (6/8/10) so a var-resolution failure still renders consistently.
- Genuinely non-brand literals stay as-is: `.sandbox-frame`/`.qr-code-wrapper`/`.content-editor-grid .sandbox-frame` `background: #fff` is intentional (email HTML and configured site HTML assume a light canvas regardless of app theme — documented in `CLAUDE.md`) and must **not** be touched.

## Requirements

- [x] No selector outside the `:root` / `[data-theme='dark']` / `@media (prefers-color-scheme: dark)` blocks contains a raw brand-colored hex or `rgba()` literal; every status color reads from `var(--ember)`, `var(--red)`, `var(--green)`, or `var(--primary)`/`var(--primary-soft)`.
- [x] `.secret-banner`/`.secret-banner-header` derive their border/background from `var(--primary)` (matching the pattern `--primary-soft` already uses elsewhere), not a hardcoded blue.
- [x] Soft/tinted backgrounds for status pills and badges use `color-mix(in srgb, var(--red|--ember|--green) N%, transparent)` instead of fixed `rgba()`, so dark theme's brighter token values produce a correctly tinted background automatically.
- [x] Every `border-radius: var(--radius[-sm|-lg], <literal>)` fallback literal matches the Phase 1 scale (6/8/10).
- [x] `box-shadow` remains only on the floating elements that already had it before this phase (`.qr-modal`, `.toast`, `.header-unlock .field`, `.app-header-nav.mobile-open`) — confirmed absent from every panel/card selector.
- [x] The intentional always-light sandbox/QR literals (`#fff` on `.sandbox-frame`, `.qr-code-wrapper`, `.content-editor-grid .sandbox-frame`) are left untouched.

## Files to Create / Modify

- Modify: `frontend/src/styles.css` — component/admin sections only (`.secret-banner*`, `.badge-amber`, `.counter-warn`, `.badge-red`, `.pill-error`, `.pill-success`, `.mx-count-badge`, `.pulse-dot`, `.api-status`, any stray `border-radius` fallback literal).

## Tasks & Steps

1. Rewrite `.secret-banner`/`.secret-banner-header` border/background to derive from `var(--primary)` / `var(--primary-soft)`.
2. Repoint `.badge-amber` and `.counter-warn` from `#d97706` to `var(--ember)`.
3. Repoint `.badge-red`, `.pill-error`, `.mx-count-badge` from hardcoded reds to `var(--red)` (solid) and `color-mix(in srgb, var(--red) 15%, transparent)` (soft background).
4. Repoint `.pill-success`, `.pulse-dot`, `.api-status` from hardcoded greens to `var(--green)` (solid) and `color-mix(in srgb, var(--green) 15%, transparent)` where a soft background is used.
5. Grep for every remaining `var(--radius`-style fallback literal and align it to `6px`/`8px`/`10px` per its role (`-sm`/base/`-lg`).
6. Grep for every `box-shadow` declaration in the component/admin sections; confirm the only matches are the four floating elements listed above; remove any others found.

## Verification

- `grep -nE "#[0-9a-fA-F]{3,6}|rgba\(" frontend/src/styles.css` — manually reviewed; every remaining hit is either inside a token block or one of the documented intentional-light literals (sandbox/QR).
- `grep -n "box-shadow" frontend/src/styles.css` — only the four floating selectors remain.
- `cd frontend && npm run build` still exits 0.

## Risks

- `color-mix()` percentages need a manual eyeball pass in dark theme (brighter token values can produce a stronger-than-intended tint at the same percentage that looked right in light theme) — catch this in Phase 3's visual QA, adjust the percentage here if needed rather than reintroducing a fixed literal.

## Next Steps

Blocks Phase 3 (visual QA needs the final color/radius state to compare against the accepted mockups).
