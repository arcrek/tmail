# Phase 1: Mobile navigation and visual polish

## Context Links

- Plan: [plan.md](./plan.md)
- Header navigation: `frontend/src/components/AppHeader.vue`
- Layout & global styles: `frontend/src/styles.css`
- Hero/card headings in bulk views: `frontend/src/components/BulkGenerateView.vue`, `frontend/src/components/BulkCodeView.vue`
- Translation catalogs: `frontend/src/i18n.ts`
- Tests: `frontend/src/tests/AppHeader.test.ts`, `frontend/src/tests/BulkGenerateView.test.ts`, `frontend/src/tests/BulkCodeView.test.ts`

## Overview

- Priority: P2
- Status: Completed
- Fix mobile (< 640px) header navigation wrapping by collapsing links into a clean mobile hamburger/dropdown menu; fix skip-link leakage; fix address overflow/wrap on narrow screens; remove redundant headings and add CSV export on Bulk Generate & Bulk Code views.

## Key Insights

- On mobile viewports (< 640px / 768px), `AppHeader.vue`'s `.app-header-nav` contains 7 items (Docs, Bulk generate, Bulk read, Admin, Unlock, Locale select, ThemeToggle). These currently wrap into 3–4 staggered lines, pushing content down and cluttering the header.
- On mobile (< 640px), keep brand on left, ThemeToggle + Mobile Menu toggle button on right. When expanded, show a floating or slide-down navigation panel containing the navigation links, unlock control, and locale picker.
- `.skip-link` has `top: -3rem` which can be partially visible if line-height or font scales on smaller devices; ensure it uses `top: -100%` or `sr-only` positioning until focused (`:focus-visible`).
- In `InboxView.vue` and `styles.css`, `.inbox-address` uses `overflow-wrap: anywhere; word-break: break-word` and responsive clamp font size `clamp(1.1rem, 3.5vw, 1.6rem)` so long localparts do not produce awkward single-character line wraps.
- In `BulkGenerateView.vue` and `BulkCodeView.vue`, remove the redundant inner `<h2>` inside `.panel-heading` that duplicates the `<section class="home-hero">` `<h1>` title, or use a concise section heading (or `aria-label`).

## Requirements

### Functional

1. **Header Mobile Navigation (`AppHeader.vue`):**
   - Add a mobile menu toggle button (`aria-label`, `aria-expanded`, `aria-controls="mobile-nav"`) visible only at `< 640px` (or `< 768px`).
   - Clicking mobile toggle opens/closes the mobile menu dropdown containing Docs, Bulk generate, Bulk read, Admin, Unlock, and Locale picker.
   - Clicking any navigation item or clicking outside closes the mobile menu.
   - Retain full desktop row navigation at `≥ 640px`.
   - Add new icon if needed (or reuse SVG shapes: menu/x in `AppIcon.vue`).
2. **Skip-link positioning (`styles.css`):**
   - Guarantee `.skip-link` is strictly offscreen when unfocused and cleanly visible when focused.
3. **Address typography (`styles.css`):**
   - Ensure `.inbox-address` and `.saved-address` wrap cleanly without orphaned 1-2 char lines on 320px–390px screens.
4. **Bulk Views heading deduplication & CSV Export (`BulkGenerateView.vue`, `BulkCodeView.vue`):**
   - Remove duplicate `<h2>` in `.panel-heading` or replace with descriptive non-duplicative header, preserving accessibility labels.
   - Add CSV export function: `downloadCsv(filename, content)` to export generated addresses or resolved codes table.

### Non-functional

- Accessible keyboard navigation (Esc closes mobile menu, Tab navigates through items).
- All vitest unit tests pass (`npm --prefix frontend test`).
- i18n keys for mobile menu toggle (`nav.menuOpen`, `nav.menuClose` / `nav.menu`) in both `en` and `vi`.

## Related Code Files

- Modify: `frontend/src/components/AppHeader.vue`
- Modify: `frontend/src/components/AppIcon.vue` (add `menu` and `x` icons if needed)
- Modify: `frontend/src/components/BulkGenerateView.vue`
- Modify: `frontend/src/components/BulkCodeView.vue`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/tests/AppHeader.test.ts`
- Modify: `frontend/src/tests/BulkGenerateView.test.ts`
- Modify: `frontend/src/tests/BulkCodeView.test.ts`

## Implementation Steps

1. In `frontend/src/components/AppIcon.vue`, add `menu` (3 horizontal lines) and `x` (close cross) SVG icons if not present.
2. In `frontend/src/i18n.ts`, add `nav.menu` ('Menu' / 'Trình đơn') or `nav.menuToggle` to both `en` and `vi`.
3. In `frontend/src/components/AppHeader.vue`:
   - Add `const mobileOpen = ref(false)` state.
   - Add toggle button for mobile with `AppIcon :name="mobileOpen ? 'x' : 'menu'"`.
   - Wrap navigation links in a container that supports mobile collapsible styles while rendering inline on desktop.
4. In `frontend/src/styles.css`:
   - Style `.mobile-menu-button` (hidden on desktop `display: none`, visible on `@media (max-width: 640px)`).
   - Style mobile nav drawer / popover when open with clean background, shadow, borders matching design system.
   - Fix `.skip-link` to stay entirely offscreen when not focused (`transform: translateY(-200%)`).
   - Polish `.inbox-address` font-size clamp and break rules.
5. In `frontend/src/components/BulkGenerateView.vue` & `frontend/src/components/BulkCodeView.vue`:
   - Clean up duplicate `.panel-heading` with `<h2>` identical to hero `<h1>`.
   - Add Export CSV button with appropriate ARIA labels and i18n keys (`bulk.exportCsv`, `bulkCode.exportCsv`).
6. Update and add unit tests in `AppHeader.test.ts`, `BulkGenerateView.test.ts`, `BulkCodeView.test.ts`.
7. Verify all tests pass.

## Todo List

- [x] Add menu / x icons to `AppIcon.vue`
- [x] Add mobile toggle & drawer in `AppHeader.vue` with proper ARIA attributes
- [x] Update `styles.css` for responsive mobile header, skip-link, and address wrapping
- [x] Remove duplicate headings and add CSV export in `BulkGenerateView.vue` and `BulkCodeView.vue`
- [x] Add i18n keys for mobile menu and CSV export in `en` and `vi`
- [x] Update tests in `frontend/src/tests/`
- [x] Run test suite to verify 100% passing

## Success Criteria

- On mobile (< 640px), header is neat and single-row with logo on left, theme + hamburger on right.
- Opening hamburger reveals full navigation cleanly without horizontal overflow.
- Long email addresses wrap gracefully.
- Bulk views have no duplicate hero & card titles.
- Vitest test suite passes cleanly.
