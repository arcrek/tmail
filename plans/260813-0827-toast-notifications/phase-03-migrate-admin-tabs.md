# Phase 3: Migrate the 5 admin tabs

## Context Links

- Plan overview: [plan.md](./plan.md)
- Depends on: [Phase 1 — Toast core](./phase-01-toast-core.md)
- Independent of Phase 2 (different files) — can be done in parallel with it, sequenced after only because it's bulkier and benefits from the pattern being proven once in Phase 2.
- Files: `frontend/src/admin/GeneralTab.vue`, `MailServerTab.vue`, `DomainsTab.vue`, `ContentTab.vue`, `AccessTab.vue`

## Overview

- Priority: P1
- Status: Pending
- All 5 files share the exact same `status`/`error` ref shape and the exact same two-line template tail (`<p class="form-status">` / `<p class="form-error">`). This is the highest-value part of the plan — it deletes ~2 lines × ~7 action-functions × 5 files of reset boilerplate.

## Key Insights

- `DomainsTab.vue` also has `displayedSync`/`displayedSuccessfulSync`/`displayedSyncError` driving a **persistent** "last sync" history table with `.status-error` styling — that is unrelated to the `status`/`error` refs being removed here and **must not be touched**. Don't confuse `.status-error` (table cell class, stays) with `.form-error`/`.form-status` (paragraph classes, being deleted).
- `AccessTab.vue` has no `status` ref at all (only `error` — it has no "saved" concept, credentials list re-renders itself). Only migrate `error` there; there's no `status.value = ...` line to find.
- Every action function in every file follows: reset `error`/`status` to `''` at the top → do the async call → on success set `status.value = t(...)` (or nothing, for `AccessTab`) → on failure set `error.value = ...`. The reset lines are simply deleted (nothing to reset now); success/failure assignments become `toast.success(...)`/`toast.error(...)`.
- `MailServerTab.testConnection()`'s success message uses interpolation (`t('mail.passed', { domains, messages })`) — same call, just wrapped in `toast.success(...)` instead of assigned to `status.value`.
- `DomainsTab.syncNow()` has a nested try/catch where a *second* failure (settings refresh after a successful sync) overwrites `error.value` with a composed message (`error.domainsSynced`) — preserve that exact composed-message logic, just route the final value through `toast.error(...)` instead of `error.value =`.
- After deleting `status`/`error` refs from all 5 files, check whether `.form-status`/`.form-error` CSS rules (`styles.css:245`, `:1343`, `:1351`) are still referenced anywhere else in the codebase (they are, by `AddressPanel.vue` until Phase 2 lands, and nowhere after Phase 2+3 both land) — deleting the dead CSS is Phase 4's job (cross-cutting cleanup after both migrations are confirmed complete), not this phase's.

## Requirements

- Every `status.value = t(...)` becomes `toast.success(t(...))` at the same call site (4 files: General, MailServer, Domains, Content).
- Every `error.value = ...` (Error-derived or i18n-derived) becomes `toast.error(...)` at the same call site (all 5 files).
- Every `status.value = ''` / `error.value = ''` reset line is deleted.
- `status`/`error` `ref('')` declarations deleted from all 5 files' `<script setup>`.
- The `<p class="form-status" aria-live="polite">{{ status }}</p>` and `<p v-if="error" class="form-error" role="alert">{{ error }}</p>` lines deleted from all 5 templates.
- `pending`/`testing`/`syncing`/`filePending` booleans are **untouched** — they still gate `:disabled` and button label text (e.g. `{{ pending ? t('reader.saving') : t('general.save') }}`), unrelated to this migration.

## Architecture

Same mechanical pattern per file:
```ts
// before
error.value = ''
status.value = ''
// ...
status.value = t('x.saved')
// ...
error.value = cause instanceof Error ? cause.message : t('error.x')

// after
const toast = useToast()
// ...
toast.success(t('x.saved'))
// ...
toast.error(cause instanceof Error ? cause.message : t('error.x'))
```

