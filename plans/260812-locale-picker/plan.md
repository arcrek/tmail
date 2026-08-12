---
title: "Add a visitor locale picker"
description: "Let visitors select English or Vietnamese without changing the administrator's site default."
status: completed
priority: P2
effort: 2h
issue: null
branch: main
tags: [feature, frontend, i18n]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Add a visitor locale picker

## Overview

Add one native, accessible EN/VI picker to the public header. A visitor choice is a per-browser convenience stored safely in `localStorage`; it never changes the persisted site setting or the admin form. Resolve the UI locale in this order: stored visitor override, `site.language`, browser preference, then English.

## Decisions

- Use a native `<select>` with a translated accessible label and explicit `en`/`vi` options; do not add a UI/i18n dependency.
- Store only normalized supported values under one `tmail.locale` key. Ignore malformed/unavailable storage and retain the in-memory selection for the current page.
- Keep `site.language` as the administrator-controlled default. Applying site branding must not overwrite an existing visitor override.
- Set the effective resolved locale on `<html lang>` so document language follows the UI, rather than the configured-but-overridden site value.
- The picker is public-header-only. `/admin` keeps its existing site-language settings behavior; no API or backend changes are needed.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Locale precedence, picker, and tests](./phase-01-locale-picker.md) | Complete |

## Validation

- `npm test -- --run src/tests/i18n.test.ts src/tests/address-flow.test.ts`
- `npm run build` from `frontend/`
- Manually verify EN/VI selection in the public header persists after reload, overrides a conflicting site default, updates `<html lang>`, and still works when browser storage throws.
