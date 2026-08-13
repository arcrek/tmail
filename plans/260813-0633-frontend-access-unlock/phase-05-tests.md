# Phase 5: Tests and regression coverage

## Context Links

- Plan: [plan.md](./plan.md)
- Depends on: [Phase 1](./phase-01-backend-elevated-access.md), [Phase 2](./phase-02-admin-credential-api.md), [Phase 3](./phase-03-frontend-unlock.md), [Phase 4](./phase-04-admin-access-tab.md)
- `tests/test_public_api.py`, `tests/test_admin_api.py`, `tests/test_api_state.py` — existing pytest + `TestClient` fixtures to reuse
- `frontend/src/tests/address-flow.test.ts`, `frontend/src/tests/AdminApp.test.ts` — existing vitest + `@vue/test-utils` fixtures to reuse

## Overview

- Priority: P1
- Status: Complete
- Prove the elevated-access bypass, its admin management, and both frontend surfaces behave correctly, including the edge cases called out in each earlier phase's Risk Assessment.

## Key Insights

- `tests/test_admin_api.py` and `tests/test_public_api.py` already set up a shared `client` fixture (`TestClient(create_app(config_path))`) with a fake JMAP backend and a settings payload that includes a blacklisted domain — reuse that setup rather than building new fixtures, so the new tests exercise the exact same `blacklisted_domains` machinery Phase 1 modifies.
- `frontend/src/tests/AdminApp.test.ts` already mounts the full `AdminApp` with all tabs and drives tab-switching + form submission through the DOM — `AccessTab` coverage should follow that same integration style rather than a shallow mount, so the tab-registration wiring from Phase 4 is actually exercised.
- `address-flow.test.ts` likely already covers `AddressPanel.vue`'s domain-loading and submit flow — check it first before deciding whether unlock coverage belongs there or in a new file; prefer extending it to keep one source of truth for `AddressPanel.vue` behavior.

## Requirements

### Backend (pytest)

