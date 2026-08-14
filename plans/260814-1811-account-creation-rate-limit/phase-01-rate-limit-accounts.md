# Phase 1 — Add /accounts to the rate-limited path set

## Overview

**Priority:** P1
**Status:** Done
**Estimate:** 0.5h

## Related code files

- Modify: `src/api_server.py`
  - `security` middleware path set (~line 729): add `"/accounts"`.
  - `/accounts` route decorator (~line 553): swap `responses=_ERROR_RESPONSES` for
    `responses=_TOKEN_RESPONSES` — `_ERROR_RESPONSES` has no `429` entry; `_TOKEN_RESPONSES`
    already documents `413`/`429` and is the correct shared set (`/token` uses the same one).
- Modify: `tests/test_public_api.py` — add a rate-limit test for `/accounts`.

## Implementation steps

1. In the `security` middleware, change the path check from
   `{"/token", "/unlock", "/admin/login", "/admin/api/login"}` to include `"/accounts"`.
2. Change `/accounts`' `responses=_ERROR_RESPONSES` to `responses=_TOKEN_RESPONSES` so `429` (and
   `413`, already applicable via `_BodyLimitMiddleware`) show up in `/openapi.json`.
3. Add `test_accounts_path_is_rate_limited`, mirroring `test_admin_login_path_is_rate_limited`:
   post a valid `AddressRequest` body 10 times (expect success/normal status each time), assert
   the 11th returns `429` with a `hydra:Error` body.
4. Extend `test_openapi_documents_passwordless_bearer_contract` (or add a new assertion) to check
   `"429" in schema["paths"]["/accounts"]["post"]["responses"]`.

## Success criteria

- 11th rapid `POST /accounts` from the same IP within 60s returns `429`.
- `/token`, `/unlock`, `/admin/login`, `/admin/api/login` keep their own independent budgets
  (per-path key already handles this — `test_fixed_window_prunes_expired_keys_and_separates_paths`
  must still pass unmodified).
- `/openapi.json` documents `429` for `/accounts`.

## Todo

- [x] Add `/accounts` to the middleware's rate-limited path set.
- [x] Swap `/accounts` route to `_TOKEN_RESPONSES`.
- [x] Add rate-limit test for `/accounts`.
- [x] Add/extend OpenAPI-documents-429 test.
- [x] Run `pytest tests/test_public_api.py -q`.
