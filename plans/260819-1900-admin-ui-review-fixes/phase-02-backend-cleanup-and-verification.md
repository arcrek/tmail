# Phase 2: Backend Test Cleanup & Verification

## Tasks

1. **Clean Up `tests/test_admin_api.py`**
   - Revert unnecessary change at line 455 back to original `if settings and settings["auto_sync_domains"]:`.

2. **Full Verification Suite**
   - Run `npm --prefix frontend run build` (Vite & Vue-TSC).
   - Run `npm --prefix frontend test` (Vitest unit tests).
   - Run backend test suite (`pytest` / `venv/bin/pytest`).

## Acceptance Criteria
- `npm run build` passes with zero TypeScript or Vite errors.
- Vitest suite 100% passing (185+ tests).
- Backend pytest suite 100% passing (279 tests).
- All 5 review findings resolved.
