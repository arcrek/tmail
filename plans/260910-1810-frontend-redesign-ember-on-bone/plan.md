---
title: "Frontend Redesign: Ember on Bone"
description: "Reskin the whole TMail frontend (public site + admin console) onto a new editorial-minimal token system with a warm ink/bone palette and a single ember accent."
status: complete
priority: P1
effort: "8h"
tags: [frontend, design]
blockedBy: []
blocks: []
created: 2026-09-10
---

# Frontend Redesign: Ember on Bone

## Overview

Redesign the entire TMail frontend visual system: public site (address/hero, inbox, message reader, bulk views) and admin console (dashboard, domains, mail server, content, access, general), on the "Ember on Bone" direction accepted in `plans/reports/brainstorm-260910-1753-frontend-redesign.html`. Because every `.vue` component reads shared classes from one global stylesheet (`frontend/src/styles.css`) with no scoped `<style>` blocks, this is almost entirely a token-layer change: new palette (warm ink on bone, single ember accent), a Schibsted Grotesk/Libre Franklin type pair, a smaller radius scale, and a hairline-only depth strategy — no component markup rewrites, no new buttons, no logic changes. The two-variable brand indirection (`--brand-primary`/`--brand-accent`) that lets admins override site colors stays intact; only its default values change.

## Accepted Brief

- **Outcome / Constraints / Non-goals / Acceptance criteria**: see the brief's "1. Bốn điều khoản brief" section.
- **Chosen approach**: "A. Ember on Bone" — warm near-black ink on a low-chroma bone canvas, one restrained ember accent (≤10% of surface), hairline-grid layout inherited from the current admin, Schibsted Grotesk (display) + Libre Franklin (body) + JetBrains Mono (kept, functional data only).
- **Explicit user correction during brainstorm**: every original public-page button and nav item must be preserved unchanged — this plan makes no markup or logic edits, token-only.

## Cross-Plan Dependencies

None.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Foundation: Palette, Type, Radius and Depth Tokens](./phase-01-start.md) | Complete |
| 2 | [Semantic Color and Shape Audit](./phase-02-semantic-color-and-shape-audit.md) | Complete |
| 3 | [Visual QA, Accessibility, Responsive Check and Docs](./phase-03-visual-qa-accessibility-and-docs.md) | Complete |

## Dependencies

- Phase 2 depends on Phase 1's tokens existing.
- Phase 3 depends on Phases 1-2 being complete (it verifies the final state).
- Sequential only — all three phases touch `frontend/src/styles.css`, so this plan does not run under `/ak:cook --parallel`.

## Success Criteria

- [x] `frontend/src/styles.css` tokens, `frontend/index.html` theme-color meta, `frontend/package.json`/`main.ts` fonts all reflect the Ember on Bone system in both themes.
- [x] No hardcoded brand-colored hex/`rgba()` literal remains outside the token blocks (Phase 2 audit).
- [x] `npm run build` and `npm run test` both exit 0.
- [x] Public hero, inbox, and admin dashboard screenshots (light+dark, 375/640/952px) match the accepted mockup callouts, with every original button/nav item still present.
- [x] `docs/design-guidelines.md` documents the new token system.

## Unresolved Questions

Carried forward from the accepted brief (unchanged by planning — resolve before or during Phase 1/3):

1. Does any production site currently rely on the old default blue (`#3454e0`/`#4a4fce`) as its own brand color rather than having set a custom one? If so, that site needs its admin `primaryColor`/`accentColor` set explicitly before this ships, or it will change color on deploy.
2. What is the font payload delta from swapping Inter Variable for Schibsted Grotesk Variable + Libre Franklin Variable? Measure in Phase 1's build step before considering it settled.

<!-- slug: frontend-redesign-ember-on-bone -->
