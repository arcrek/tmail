# Phase 1 — Generate and open the random address

Status: Complete.

## Overview

Change the existing random-name control in `frontend/src/components/AddressPanel.vue` into the requested one-click random-email action.

## Related Code

- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/components/AddressPanel.vue`.
- Reuse `/home/arcrek/workspace/tmail_add_domain/frontend/src/App.vue` unchanged: its `openCreatedInbox()` handler saves the session, pushes `/{encoded-address}`, and renders `InboxView`.
- Reuse `/home/arcrek/workspace/tmail_add_domain/frontend/src/api.ts` unchanged: `api.token(address)` is the current creation/authentication request.

## Implementation

1. Keep the current cryptographic, pronounceable local-part generation in `randomize()`.
2. After generating the local part, choose an index with `crypto.getRandomValues` from the already-filtered `domains` list and assign `selectedDomain`.
3. Invoke the existing async `submit()` path after both fields are set. It already guards against an empty address, disables repeat submission through `submitting`, requests the token, and emits `open` on success.
4. Rename the visible action and accessible label to communicate that it creates/opens a random email, not merely a random name. Preserve the button's disabled state while domains load, no active domain exists, or a submission is in progress.

## Acceptance Criteria

- A click produces a six-letter randomized local part and one active loaded domain.
- Exactly one `POST /token` uses that combined address.
- A successful response emits the session, so the existing app opens that address's inbox and updates the URL.
- Failed token requests remain on the address screen and display the established error message.

## Deliberate Non-Goals

- No new random-email API, route, composable, dependency, retry loop, or domain fetch.
- No account-creation request: the existing stateless token endpoint is the project contract.