New file `tests/test_access_credentials.py` (or extend `test_admin_api.py`/`test_public_api.py` if the existing fixtures are simpler to reuse in place — decide after reading both files' fixture setup):

- Admin: create password credential → appears in list without password value; create token credential → secret returned once, then absent from list; duplicate secret → `422`; delete → `404` on re-delete, removed from list; unauthenticated access to all three routes → `401`.
- Public: `/unlock` with valid password → `200` + `accessToken`; with valid token → `200`; with wrong/unknown credential → `401`; missing `credential` field → `422`; hammering `/unlock` past the rate limit → `429` (mirrors the existing `/token` rate-limit test if one exists — check `test_public_api.py`).
- Bypass, unauthenticated: `GET /domains` excludes the blacklisted domain (regression check — must still pass unchanged).
- Bypass, elevated: `GET /domains` with a valid `Authorization: Bearer` access token includes the blacklisted domain; `GET /domains/{id}` for that domain succeeds; `POST /token` for an address on that domain succeeds (not `422`); `POST /accounts` likewise.
- Elevated with a stale/deleted-credential token still active until expiry (session independent of credential row — matches Phase 1's documented revocation semantics) — write this as an explicit test so the behavior is intentional, not accidental.
- `DELETE /lock` invalidates the session — subsequent `/domains` with the same (now-dead) token reverts to the filtered list; `DELETE /lock` with no/garbage token still returns `204`.

### Frontend (vitest)

- Extend `frontend/src/tests/address-flow.test.ts` (or `AddressPanel`-specific test, whichever exists): unlock form appears collapsed by default; submitting a valid credential calls `api.unlock`, persists via `access.ts`, reloads domains with the token attached, shows the unlocked badge; submitting an invalid credential shows an inline error and does not change state; "Lock" clears the token and reloads the filtered domain list; page reload (simulated by re-mounting with `access.ts`'s localStorage pre-populated) restores the unlocked state.
- Extend `frontend/src/tests/AdminApp.test.ts`: switching to the "Access" tab renders the credential list; adding a password shows it in the list; generating a token shows the one-time secret panel then hides it on next list refresh; revoking removes a row; tab-switching is disabled while a mutation is in flight (`busy` behavior), matching the pattern already asserted for other tabs in this file.
- New `frontend/src/tests/access.test.ts` (mirrors `frontend/src/tests/session.test.ts`): `loadAccessToken`/`saveAccessToken`/`clearAccessToken` round-trip correctly and degrade gracefully when `localStorage` throws.

## Architecture

N/A — this phase is test-only, no production code changes.

## Related Code Files

- Create `tests/test_access_credentials.py` (or extend `tests/test_admin_api.py` + `tests/test_public_api.py` — confirm during implementation)
- Modify `tests/test_api_state.py` if `StateStore` unit-level coverage is thinner than integration coverage above warrants
- Create `frontend/src/tests/access.test.ts`
- Modify `frontend/src/tests/address-flow.test.ts` (or the correct existing `AddressPanel` test file)
- Modify `frontend/src/tests/AdminApp.test.ts`

## Implementation Steps

1. Read `tests/test_public_api.py` and `tests/test_admin_api.py` fixture setup (`client`, `config_path`, `fake_jmap`, blacklist-bearing settings) to confirm where new tests fit most naturally.
2. Write backend admin-credential CRUD tests.
3. Write backend `/unlock` + `/lock` tests, including the rate-limit case (check `test_public_api.py` for an existing `/token` rate-limit test to model the timing/mocking approach).
4. Write backend bypass tests across all four elevation-aware routes (`/domains`, `/domains/{id}`, `/token`, `/accounts`), both elevated and non-elevated, to lock in Phase 1's exact scope.
5. Read `frontend/src/tests/address-flow.test.ts` (or equivalent) to find the existing domain-loading/mocking pattern, then add the unlock/lock test cases in the same style.
6. Add `access.test.ts` mirroring `session.test.ts` structurally.
7. Add `AccessTab` coverage inside `AdminApp.test.ts` following its existing per-tab test structure.
8. Run `pytest tests/test_access_credentials.py tests/test_public_api.py tests/test_admin_api.py tests/test_api_state.py -v`.
9. Run `npm test -- --run` from `frontend/`.
10. Run `npm run build` from `frontend/` to confirm the production bundle still compiles (this repo's prior plan noted a build blocker unrelated to this work — re-check it's still broken or now fixed, and note either way rather than silently skipping this validation step).

## Todo List

- [ ] Backend admin-credential CRUD tests
- [ ] Backend `/unlock` + `/lock` tests (success, failure, rate limit)
- [ ] Backend elevation bypass tests across all four routes, both states
- [ ] Backend revocation-timing test (credential deleted, session still valid until expiry)
- [ ] Frontend `access.ts` unit tests
- [ ] Frontend `AddressPanel` unlock/lock flow tests
- [ ] Frontend `AccessTab` integration tests inside `AdminApp.test.ts`
- [ ] Full backend + frontend suites pass
- [ ] `npm run build` outcome recorded (pass, or pre-existing unrelated blocker confirmed still present)

## Success Criteria

- `pytest` and `npm test -- --run` both green.
- Every functional requirement and edge case listed in Phases 1–4's Requirements/Risk sections has at least one corresponding assertion.

## Risk Assessment

- **Risk:** `npm run build` may still be blocked by the pre-existing `@fontsource-variable/inter` dependency issue noted in `plans/260812-1455-domain-blacklist-patterns/plan.md`. **Mitigation:** this is a pre-existing environment issue, not something this plan's changes can fix — verify it's still the same root cause (not a new break) and record the finding rather than treating it as a blocking regression.

## Security Considerations

- Tests should explicitly assert that a non-elevated request never sees blacklisted domains (not just that an elevated one does) — the negative case is the actual security boundary.

## Next Steps

- None — final phase. Update `plan.md` phase statuses and run `/ck:journal` per the plan/cook workflow once implementation completes.
