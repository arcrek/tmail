---
phase: 1
title: "Foundation: Palette, Type, Radius and Depth Tokens"
status: complete
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Foundation: Palette, Type, Radius and Depth Tokens

## Goal

Land the "Ember on Bone" design tokens (palette, type pair, radius scale, depth strategy) in the single shared stylesheet and app shell, so every component that already reads these tokens picks up the new look with no markup changes.

## Context Links

- Accepted brief: `plans/reports/brainstorm-260910-1753-frontend-redesign.html` (contract, approach comparison, token specimen, mockups)
- Current tokens: `frontend/src/styles.css:1-110` (`:root`, `[data-theme='dark']`, `@media (prefers-color-scheme: dark)`)

## Key Insights

- The entire frontend has **no scoped `<style>` blocks** — every `.vue` file uses global classes defined once in `frontend/src/styles.css`. Almost all visual change for this redesign happens in that one file; components need no markup edits.
- Colors flow through a two-variable brand indirection (`--brand-primary`, `--brand-accent`) that every other color token derives from via `color-mix()`. Changing only those two hex values, plus the neutral ramp (`--canvas/--surface/--surface-2/--ink/--muted/--line`), recolors the whole app while keeping the admin's per-site color override (`admin/GeneralTab.vue` → `ConfigStore`) working unchanged.
- Fonts are self-hosted via `@fontsource-variable/*` packages imported in `frontend/src/main.ts` (no CDN, no network dependency) — the redesign keeps this pattern, just swaps which font packages are imported.

## Requirements

- [x] `--brand-primary` / `--brand-accent` default to the Ember pair (same hue family, primary = the accent color itself, accent = a darker same-hue shade) instead of the old blue/purple.
- [x] Light neutral ramp becomes Bone/ink (`--canvas`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--line`); dark ramp becomes the warm near-black equivalents, mirrored in both the `[data-theme='dark']` block and the `@media (prefers-color-scheme: dark)` duplicate.
- [x] `--red` moves to a crimson hue distinct from the new ember hue (so error state never looks like the accent).
- [x] `--radius-sm` / `--radius` / `--radius-lg` shrink to `6px` / `8px` / `10px` (from `8/12/16`).
- [x] A `--font-display` token (Schibsted Grotesk Variable) is added; `--font-sans` is repointed to Libre Franklin Variable as the body default. `--font-mono` (JetBrains Mono Variable) is unchanged.
- [x] `h1`, `h2`, `.eyebrow`, `.app-header .brand-name`, and button classes (`.primary-button`, `.secondary-button`, `.text-button`) use `--font-display`; body text keeps inheriting `--font-sans`.
- [x] `.panel` no longer carries `box-shadow: var(--shadow-1)` — panels are hairline-only (border, no shadow); `--shadow-1` itself stays defined for the floating elements that already declare it (QR modal, toasts, unlock dropdown).

## Files to Create / Modify

- Modify: `frontend/package.json` — remove `@fontsource-variable/inter`, add `@fontsource-variable/schibsted-grotesk` and `@fontsource-variable/libre-franklin`.
- Modify: `frontend/src/main.ts` — swap the font import lines.
- Modify: `frontend/index.html` — update the two `<meta name="theme-color">` `content` values to the new `--canvas` hex per theme.
- Modify: `frontend/src/styles.css` — `:root` block, `[data-theme='dark']` block, `@media (prefers-color-scheme: dark)` block, the `h1`/`h2`/`.eyebrow`/`.app-header .brand-name`/button-class font-family rules, and the `.panel` rule (drop `box-shadow`).

## Tasks & Steps

1. `cd frontend && npm uninstall @fontsource-variable/inter && npm install @fontsource-variable/schibsted-grotesk @fontsource-variable/libre-franklin`.
2. In `main.ts`, replace `import '@fontsource-variable/inter'` with the two new font imports (keep the JetBrains Mono import as-is).
3. In `index.html`, set the light `theme-color` meta to the new `--canvas` light hex and the dark one to the new `--canvas` dark hex.
4. In `styles.css` `:root`: set `--brand-primary`/`--brand-accent` to the ember pair; set `--canvas/--surface/--surface-2/--ink/--muted/--line` to the Bone/ink ramp; set `--red` to the new crimson; set `--radius-sm/--radius/--radius-lg` to `6px/8px/10px`; add `--font-display` and repoint `--font-sans`.
5. Mirror the same neutral/red ramp into the `[data-theme='dark']` block and the `@media (prefers-color-scheme: dark)` block (keep them in sync, as the file already does today).
6. Add `font-family: var(--font-display)` to `h1`, `h2`, `.eyebrow`, `.app-header .brand-name`, `.primary-button`, `.secondary-button`, `.text-button`.
7. Remove the `box-shadow: var(--shadow-1);` line from the `.panel` rule.

## Verification

- `cd frontend && npm install && npm run build` — `vue-tsc --noEmit` then `vite build` both exit 0.
- `grep -n "#3454e0\|#4a4fce" frontend/src/styles.css` returns no matches (old brand hex fully replaced).
- `npm run dev`, open the address page: hero renders in the new palette and fonts, both `data-theme` values.

## Risks

- Swapping the default font family changes the self-hosted bundle's font-face weight, which can shift total font payload size; measure with `npm run build` output size and compare to the current Inter Variable + JetBrains Mono Variable baseline (open risk #2 from the accepted brief).
- `DEFAULT_SETTINGS` in `src/api_state.py` seeds via `INSERT OR IGNORE`, so an already-provisioned `state.db` keeps its existing `primary_color`/`accent_color` row on next deploy — it does not pick up the new default just because the default changed. `StateStore.__init__` now runs a one-shot conditional migration (`_migrate_legacy_brand_colors`): a database still sitting on both legacy values (`#3454e0`/`#4a4fce`, i.e. never customized) is upgraded to the new ember defaults on next startup; any database with a different value in either field — including a deliberate customization — is left untouched (open risk #1 from the accepted brief).

## Next Steps

Blocks Phase 2 (semantic color and shape audit depends on the new tokens existing).
