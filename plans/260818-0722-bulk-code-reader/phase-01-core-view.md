# Phase 1: Shared code-extraction util + BulkCodeView core

## Context Links

- Plan: [plan.md](./plan.md)
- Existing regex to extract: `frontend/src/components/MessageReader.vue:28-40` (`verificationCode` computed)
- Pattern to follow for domain-loading + table UI: `frontend/src/components/BulkGenerateView.vue`
- API client: `frontend/src/api.ts` (`api.token`, `api.messages`, `api.message`)

## Overview

- Priority: P2 (core deliverable)
- Status: Done
- Extract the verification-code regex into a standalone, testable module. Build the new `BulkCodeView.vue` component's input form, submit flow, and results table (no polling yet — that's Phase 2).

## Key Insights

- `MessageReader.vue`'s `verificationCode` computed already does exactly the extraction this feature needs: try subject, then plain text, then HTML-stripped-to-text, first standalone 4-8 digit run (with optional single space/hyphen in the middle) wins. Don't reinvent — extract and reuse.
- `MessageSummary` (from `GET /messages`) has `subject` and `intro` but `intro` is a truncated preview, not reliable for code extraction. The full body (`text`, `html`) only exists on `MessageResource`, fetched via `GET /messages/{id}`. So each row needs **two** calls after the token: `api.messages(token, 1)` to find the latest message id, then `api.message(token, id)` to get the body to extract from.
- `POST /token` is public/stateless (`AddressToken` in `src/api_auth.py` — see CLAUDE.md architecture notes) — no auth needed to request a token for any address, same mechanism `BulkGenerateView.vue` relies on for "open in new tab".
- Row failures are independent — a bad/blocked domain on row 3 must not stop rows 1-2 and 4-10 from resolving.

## Requirements

### Functional

- New route-free view `BulkCodeView.vue`, prop `accessToken?: string` (passed through like `AddressPanel`/`BulkGenerateView`), mounted by `App.vue` under a new `view === 'bulkCode'` state (wiring happens in Phase 2 — this phase can stub the App.vue mount point or defer it, but the component itself must be fully functional in isolation for its own tests).
- A `<textarea>` (or repeated text inputs — pick one, textarea is simplest) where the user pastes/types addresses separated by newline, comma, or whitespace. Client-side: trim, lowercase, dedupe, drop empty lines, cap at **10** (same cap as `BulkGenerateView`'s count field) — show a `bulk.partial`-style notice if the pasted list exceeds 10 (truncate to first 10, same UX as the generator's `partialCount`).
- On submit, for each address (in parallel, `Promise.allSettled`):
  1. `api.token(address, accessToken)` → cache `{ address: token }` in a `Map`/ref for later reuse (Phase 2 auto-poll).
  2. `api.messages(token, 1)` → take `hydra:member[0]` as "latest" (list is already newest-first, same assumption `InboxView` makes).
  3. If a latest message exists: `api.message(token, id)` → run `extractVerificationCode(subject, text, html)`.
  4. If no messages: row shows subject/code as empty-state placeholders, not an error.
- Table columns: **Email address | Subject | Extracted code**, plus an actions cell with a **Copy code** button (disabled when there's no code) and a **Copy email** action (icon button next to the address, consistent with `AddressPanel`'s copy-address pattern).
- Row states: `loading` (skeleton), `ready` (subject/code populated or empty-state dashes), `error` (message from `ApiError`, e.g. domain not accepted / rate-limited) — error rows still show the address and a retry affordance for that row alone.
- Copy actions use `copyText()` + `toast.success()`/`toast.error()`, same as every other copy button in the codebase.

### Non-functional

- No new npm dependency.
- Component must work with `accessToken` unset (site-wide unlock gate off) — same optional-prop pattern as `AddressPanel`/`BulkGenerateView`.

## Architecture

```
BulkCodeView.vue
├── input: textarea + "Read codes" submit button
├── parsed addresses (computed, capped at 10, deduped)
├── rows: ref<BulkCodeRow[]>
│     BulkCodeRow = { address, token?: string, status: 'loading'|'ready'|'error', subject?, code?, error? }
├── async function resolveRow(row): populates token cache + subject/code/error for one row
├── async function submit(): builds rows from parsed addresses, kicks off resolveRow for each (Promise.allSettled)
└── template: form + results table
```

