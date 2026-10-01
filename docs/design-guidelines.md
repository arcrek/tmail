# Frontend Design Guidelines

TMail uses a Google-inspired product interface: cool neutral backgrounds, white rounded workspaces, blue actions, and pill-shaped navigation. It keeps TMail’s identity and existing mail workflows. There are no Google logos or external font services.

## Executable owners

- [Shared tokens and responsive styles](../frontend/src/styles.css) own both public and admin styling.
- [Application header](../frontend/src/components/AppHeader.vue) owns navigation, locale, theme, and unlock controls.
- [Admin shell](../frontend/src/admin/AdminApp.vue) groups settings navigation and account controls in one sidebar beside the content workspace.
- [Default site settings](../src/api_state.py) supply default brand colors. [Site customization](../frontend/src/App.vue) applies administrator colors at runtime.
- [QR dialog](../frontend/src/components/QrCodeModal.vue) uses the native modal dialog for keyboard containment, Escape, and focus restoration.

## Color and branding

| Role | Light | Dark |
|---|---|---|
| Canvas | `#f6f8fc` | `#131314` |
| Workspace surface | `#ffffff` | `#1e1f20` |
| Secondary surface | `#e9eef6` | `#282a2c` |
| Main text | `#1f1f1f` | `#e3e3e3` |
| Secondary text | `#444746` | `#c4c7c5` |
| Divider | `#c4c7c5` | `#444746` |

New installations default to primary `#0b57d0` and accent `#0842a0`. Existing saved settings retain their colors, including the previous ember palette. Change them through General settings to adopt blue on an existing installation. The existing migration of the original paired blue defaults remains in place.

All brand-derived action, selection, and focus colors flow through `--brand-primary` and `--brand-accent`. Dark mode derives lighter brand tones through `color-mix()`. Success, warning, and error colors stay independent of branding. Review contrast when setting custom colors.

## Typography and shape

Libre Franklin is the self-hosted display and body family, including Vietnamese. Use size and weight for hierarchy instead of a second display face. JetBrains Mono remains for addresses, codes, and technical content. Dashboard numbers use the body family with tabular numerals.

Use the radius tokens: 8px for small elements, 12px for fields and inner cards, 24px for workspaces and dialogs, and the pill token for main buttons and navigation. Use the existing spacing scale. Keep static surfaces flat; reserve shadows for floating controls and notifications.

## Layout and interaction

- Home centers the address form and saved inboxes. The main action is opening an inbox.
- Inbox keeps address tools beside the message workspace on larger screens and stacks them at 640px and below. Its rail sticks below the header.
- Admin uses a sidebar and content column, narrows the sidebar at 952px, and switches to horizontally scrollable tabs at 640px. Account controls remain available above mobile content.
- Public navigation becomes a menu at 952px. Active destinations use a tinted pill and `aria-current`.
- Search uses a tinted pill field. Form controls retain visible labels and outlines.
- Keep visible keyboard focus and at least 44px touch targets. Reduced-motion mode disables animation and transitions.
- QR sharing centers its dialog, keeps it within the viewport, and restores focus to the trigger when dismissed. Copy success and error feedback stays inside the dialog so it remains accessible. The shared clipboard fallback places its temporary textarea inside the focused dialog to avoid the inert background.

## Content boundaries

Email HTML and administrator-provided HTML remain sandboxed. Email and QR surfaces stay white in both themes for content fidelity and scanning. Theme changes must not alter sandbox permissions or inline production assets. The default envelope favicon is bundled under `/assets/` so the API static mount serves it; administrator-provided favicons still override it.

## Verification

Run the [frontend commands](../frontend/package.json) for tests and build. Use the repository’s run-tmail browser harness for live flows and the AK frontend render checker for 375px, 768px, and 1440px layouts. Inspect light/dark states, mobile navigation, the QR dialog, empty/error states, and each admin tab. Tests use isolated test data; they do not contact production Stalwart.
