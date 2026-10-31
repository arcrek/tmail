# Frontend Design Guidelines

TMail follows Material Design 3: tonal surface layers instead of borders, pill buttons and navigation, large rounded containers, and a teal tertiary role reserved for verification codes. [DESIGN.md](../DESIGN.md) holds the full token and component rules. It keeps TMail’s identity and existing mail workflows. There are no Google logos or external font services.

## Executable owners

- [Shared tokens and responsive styles](../frontend/src/styles.css) own both public and admin styling.
- [Application header](../frontend/src/components/AppHeader.vue) owns navigation, locale, theme, and unlock controls. The locale picker sits outside the collapsible menu so it stays visible on every public screen. [The app shell](../frontend/src/App.vue) owns the public footer with the API docs and admin links.
- [Home address panel](../frontend/src/components/AddressPanel.vue) owns quick email access, address creation, random addresses, and saved inbox actions; [mailbox access](../frontend/src/mailbox-access.ts) owns their shared authorization flow, and [server address normalization](../src/api_auth.py) validates receiving domains.
- [Admin shell](../frontend/src/admin/AdminApp.vue) groups settings navigation and account controls in one sidebar beside the content workspace.
- [Default site settings](../src/api_state.py) supply default brand colors. [Site customization](../frontend/src/App.vue) applies administrator colors at runtime.
- [QR dialog](../frontend/src/components/QrCodeModal.vue) uses the native modal dialog for keyboard containment, Escape, and focus restoration.

## Color and branding

| Role | Light | Dark |
|---|---|---|
| Canvas (`--canvas`, M3 surface) | `#f9f9ff` | `#111318` |
| Workspace surface (`--surface`, container-low) | `#f1f3fa` | `#191c20` |
| Field / inner card (`--surface-lowest`) | `#ffffff` | `#0c0e13` |
| Secondary surface (`--surface-2`, container-high) | `#e5e7ee` | `#282a2f` |
| Main text | `#1a1b20` | `#e2e2e9` |
| Secondary text | `#44474f` | `#c4c6d0` |
| Divider (outline-variant) | `#c4c6d0` | `#44474f` |
| Verification code (tertiary container) | `#9cf1f0` | `#004f4f` |

New installations default to primary `#0b57d0` and accent `#0842a0`. Existing saved settings retain their colors, including the previous ember palette. Change them through General settings to adopt blue on an existing installation. The existing migration of the original paired blue defaults remains in place.

All brand-derived action, selection, and focus colors flow through `--brand-primary` and `--brand-accent`; the primary, primary-container and secondary-container roles derive from them through `color-mix()` in both themes. The tertiary (verification code), success, warning, and error roles stay independent of branding. Success, warning, and error colors stay independent of branding. Review contrast when setting custom colors.

## Typography and shape

Roboto Flex is the self-hosted display and body family (`@fontsource-variable/roboto-flex`, including Vietnamese). Use size and weight for hierarchy instead of a second display face. Roboto Mono covers addresses, codes, and technical content. Dashboard numbers use the body family with tabular numerals.

Use the radius tokens: 8px for chips and fields, 12px for brand marks, 16px for icon containers, 28px for workspaces, cards and dialogs, 40px for the home hero, and the pill token for buttons, search and navigation. Use the existing spacing scale. Keep static surfaces flat; reserve shadows for floating controls and notifications.

## Layout and interaction

- Home centers one hero block: headline, a segmented switch between “New address” (one rounded composer `name @ [domain]` with random and open actions) and “Existing address” (quick access by full email), and saved inboxes as input chips. Quick access opens a full address without a domain-selection step; the create and random-address flows are unchanged. Both forms use the same mailbox authorization and password flow, with the server validating receiving domains.
- Inbox shows an address card (status, address, copy, icon actions, new address) beside a latest-code card, then a list-detail layout: the message list stays visible next to the reader above 952px; at 952px and below the reader replaces the list. At 640px and below the icon actions move to a fixed bottom app bar with the new-address FAB.
- Admin uses a sidebar and content column, narrows the sidebar at 952px, and switches to horizontally scrollable tabs at 640px. Account controls remain available above mobile content.
- Public navigation becomes a menu at 952px; the language pill (full name on wide screens, ISO code on narrow ones) and theme toggle stay in the header. Active destinations use a tinted pill and `aria-current`.
- Search uses a tinted pill field. Form controls retain visible labels and outlines.
- Keep visible keyboard focus and at least 44px touch targets. Reduced-motion mode disables animation and transitions.
- QR sharing centers its dialog, keeps it within the viewport, and restores focus to the trigger when dismissed. QR symbols encode the complete plain address and include a white four-module quiet zone on every side. Generation failure shows a localized alert and keeps the address and copy button available. Copy success and error feedback stays inside the dialog so it remains accessible. The shared clipboard fallback places its temporary textarea inside the focused dialog to avoid the inert background.
- Mailbox login uses a centered, padded card capped at 32rem with compact form spacing. It retains the requested address and provides a labeled password field with current-password autocomplete and inline errors. Password management uses the same native modal pattern as QR sharing, shows the actual protection deadline and 90-day warning, and restores trigger focus. The hidden username field supplies password-manager context without receiving focus. Validate 12–128 Unicode code points and preserve spaces; backend validation is authoritative.
- Visitor storage changes clear active protected mail before validating replacement access. Public and administrator access remain subject to server authorization checks. Authorization failures clear message lists, readers, code caches, and mailbox notification toasts. A same-session 401/403 takes precedence over request ordering, including after pagination, visibility refresh, or reader selection changes; pending successes cannot restore mail. Ignore failures from previous mailbox sessions. Bulk locked rows link to the normal login page.

## Content boundaries

Email HTML and administrator-provided HTML remain sandboxed. Email and QR surfaces stay white in both themes for content fidelity and scanning. The owned `npm run test:sandbox-browser` gate opens the actual message iframe through the inbox flow and proves its opaque origin, denied parent DOM/storage access, and blocked email scripts, event handlers, refreshes, and forms. Theme changes must not alter sandbox permissions or inline production assets. The default envelope favicon is bundled under `/assets/` so the API static mount serves it; administrator-provided favicons still override it.

## Verification

Run the [frontend commands](../frontend/package.json) for tests and build. Use the repository’s run-tmail browser harness for live flows and the AK frontend render checker for 375px, 768px, and 1440px layouts. Inspect light/dark states, mobile navigation, the QR dialog, empty/error states, and each admin tab. Tests use isolated test data; they do not contact production Stalwart.

After building, `npm run test:mailbox-browser` uses the existing local fake-JMAP
harness to check real password and administrator routes, saved/stale sessions,
cross-tab replacement, server/browser restart persistence, controlled fixture-clock
expiry, logout failures, modal keyboard behavior, and English and
Vietnamese in both themes at 1440/768/375/320px. Set `PYTHON` to an interpreter
with the project requirements installed. It reserves port 8099, creates fresh
temporary state, writes screenshots under `plans/reports/mailbox-password-ui-shots/`,
checks login spacing and captures `plans/reports/mailbox-login-ui-shots/`,
and closes its browser and server on exit. The command first injects a rejected
password claim into an in-memory runner copy and verifies failure cleanup:
browser/fixture exit, port release, and temporary-state removal. The CI frontend
job requires both browser commands after the build. `DISCOVERY_SCANNER` optionally selects the
external discovery scanner; it runs against the same isolated app and writes a
JSON report under `plans/reports/`.
