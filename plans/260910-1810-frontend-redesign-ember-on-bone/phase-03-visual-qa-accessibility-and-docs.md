---
phase: 3
title: "Visual QA, Accessibility, Responsive Check and Docs"
status: complete
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Visual QA, Accessibility, Responsive Check and Docs

## Goal

Confirm the redesigned app actually matches the accepted brief's mockups and constraints (contrast, every original button/nav item still present, responsive breakpoints intact), fix anything that slipped through Phases 1-2, and record the new token system as a durable reference.

## Context Links

- Accepted brief: `plans/reports/brainstorm-260910-1753-frontend-redesign.html` (mockup callouts for public hero, inbox, admin dashboard; unresolved risks list)
- `.claude/skills/run-tmail/` — headless boot + Playwright driver + screenshot capability, no root/Stalwart required
- `docs/` — project docs directory (`docs.maxLoc: 800`)

## Key Insights

- The user explicitly required every public-page button/nav item from the original frontend to survive the redesign unchanged in count and behavior (header nav's 5 links + locale picker + theme toggle, address form's random/copy/open buttons, saved-inboxes forget button, inbox's 6 action buttons). This phase is where that gets verified against the running app, not just the mockup.
- `CLAUDE.md` documents `assetsInlineLimit: 0` as load-bearing for the CSP (no `font-src` override) — the font package swap in Phase 1 must not reintroduce inlined `data:` font URIs; confirm the Vite build still emits separate font files.
- No `docs/design-guidelines.md` exists yet. Per the project's documentation-management rule, this redesign changes a durable, user-visible convention (the whole visual system), so it is in scope for a docs update — kept under the 800-line cap.

## Requirements

- [x] Public hero/address page, inbox split view, and admin dashboard render correctly in both light and dark theme at 375px, 640px, and 952px+ viewports.
- [x] Body and muted text contrast ≥ 4.5:1 against `--canvas`/`--surface` in both themes; ember accent text/button contrast ≥ 4.5:1; `:focus-visible` ring (3px, `--primary`-colored) still visible on both themes.
- [x] Every button and nav item enumerated in the accepted brief's mockup callouts is present, unchanged in count, and functionally unchanged (no markup/logic edits happened in Phases 1-2 — this step verifies that held).
- [x] `npm run test` (vitest) and `npm run build` (`vue-tsc --noEmit` + `vite build`) both exit 0.
- [x] `docs/design-guidelines.md` exists, documents the Ember-on-Bone token set, and is ≤ 800 lines.

## Files to Create / Modify

- Create: `docs/design-guidelines.md`
- Modify (only if QA finds a regression): `frontend/src/styles.css`

## Tasks & Steps

1. Use the `run-tmail` skill to boot the app (fake-JMAP backend + real Vue app) and screenshot: public hero/address page, inbox (with a stub message so the unread/code-badge states render), and admin dashboard — each in light and dark, at 375px/640px/952px+.
2. Compare each screenshot against the corresponding annotated mockup in `plans/reports/brainstorm-260910-1753-frontend-redesign.html` (open the callouts for the exact tokens/behavior expected).
3. Spot-check contrast ratios (body text, muted text, ember accent, focus ring) against both theme backgrounds; fix any failing pair in `styles.css` (adjust lightness of the offending token, not a one-off override).
4. Count and click through every button/nav item listed in `## Requirements` above against the live app; confirm none were dropped, duplicated, or renamed during Phases 1-2.
5. `cd frontend && npm run build` — confirm the emitted `dist/assets/*.woff2` includes the new Schibsted Grotesk and Libre Franklin font files (not inlined as `data:` URIs), keeping the CSP-driven `assetsInlineLimit: 0` behavior intact.
6. `cd frontend && npm run test` — vitest run, all existing suites green (no test file changes expected; a visual-only redesign should not change any assertions).
7. Write `docs/design-guidelines.md`: palette (OKLCH + hex, light/dark), type pair (Schibsted Grotesk display / Libre Franklin body / JetBrains Mono functional), radius scale, depth strategy (hairline panels, shadow reserved for floating elements), and a link back to the accepted brainstorm brief as the design rationale record.
8. Run `/ak:journal` per the standard post-plan handoff, unless the project has disabled auto-journal.

## Verification

- Screenshot set saved under the plan's `reports/` directory (or wherever `run-tmail` writes them) covering 3 surfaces × 2 themes × 3 breakpoints.
- `npm run test` and `npm run build` both exit 0.
- Manual contrast check notes recorded in this phase file's Todo (below) or the plan's report directory.
- `docs/design-guidelines.md` present and under 800 lines.

## Todo

- [x] Screenshots captured and compared against mockup callouts (18 screenshots saved in `reports/shots/`)
- [x] Contrast pass complete (light + dark: ink 15.7:1 / 14.7:1, muted 5.5:1 / 6.5:1, button 5.0:1 / 5.88:1)
- [x] Button/nav inventory checked against accepted brief (5 nav links, 1 locale picker, 2 theme toggle selectors, random/copy/open CTA, 6 inbox action buttons)
- [x] `npm run test` green (190/190 passing across 22 test files)
- [x] `npm run build` green, fonts confirmed as separate files (not inlined)
- [x] `docs/design-guidelines.md` written (131 lines, ≤ 800)
- [x] `/ak:journal` skipped by preference (`prefs.journal.auto == false`)

## Risks

- The email-HTML sandbox iframe intentionally stays light-canvas regardless of app theme (open risk #3 from the accepted brief) — confirm during screenshotting that the ember-toned chrome around the sandbox frame doesn't read as visually broken against the white content inside it; this is an accepted trade-off, not a defect, unless it looks actively wrong.

## Next Steps

None — this is the final phase. Report the plan as complete once all Todo items are checked.
