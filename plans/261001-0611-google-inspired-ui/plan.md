# Google-inspired TMail UI

Status: Complete

## Outcome and design brief
Transform public inbox, bulk tools, and admin into a calm Google-inspired product interface. Preserve mail, access, branding, localization, and sandbox contracts. No new features, dependencies, Google logos, deployment, or production database changes.

Register: Product
Scene: People opening a temporary inbox on a phone or laptop in a calm, clear, familiar interface.
Direction: Gmail-inspired surfaces and Material-style controls for clear navigation and quiet hierarchy.
Color: Restrained; bg oklch(97% 0.008 250), text oklch(24% 0.01 250), accent oklch(49% 0.2 260).
Type: Existing Libre Franklin for display and body; JetBrains Mono for addresses and codes; contrast through size and weight.
Signature: Blue pill actions and selection on a cool canvas with white rounded workspaces.
Dials: variance 3, motion 2, density 5.

## Acceptance
- Consistent light/dark styling across home, inbox, reader, bulk tools, and admin.
- Admin account controls and navigation share a sidebar; main content owns the remaining column.
- Custom brand colors remain authoritative; new installations use blue defaults.
- Keyboard focus, reduced motion, touch targets, and localized labels remain usable.
- Frontend tests, build, backend settings tests, and browser checks pass.
- Check 375, 768, 1440 pixel layouts, an overlay, and empty/error state.

## Execution
1. Inspect styles, markup, defaults, tests, and harness.
2. Update tokens and existing CSS; regroup admin markup; add default envelope mark.
3. Verify and render; repair evidenced layout issues; update design documentation.

Rollback: revert only this task’s changes. Preserve pre-existing workspace edits.

## Completion evidence

Implemented and verified the accepted scope. Frontend: 194 tests passed; backend settings/admin: 60 tests passed; production build passed. Browser checks passed at 375, 768, 1024, and 1440px, including light/dark modes, native QR modal keyboard behavior, inbox/reader, bulk tools, and all admin tabs. Vietnamese mobile layout and hover feedback passed.

The render checker found zero errors and three intentional screen-reader clipping warnings. No production data was changed. Existing custom brand colors remain authoritative. See [verification report](../reports/review-261001-0611-google-inspired-ui.md).

## QR review repairs

Both subsequent review findings are repaired: clipboard fallback now uses the focused dialog, and QR copy results use dialog-local status/error feedback. Regression tests and Chromium clipboard/accessibility checks passed. See [fix verification](../reports/fix-261001-0706-qr-dialog-findings.md).
