# QR dialog findings repaired

The native modal made the body-appended clipboard textarea inert and excluded global copy toasts from the accessibility tree. The shared clipboard helper now appends its fallback inside the focused open dialog, retaining body fallback for ordinary callers. QR sharing now displays Copied and announces success inside the modal; failures appear there as an alert.

Verification: 196 frontend tests passed in 23 files; type checking and production build passed. Chromium checks at 375px and 1440px verified actual clipboard contents with the Clipboard API available, denied, and missing. Success/error nodes remained exposed in the accessibility tree; fallback cleanup, focus restoration, Escape, and overflow checks passed. Review found no remaining issue in these repaired paths. No backend or production data changed.

Journal skipped by preference. No unresolved questions.
