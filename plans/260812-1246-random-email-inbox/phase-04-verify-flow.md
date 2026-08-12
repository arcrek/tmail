# Phase 4 — Verify the combined feature set

Status: In progress — frontend unit tests pass; backend tests and production build are environment-blocked.

## Overview

Add focused regressions around the shared domain resolver and visible UI outcomes.

## Related Code

- Modify the nearest existing Python tests under `/home/arcrek/workspace/tmail_add_domain/tests/` for state, admin settings, and public address validation.
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/address-flow.test.ts`, `InboxView.test.ts`, or `MessageReader.test.ts` according to their existing test ownership.

## Implementation

1. Add backend cases for manual-domain validation and the active-domain union in both auto-sync and frozen modes; assert sync cannot erase manual entries.
2. Add an admin UI case that saves a manual domain and renders the updated whitelist.
3. Mock deterministic browser randomness for the one-click random-email flow; assert the existing token call and `open` event use an active random domain.
4. Mount the message reader with a loaded message to assert 4–8 digit detection, non-matching long numbers, subject precedence, message changes, the explicit Copy action, and the compact OTP panel's responsive placement.

## Success Criteria

- `pytest -q`, `npm test -- --run`, and `npm run build` pass.
- Tests prove the canonical active-domain resolver is the sole enforcement point and that OTP parsing cannot leak state between messages.
