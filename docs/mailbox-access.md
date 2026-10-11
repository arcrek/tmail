# Mailbox access

Inboxes are public by default. Use password protection when access should require
a mailbox password, and understand its expiry before relying on it. This guide
owns the access policy; the running application's `/docs` page owns request and
response schemas.

## Access policy

Any visitor can set the first password on a public address, including one already
in use. The first successful claim wins and can lock out earlier visitors. There
is no self-service password recovery. Site unlock does not bypass a mailbox
password.

Passwords contain 12–128 Unicode characters; spaces are preserved. Protection
expires 90 days after creation, change, administrator reset, or successful visitor
password login. At expiry the mailbox becomes public. Reading mail and
administrator access do not renew protection.

Visitor sessions expire 90 days after issuance. A password login renews protection
and creates another session without extending older sessions or signing out other
devices. Protection changes and expiry invalidate earlier tokens without deleting
mail. Message retention is a separate policy.

## Browser workflow

Use **Set password**, **Change password**, or **Remove password** on the mailbox
page. The form shows the protection deadline. Protected visitors supply their
current password to change or remove protection; signed-in administrators can
reset or remove it without that password.

Saved visitor tokens are validated before mail is displayed. Passwords, CSRF
values, and administrator mailbox tokens are never persisted in browser storage.
Visitor logout clears this browser's saved token and requests server revocation.
An offline logout reports when revocation cannot be confirmed; other browsers
detect revocation on their next authorization check. Administrator mailbox
logout also signs out the parent administrator session.

Bulk code reading uses valid saved visitor access or an administrator exchange.
Locked rows link to the mailbox login page.

## API entry points

| Endpoint | Purpose |
|---|---|
| `POST /accounts` | Validate an address and report protection metadata; does not authenticate |
| `POST /token` | Issue public access, or protected visitor access with `password` |
| `GET /me` | Report the current mailbox and access metadata |
| `PUT /me/password` | Claim or change protection with a new `password` |
| `DELETE /me/password` | Remove protection |
| `POST /me/logout` | Revoke the current secured session |

Protected visitor changes and removal require `currentPassword`. Successful
password mutations return a replacement token. `GET /me` and token responses
report `protected`, `protectedUntil`, `accessKind`, and `sessionExpiresAt`.

Administrators exchange their existing `/admin` cookie and CSRF token through
`POST /admin/api/mailboxes/token` with an `address`. Password reset and removal
use `PUT` and `DELETE /admin/api/mailboxes/password`; reset adds `password`.
These operations require `X-CSRF-Token`. Administrator mailbox tokens expire no
later than their 12-hour parent session and never renew protection.

Use the running `/docs` page for payloads and schemas. The executable owners are
[public routes](../src/api_server.py), [admin routes](../src/admin_api.py),
[authentication](../src/api_auth.py), and [API models](../src/api_models.py).

## Errors and failure boundaries

Missing or wrong credentials return 401; invalid inputs return 422; lost claims
or mutation races return 409; throttling or hash-capacity exhaustion returns 429.
Hydra errors can include a stable `code`, such as `password_required`,
`invalid_credentials`, `invalid_token`, or `password_busy`. Storage and hashing
failures deny access and return sanitized service errors.

For migration safety, backups, rollback limits, and production hash calibration,
see [upgrades and rollback](deployment.md#upgrades-and-rollback). For enforcement
boundaries, see [architecture](architecture.md#state-database-upgrades-and-mailbox-lifecycle).
