---
title: "Localize the frontend"
description: "Render all product-owned frontend UI in English and Vietnamese using the existing site language setting."
status: completed
priority: P2
effort: 6h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Localize the frontend

## Overview

Render all product-owned frontend UI in English and Vietnamese using the existing persisted `site.language` setting. Keep English as the fallback. Do not add a locale picker, backend setting, or translation dependency.

## Scope challenge

- Existing code: `/site` already returns `language`; `App.vue` applies it to `<html lang>`. Vue's reactivity plus `Intl` cover locale state and date/number formatting.
- Minimum change: one typed catalog/composable, replace frontend-owned strings, and add focused locale tests. No API contract changes.
- Deferred: visitor language selection, lazy-loaded catalogs, translated server/API errors, user-authored header/footer/ad HTML, and message/email content.

## Decisions

- Supported UI locales: `en` and `vi`. Normalize values such as `vi-VN` to `vi`; unsupported configured values render English while preserving the configured document language.
- The existing admin **Language** field remains the site-wide default. A page initially renders from the browser preference, then switches reactively when `/site` loads; the persisted setting wins.
- Use a small local `t(key, params?)` helper built on Vue refs/provide-inject. This avoids adding `vue-i18n` for two static catalogs and the limited needs here. Use `Intl.DateTimeFormat` and `Intl.NumberFormat` with the same resolved locale.
- Translate UI chrome only. Never translate addresses, domains, sender/subject/body data, filenames, or sandboxed administrator-supplied HTML/CSS.

## Cross-plan dependencies

None. The blocked wildcard-domain plan touches some frontend tests but neither supplies nor consumes i18n behavior.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Create locale runtime and catalogs](./phase-01-locale-runtime-and-catalogs.md) | Complete |
| 2 | [Localize the public inbox](./phase-02-public-inbox.md) | Complete |
| 3 | [Localize administration and verify coverage](./phase-03-admin-and-tests.md) | Complete |

## Validation

- `npm test -- --run src/tests/i18n.test.ts src/tests/address-flow.test.ts src/tests/InboxView.test.ts src/tests/MessageReader.test.ts src/tests/AdminApp.test.ts`
- `npm run build` from `/home/arcrek/workspace/tmail_add_domain/frontend/`
- Manually set General → Language to `vi` and verify public inbox plus `/admin`, including screen-reader labels, confirm dialogs, notifications, dates, counts, and a fallback value such as `fr`.
