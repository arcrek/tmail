# Phase 2: InboxView new-mail toast with copy actions

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1: [Toast core: action buttons](./phase-01-toast-actions-core.md)
- Existing new-mail detection: `frontend/src/components/InboxView.vue` (`notifyNew`, `knownIds`, called from `refresh()`)
- Code extraction util (dependency): `frontend/src/verificationCode.ts` (from `260818-0722-bulk-code-reader` Phase 1)

## Overview

- Priority: P2
- Status: Done
- When `InboxView.vue` detects genuinely new message(s) (same detection `notifyNew` already uses for the browser `Notification`), also push an in-app toast per new message with **Copy email** and, when a code is found, **Copy code** actions.

## Key Insights

- `notifyNew(values: MessageSummary[])` already distinguishes "new since last check" from "first load" via the `initialized` flag and `knownIds` set — reuse that exact gate so the toast doesn't fire for the initial page load's existing messages, only for messages that arrive while the view is open (same semantics as the existing browser notification).
- `MessageSummary` (what `refresh()`/`notifyNew` receive) does **not** include `text`/`html` — only `MessageResource` (fetched via `api.message`) does. Extracting a code for the toast requires one extra `api.message(token, id)` call per newly-detected message. This is bounded (new mail is rare relative to poll ticks) and acceptable — do not fetch the full message speculatively for messages that aren't new.
- Keep the two notification channels (browser `Notification`, in-app toast) independent — a user with notifications denied still gets the toast; a user with notifications granted gets both. Don't gate one on the other.

## Requirements

### Functional

- In `notifyNew`, for each genuinely-new message (the same filter already used: `initialized && !knownIds.has(id)`), in addition to the existing `new Notification(...)` call:
  1. Fetch the full message via `api.message(props.session.token, id)` (best-effort — if it fails, still show a toast with just the email-copy action, degrade gracefully, don't block the rest of `notifyNew`).
  2. Extract code via `extractVerificationCode(message.subject, message.text, message.html)`.
  3. Push `toast.success(...)` with the subject as the message body and actions: always `Copy email` (copies `props.session.address`), plus `Copy code` (copies the extracted code) only when a code was found.
- Copy actions reuse `copyText()` — same import already used elsewhere in `InboxView.vue`/`MessageReader.vue`.
- If multiple messages arrive between polls, push one toast per message (matches the existing per-message `Notification` behavior) — don't collapse into a single "N new messages" toast (that's a nicer UX but out of scope; explicitly note as deferred, not silently dropped).

### Non-functional

- The extra `api.message` call for new-mail toasts is not rate-limited server-side (only `/token`/`/accounts`/`/unlock`/admin logins are) — no interaction with the `260818-0722-bulk-code-reader` rate-limit constraints.
- Must not regress `InboxView.vue`'s existing polling/streaming behavior — this is additive inside `notifyNew`, not a restructure of `refresh()`.

## Architecture

```ts
// InboxView.vue
import { extractVerificationCode } from '../verificationCode'

async function notifyNew(values: MessageSummary[]): Promise<void> {
  if (initialized) {
    const freshIds = values.filter(({ id }) => !knownIds.has(id))
    for (const item of freshIds) {
      if (notificationPermission.value === 'granted' && typeof Notification !== 'undefined') {
        new Notification(t('inbox.newMessage'), { body: t('inbox.newMessageBody') })
      }
      void announceToast(item)
    }
  }
  for (const { id } of values) knownIds.add(id)
  initialized = true
}

async function announceToast(item: MessageSummary): Promise<void> {
  let code = ''
  try {
    const full = await api.message(props.session.token, item.id)
    code = extractVerificationCode(full.subject, full.text, full.html)
  } catch {
    // best-effort — still show the toast with just the copy-email action
  }
  const actions = [
    { label: t('inbox.copyEmailAction'), onClick: () => void copyText(props.session.address) },
    ...(code ? [{ label: t('inbox.copyCodeAction'), onClick: () => void copyText(code) }] : []),
  ]
  toast.success(item.subject || t('inbox.noSubject'), actions)
}
```

Note: `notifyNew` is currently `function`, not `async` — this phase makes it fire-and-forget the new per-message async work (`void announceToast(item)`) rather than making `notifyNew` itself `async`, since `refresh()` doesn't currently await it and shouldn't start doing so (toast delivery must not block the refresh cycle).

## Related Code Files

- Modify: `frontend/src/components/InboxView.vue` — `notifyNew`, new `announceToast` helper, import `extractVerificationCode` and `useToast` (check whether `InboxView.vue` already imports `useToast` — if not, add it) and `copyText` (already imported).

## Implementation Steps

1. Import `extractVerificationCode` from `../verificationCode` and confirm/add `useToast()` in `InboxView.vue`'s script setup.
2. Add `announceToast(item: MessageSummary)` per the architecture above.
3. Call `void announceToast(item)` for each freshly-detected message inside `notifyNew`, alongside (not instead of) the existing `Notification` call.
4. Verify the `initialized`/`knownIds` gating still suppresses toasts on first load — this is the same gate the existing code already relies on, just confirm the new call sits inside it correctly.

## Todo List

- [x] New mail while the tab is open triggers exactly one toast per new message, with a working Copy email action
- [x] When the new message's body contains an extractable code, the toast also shows a working Copy code action
- [x] First page load (existing messages) does not trigger any toast — only genuinely new arrivals do
- [x] `api.message` failure for the toast's code lookup degrades to email-only actions, doesn't throw/break polling

## Success Criteria

- Manually verified (via `run-tmail` skill or local dev with a test message) that a new message produces a toast with working copy actions, and that the browser `Notification` (when permitted) still fires unchanged alongside it.

## Risk Assessment

- **Extra `api.message` call volume:** bounded by actual new-mail rate, not poll rate — acceptable, but note it in review if this view is ever used against a high-volume inbox (out of scope to optimize further here per HOLD scope).
- **Fire-and-forget error swallowing:** the `try/catch` around `api.message` must not silently eat *all* errors without at least the graceful degrade — confirmed by the "email-only actions" fallback above, not a bare empty catch that also skips the toast.

## Security Considerations

- No new surface — `api.message` with the session's own token is already called elsewhere in this same view (`MessageReader.vue` reads full messages via the same token). No cross-tenant access introduced.

## Next Steps

- Phase 3 covers tests and the two new i18n keys (`inbox.copyEmailAction`, `inbox.copyCodeAction`).
