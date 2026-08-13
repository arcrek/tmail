# Phase 3: Unread message — add a non-visual signal

## Context Links

- Plan overview: [plan.md](./plan.md)
- Message row markup: `frontend/src/components/InboxView.vue:266-287`
- Current unread styling: `frontend/src/styles.css:802-809`
- Sibling pattern for sr-only status text: `InboxView.vue:282-285` (`.attachment-flag` already does icon + `sr-only` text — the fix in this phase applies the same pattern to "unread")
- i18n pattern: `'inbox.attachment': 'Has attachment'` (`i18n.ts:14`) — match this style for the new key

## Overview

- Priority: P2
- Status: Pending
- Unread state today is signalled two ways, both purely visual: `font-weight: 700` on the subject (`styles.css:807-809`) and a `3px` left border (`styles.css:802-805`). A screen reader reading a message row gets sender, time, subject, preview, and (if present) an "attachment" announcement — but never "unread". This phase adds a screen-reader-only text signal, matching the project's own existing `color-not-only` discipline (already applied to toasts/errors, just missed here).

## Key Insights

- This is additive only — the existing weight + border styling stays exactly as-is (no regression, no visual change for sighted users).
- Follow the exact pattern already in the same file for `hasAttachments` (`InboxView.vue:282-285`): a conditionally-rendered `<span class="sr-only">`. Don't invent a new pattern for the same problem shape.
- No prop/emit changes — `item.seen` is already on `MessageSummary` and already drives the `unread` class (`InboxView.vue:272`).

## Requirements

1. Screen reader announces "Unread" (or equivalent) when a message row's `item.seen` is `false`, without changing the row's visible text.
2. No change to sighted-user visuals.

## Architecture

**`frontend/src/i18n.ts`** — one new key, placed beside `'inbox.attachment'`:
- `en`: `'inbox.unread': 'Unread'`
- `vi`: `'inbox.unread': 'Chưa đọc'`

**`frontend/src/components/InboxView.vue:266-287`** — add one `sr-only` span, mirroring the attachment-flag pattern already three lines below it:

```diff
         <span class="message-row-top">
           <strong>{{ item.from.name || item.from.address }}</strong>
           <time :datetime="item.createdAt">{{ formatDate(item.createdAt) }}</time>
         </span>
+        <span v-if="!item.seen" class="sr-only">{{ t('inbox.unread') }}</span>
         <span class="message-subject">{{ item.subject || t('inbox.noSubject') }}</span>
```

Placed before the visible subject text so the announcement order is "Unread, Subject: ..." rather than reading the subject first and the state as an afterthought — matches how the existing `.attachment-flag` sr-only text (`inbox.attachment`) is read after the row's other content, but "unread" is a state that should prefix, not trail.

`.sr-only` is an existing utility class (`styles.css:327-337`) — no new CSS.

## Related Code Files

- Modify: `frontend/src/components/InboxView.vue` (one conditional `sr-only` span)
- Modify: `frontend/src/i18n.ts` (`inbox.unread`, en + vi)

## Implementation Steps

1. Add `inbox.unread` to `i18n.ts` (both locales).
2. Add the conditional `sr-only` span in `InboxView.vue`.
3. Manual check: a screen reader (or the accessibility tree in browser dev tools) reads "Unread" as part of an unread row's accessible name/description, and nothing extra for a read row.

## Todo List

- [ ] `inbox.unread` key added (en + vi)
- [ ] `sr-only` span added to the message row, gated on `!item.seen`
- [ ] Verified via accessibility tree inspector (or screen reader) that unread rows announce it and read rows don't
- [ ] Confirmed no visible-layout change (weight/border unchanged)

## Success Criteria

- Message rows with `item.seen === false` expose an "Unread" (or localized equivalent) text node to assistive tech; rows with `item.seen === true` do not.
- No visual diff in either theme — this phase changes accessible-name content only.
- Existing `frontend/src/tests/InboxView.test.ts` still passes; if it snapshots row markup, extend the assertion to cover the new span rather than treating it as a diff to suppress.

## Risk Assessment

- Low — single conditional span, existing utility class, existing i18n pattern. Main risk is placement relative to other row content producing an awkward reading order; verify with an actual accessibility-tree check, not just "it compiles."

## Security Considerations

None.

## Next Steps

- Independent of Phase 1 and Phase 2. Once all three phases ship, re-run the original audit's checklist (or the ui-ux-pro-max pre-delivery checklist) as a final pass rather than assuming the fixes closed every item.
