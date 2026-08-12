# Phase 2 — Localize the public inbox

## Overview

Priority: P2. Replace hard-coded public-facing UI with the shared translator while preserving existing flows, attributes, and focus management.

## Related code files

- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/AppHeader.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/ThemeToggle.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/AddressPanel.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/InboxView.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/MessageReader.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/App.vue`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/address-flow.test.ts`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/InboxView.test.ts`
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/MessageReader.test.ts`

## Implementation steps

1. Import the shared i18n composable in each product UI component; replace visible text, button labels, placeholders, status text, `aria-label`s, screen-reader strings, confirmation prompts, and browser notification title/body with catalog keys.
2. Preserve dynamic values through named parameters: refresh seconds, page/count totals, addresses, attachment filenames, and message counts. Keep message subjects, previews, sender names, and attachment filenames verbatim.
3. Change inbox and reader `formatDate` calls to the shared locale-aware formatter. Translate byte-unit labels and count labels, but retain the existing rounding rules.
4. Preserve every existing `data-*` selector, native validation pattern, disabled state, error path, notification permission behavior, and focus-restoration behavior.
5. Extend focused tests to set Vietnamese locale and assert representative visual and accessible labels, translated notices/confirmations, and Vietnamese date formatting; keep existing English assertions as default/fallback checks.

## Success criteria

- `/`, `/{address}`, and message-reader flows render Vietnamese when the site language is `vi` and English for fallback locales.
- No product-owned English label remains in the listed public components.
- Email content and configured HTML remain unmodified.

## Risks and safeguards

- Do not translate backend error bodies in this phase; the API currently sends English messages and translating by string matching would be brittle and unsafe.
- Use translated `aria-label` templates for address/file-specific controls so accessibility text remains precise.

## Todo

- [x] Localize header, theme, address creation, inbox, and reader UI.
- [x] Localize `Intl` display values and browser notifications.
- [x] Update public flow tests for EN/VI behavior.