`frontend/src/verificationCode.ts` (new):
```ts
export function extractVerificationCode(subject: string, text: string, html: string[]): string {
  const find = (value: string) => {
    const candidates = value.match(/(?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9])/g)
    for (const candidate of candidates ?? []) {
      const digits = candidate.replace(/\D/g, '')
      if (digits.length >= 4 && digits.length <= 8) return candidate
    }
    return ''
  }
  return find(subject) || find(text) || find(new DOMParser().parseFromString(html.join('\n'), 'text/html').body.textContent ?? '')
}
```

## Related Code Files

- Create: `frontend/src/verificationCode.ts`
- Create: `frontend/src/components/BulkCodeView.vue`
- Modify: `frontend/src/components/MessageReader.vue` — replace inline `verificationCode` computed body with `extractVerificationCode(message.value.subject, message.value.text, message.value.html)`, keep the computed wrapper (still needs `message.value` null-guard).
- Modify: `frontend/src/types.ts` — none expected (reuse `MessageResource`/`MessageSummary`/`DomainResource` as-is); confirm during implementation.

## Implementation Steps

1. Create `frontend/src/verificationCode.ts`, move the regex logic out of `MessageReader.vue` verbatim (behavior-preserving extraction — don't tweak the regex).
2. Update `MessageReader.vue` to import and call `extractVerificationCode`; run `MessageReader.test.ts` to confirm the extraction behavior is unchanged (should require zero test changes, since it's a pure refactor).
3. Build `BulkCodeView.vue`: parsing/dedupe/cap logic for the textarea input (mirror `BulkGenerateView.vue`'s `partialCount` UX for the >10 truncation notice).
4. Implement `resolveRow`/`submit` with the 3-call chain (`token` → `messages` → `message`), token caching in a local `Map<string, string>`, per-row error isolation.
5. Build the results table with per-row Copy code / Copy email actions and loading/empty/error row states.
6. Wire `useToast()` for copy feedback, `useI18n()` for all labels (add new `bulkCode.*` keys — full key list finalized in Phase 3, stub the ones needed here with sensible English/Vietnamese strings now so nothing renders as a raw key).

## Todo List

- [x] `verificationCode.ts` created, `MessageReader.vue` refactored to use it, existing `MessageReader.test.ts` still green
- [x] `BulkCodeView.vue` parses/dedupes/caps pasted addresses at 10
- [x] Submit resolves all rows independently via `Promise.allSettled`, no row blocks another
- [x] Token cached per address, reused (not re-fetched) — verified by only one `api.token` call per address in this phase's manual testing
- [x] Copy code / Copy email buttons work, disabled appropriately when no code/address

## Success Criteria

- Pasting 10 mixed-validity addresses and submitting shows 10 independent row outcomes, no unhandled promise rejection, no row's failure blocking others.
- `MessageReader.vue`'s existing verification-code display and its tests are unaffected by the extraction refactor.
- Copying code/email from a row round-trips through `copyText()` and surfaces a toast.

## Risk Assessment

- **Regex extraction drift:** copy-paste the exact regex/logic; do not "improve" it in the same phase — any behavior change belongs in a separate, deliberate change with its own test coverage.
- **10 parallel `/token` calls in one submit** sit exactly at the rate limiter's ceiling (10/60s) — a second submit within the same 60s window (e.g., editing the list and resubmitting) will 429 on some/all rows. Acceptable per scope decision (matches bulk generator's precedent); surface the `ApiError` message on the affected rows rather than crashing.

## Security Considerations

- No new attack surface: `/token`, `/messages`, `/messages/{id}` are all existing public/bearer-token-gated endpoints already reachable from the frontend. Pasting someone else's address only gets you what `/token` already exposes to anyone who knows that address — no privilege escalation introduced by this feature.

## Next Steps

- Phase 2 adds auto-poll (reusing the cached tokens from this phase) and header nav wiring.