## Related Code Files

- Modify: `frontend/src/admin/GeneralTab.vue`
- Modify: `frontend/src/admin/MailServerTab.vue`
- Modify: `frontend/src/admin/DomainsTab.vue`
- Modify: `frontend/src/admin/ContentTab.vue`
- Modify: `frontend/src/admin/AccessTab.vue`

## Implementation Steps

For each of the 5 files:
1. Add `import { useToast } from '../toast'` and `const toast = useToast()` near the existing `const { t, ... } = useI18n()` line.
2. Remove the `status`/`error` `ref('')` declarations.
3. Replace every `status.value = ...` with `toast.success(...)`, every `error.value = ...` with `toast.error(...)`, in place.
4. Delete every `status.value = ''` / `error.value = ''` reset line.
5. Delete the trailing `<p class="form-status">`/`<p v-if="error" class="form-error">` lines from the template.

File-specific notes:
- **`GeneralTab.vue`**: `chooseImage()` sets `error.value` three times (type check, size check, `readFile` failure) — all become `toast.error(...)`. `save()` has the standard success/failure pair.
- **`MailServerTab.vue`**: two action functions (`save()`, `testConnection()`), both with the standard pair; `save()` also has a pre-flight `valid()` check that sets `error.value` then `return`s — becomes `toast.error(...); return`.
- **`DomainsTab.vue`**: five action functions (`changeAutoSync`, `save`, `addManualDomain`, `removeDomain`, `syncNow`). `syncNow()` is the one with nested try/catch — preserve its exact branching, only swap the assignment target.
- **`ContentTab.vue`**: `save()` has three pre-flight validation checks (`error.value = ...; return`) before the async call, plus the standard success/failure pair after it — all six become `toast.error(...)`/`toast.success(...)`.
- **`AccessTab.vue`**: `loadCredentials()`, `create()`, `addPassword()` (pre-flight password-match check), `revoke()`, `copySecret()` all set `error.value` on failure; only `create()`'s implicit success (via `loadCredentials()` after creating) has no message today — **don't invent a new success toast here**, the existing UX shows the revealed secret panel instead, which is sufficient feedback (adding an extra toast would be redundant chatter, YAGNI).

## Todo List

- [ ] `GeneralTab.vue` migrated
- [ ] `MailServerTab.vue` migrated
- [ ] `DomainsTab.vue` migrated (sync history table left untouched)
- [ ] `ContentTab.vue` migrated
- [ ] `AccessTab.vue` migrated (no new success toast invented for credential creation)
- [ ] `vue-tsc --noEmit` passes after all 5 files
- [ ] Manual smoke test in dev server: save each tab once successfully and once with a forced failure (e.g. bad JMAP URL), confirm toast appears in both cases

## Success Criteria

- Every admin tab's save/sync/test/revoke/upload action shows a toast instead of the inline paragraph, with identical message text to before.
- `DomainsTab`'s last-sync history table (time/result/detail/last-success/last-error) renders exactly as before — untouched by this phase.
- No leftover `status`/`error` refs or dead template bindings in any of the 5 files.

## Risk Assessment

- Easiest mistake: touching `displayedSync*`/`.status-error` in `DomainsTab.vue` by confusing it with the `status`/`.form-status` being removed — double-check the diff isolates only the `status`/`error` refs and their two template lines.
- `AccessTab.vue`'s `secret` reveal panel must keep working exactly as-is (it's not part of this migration) — verify after the change that creating a credential still shows the one-time-secret panel.

## Security Considerations

- Same as Phase 2: messages are `t()`/`Error.message` strings rendered via `{{ }}`, never `v-html`.

## Next Steps

- Phase 4 adds the `toast.dismiss` i18n key (if not already added in Phase 1), fixes the one test assertion that reads `.form-error` today, and removes now-dead `.form-status`/`.form-error` CSS once both Phase 2 and this phase are confirmed merged.
