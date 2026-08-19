# Phase 4: Access Security, Content Customization & Test Verification

## Overview

- Priority: P1
- Status: Completed

## Objective
Redesign `AccessTab.vue` and `ContentTab.vue`, ensure responsive layout across all admin screens, perform contrast/accessibility checks, and verify full Vitest test suite passes.

## Design Details (`ck:ui-ux-pro-max`)

1. **Access Security Tab (`AccessTab.vue`)**:
   - **Credentials Overview Table**: Data table displaying Type badge ("Password" / "Token"), Label, Created Date, and Revoke action button.
   - **Secret Reveal Modal / Banner**: When a new credential/token is generated, show a highlighted secret banner with a prominent "1-Click Copy" button (`copySecret`) and security caution warning.
   - **Create Credential Cards**: Tabbed or segmented form to toggle between "Add Password" and "Generate Token".

2. **Content & Ads Tab (`ContentTab.vue`)**:
   - **Header / Footer HTML Cards**: Monospaced code textarea inputs with character count indicators (`MAX_CONTENT_LENGTH`).
   - **Custom CSS Card**: Code block input for injecting custom CSS rules.
   - **Ad Slots Manager**: Dynamic slot card list (Slot name, HTML snippet, preview toggle button, remove button) with "Add Ad Slot" action.
   - **Live Sandbox Preview**: Integrated `SandboxFrame.vue` preview for header/footer and ad placements.

3. **Global Quality & Accessibility Pass (`ck:ui-ux-pro-max` checklist)**:
   - Verify keyboard navigation (`Tab`, `Shift+Tab`, `ArrowUp`/`ArrowDown`/`ArrowRight`/`ArrowLeft`) across all admin tabs.
   - Verify screen reader accessibility labels (`aria-label`, `aria-selected`, `role="tab"`, `role="tabpanel"`).
   - Test dark mode contrast (`color-scheme: dark`) to ensure text contrast meets 4.5:1 ratio across all cards.
   - Verify touch targets ≥44px on mobile screens (<768px).

## Implementation Steps

1. Refactor `AccessTab.vue` template with secret copy banner, credential table, and type pills.
2. Refactor `ContentTab.vue` template with code block card layout and slot manager.
3. Perform CSS cleanup in `styles.css` for code blocks, secret banners, and credential tables.
4. Run full frontend test suite `npm --prefix frontend test` and resolve any regressions.

## Verification
- Run `npm --prefix frontend test` - all 22 test files must pass.
- Verify zero console errors and clean cutover across all 6 admin tabs.
