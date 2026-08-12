# Phase 3 — Detect OTPs in opened messages

Status: Complete.

## Overview

Surface a verification code as soon as `MessageReader` finishes loading a selected email.

## Related Code

- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/MessageReader.vue` only.
- Reuse `/home/arcrek/workspace/tmail_add_domain/frontend/src/clipboard.ts` for user-triggered copying.

## Implementation

1. Add a small local extractor in `MessageReader.vue`: scan subject first, then plaintext body, then text derived from HTML only when needed; match the first standalone ASCII number of 4–8 digits. Do not accept a substring of a longer digit sequence.
2. Derive the code reactively from the loaded `message` value, so changing the selected message clears the old result during the existing load reset and evaluates the new message when it resolves.
3. Render a compact “Verification code” side panel next to the opened email on desktop only when a code exists. Use an explicit Copy button and the existing clipboard helper; show copy failure using the component's established action-error path.
4. Extend the existing message-reader responsive CSS: keep the panel adjacent to the email at wide widths, then stack it above the message content below the reader's existing responsive breakpoint. It must remain keyboard-accessible and not cover the reader actions or body.

## Acceptance Criteria

- Opening an email containing `1234` through `12345678` as a standalone token displays that code.
- On wide screens, the compact OTP panel is visibly beside the opened email; on narrow screens it reflows without horizontal overflow.
- Three-digit values and any segment within a 9+-digit number do not match.
- Subject matches win over body matches; selecting another email cannot retain a prior code.
- The code never leaves the browser through a new request and is not silently copied.

## Non-Goals

- No OTP classification by sender, machine learning, notification, auto-submit, or API/backend extraction.
