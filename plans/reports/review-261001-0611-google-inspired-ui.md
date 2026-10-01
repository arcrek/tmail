# Google-inspired UI verification

TMail now uses cool surfaces, blue default actions, pill navigation, rounded workspaces, and one display/body font. Admin navigation and account controls share one sidebar. Existing brand customization, mail routes, and message sandbox permissions remain intact.

## Previews

- [Desktop home](google-ui/home-1440.png) and [mobile home](google-ui/home-375.png)
- [Inbox](google-ui/inbox-1440.png) and [admin dashboard](google-ui/admin-1440.png)
- [Dark home](google-ui/dark-home-1440.png) and [dark mobile settings](google-ui/dark-admin-1-375.png)
- [QR sharing](google-ui/qr-375.png), [mobile bulk read](google-ui/bulk-read-375.png), and [Vietnamese mobile](google-ui/vietnamese-375.png)

## Verification

- `cd frontend && npm run test`: 194 tests passed in 22 files.
- `cd frontend && npm run build`: type checking and production build passed.
- `python -m pytest tests/test_api_state.py tests/test_admin_api.py -q`: 60 tests passed using the existing project environment.
- Real Vue/FastAPI test harness with fake JMAP: home, inbox, search, reader, QR keyboard interaction, bulk generation/read, and all six admin tabs passed at 375, 768, 1024, and 1440px. No page overflow, runtime errors, or failing resources in the final check.
- Navigation hover feedback and Vietnamese mobile layout passed.
- AK render checker: zero errors at 375×812, 768×1024, and 1440×900. Three clipped-text warnings identify intentionally hidden `.sr-only` labels; preserving these labels maintains accessibility.
- `git diff --check` passed. The AK simplifier removed one redundant mobile sidebar override.

The initial existing browser driver reported detail-message 404s for its `demo.user` address because its fake detail fixture belongs to `box@example.com`, plus the expected unauthenticated admin-session 401. Final checks used the fixture’s matching address and explicitly permitted only that expected session probe. The initial favicon 404 was fixed by bundling the icon under the existing `/assets` mount.

## Rendered critique

Final score: 22/24. Mood: calm, clear, familiar.

| Item | Score | Evidence |
|---|---|---|
| Brief fidelity | 2 | Blue pills, neutral canvas, and white workspaces in desktop home/admin. |
| Hierarchy | 1 | Home has one primary action; dashboard retains two groups of three equally weighted metrics. |
| Spacing rhythm | 2 | Forms group labels/fields tightly and separate panels consistently. |
| Alignment | 2 | Sidebar and content share a stable grid; form edges align. |
| Typography | 2 | One sans family with size/weight hierarchy; monospace only for technical values. |
| Color discipline | 2 | Blue indicates actions and selection; semantic colors retain separate roles. |
| Depth and shape | 2 | Flat workspace panels, consistent roundness, shadows only for overlays. |
| States and feedback | 2 | Hover, focus, disabled, empty-search, QR open/closed, and theme states verified. |
| Responsiveness | 2 | Four widths passed; mobile tabs scroll locally without page overflow. |
| Slop tells | 2 | No gradients, fabricated metrics, added badges, or new marketing decoration. |
| Content and copy | 2 | Existing localized task labels and real API-backed flows preserved. |
| Craft details | 1 | Bundled favicon, styled uploads, and consistent icons; native color/select controls remain intentionally recognizable. |

The weakest areas were dashboard hierarchy, mobile upload readability, and overlay craft. Restrained tabular metrics and grouped surfaces improve scanning, wrapping/styled file inputs fix clipped upload controls, and the native QR dialog supplies keyboard containment, Escape, and focus restoration.

## Review and limits

No unresolved blocking findings in the scoped review. Custom colors can affect contrast and remain administrator-controlled. Existing saved ember colors stay intact; select `#0b57d0` and `#0842a0` in General settings to adopt the default blue palette. No production database, deployment, or external mail server was changed.

Journal skipped by preference. No unresolved questions.
