# Phase 2 — Make email copy work broadly

## Files

- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/AddressPanel.vue`
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/InboxView.vue`
- Create: `/home/arcrek/workspace/tmail_add_domain/frontend/src/clipboard.ts`
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/address-flow.test.ts`
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/InboxView.test.ts`

## Root cause

Both `copyAddress()` and the inbox copy action unconditionally call `navigator.clipboard.writeText()`. That API is absent or rejects in insecure HTTP contexts and some embedded browsers, immediately producing the reported failure despite a user click.

## Implementation

1. Add one small `copyText()` helper shared by both callers: use `navigator.clipboard.writeText()` first, then append a rendered-but-off-screen readonly textarea (`aria-hidden`, `tabindex=-1`), select it, call `document.execCommand('copy')`, restore the previous focus, and remove it in `finally`. Treat a `false` result or thrown error as failure.
2. Replace both component-local Clipboard API calls with that helper. Clear a prior copy failure before retrying, set their success state only after it resolves, and retain each component’s current failure message only if both paths fail.
3. Add tests for Clipboard API success, rejection/absence followed by fallback success and cleanup/focus restoration, and failure of both mechanisms. Cover each UI entrypoint, including failure followed by successful retry.

## Success criteria

- Copy succeeds in secure-context browsers and in browsers that still support `execCommand` but not Clipboard API.
- No temporary DOM node remains after success or failure.
- Copy failures remain explicit rather than falsely displaying “Copied”.

## Security and accessibility

The fallback contains only the currently displayed address, exists synchronously for the user-initiated copy action, and is removed in `finally`. It adds no permissions, storage, or dependency.

## Result

Added the shared `copyText()` helper and routed both address copy entrypoints through it. It uses the Clipboard API when available, otherwise a temporary off-screen textarea with `execCommand('copy')`, restores focus, and always cleans up. Tests cover helper success/rejection/fallback/cleanup plus both UI entrypoints and failed-copy retry; `npm test -- --run` passes (93 tests).
