# Phase 3: General Settings, Mail Server & Domains Tabs

## Overview

- Priority: P1
- Status: Completed

## Objective
Redesign `GeneralTab.vue`, `MailServerTab.vue`, and `DomainsTab.vue` into modern structured configuration forms with clear card boundaries, upload previews, preset selectors, and whitelist management tables.

## Design Details (`ck:ui-ux-pro-max`)

1. **General Tab (`GeneralTab.vue`)**:
   - **Branding Card**: Inputs for App Name and Site Language selector.
   - **Logo & Favicon Dropzones**: Visual file upload cards displaying current image thumbnail preview, file size info, upload trigger button, and remove option.
   - **Color System Customization**: Primary & Accent color picker inputs with live swatch preview tiles.
   - **Cookie Consent Section**: Toggle switch for cookie banner + multi-line text input.

2. **Mail Server Tab (`MailServerTab.vue`)**:
   - **JMAP Endpoint & Token**: Full-width input fields with mono font styling for URL and secret token (`••••••••`).
   - **Retention & Account**: Retention days input with quick preset chip buttons (7 days, 30 days, 90 days, 365 days).
   - **Diagnostic Action**: "Test Connection" button with loading spinner, yielding structured status toast feedback.

3. **Domains Management Tab (`DomainsTab.vue`)**:
   - **Domains Overview Grid**: Two-column layout separating Whitelist Domains list from Sync Status widget.
   - **Whitelist Table**: Domain search/filter input, domain count badge, clean domain table/list with quick "Remove" button per row.
   - **Sync Status Card**: Live status indicator (Success: green pill, Failed: red pill, Pending: gray pill), last sync timestamp, error detail box with code block formatting.
   - **Add Manual Domain**: Form input with url/domain validation and add action button.
   - **Domain Policy Settings**: Grid of numerical inputs (Poll interval, Message limit, Local part min/max) with helper text tooltips.

## Implementation Steps

1. Refactor `GeneralTab.vue` template & styles for image dropzone previews and color swatches.
2. Refactor `MailServerTab.vue` template & styles with retention chip presets and JMAP connection card layout.
3. Refactor `DomainsTab.vue` template & styles for two-column whitelist & sync status cards.
4. Update CSS in `styles.css` for form cards, settings grids, chip selectors, and status pills.

## Verification
- Run `npm --prefix frontend test` to verify `GeneralTab`, `MailServerTab`, and `DomainsTab` Vitest suites pass.
- Test form validation, retention presets, and domain whitelist addition/removal.
