# TMail Design System & UX/AX Guidelines

## Brand Essence
**TMail**: Fast, passwordless disposable email with instant verification code extraction and custom domain routing.

## Art Direction
- **Material 3**: The UI follows Material Design 3: tonal surface layers instead of borders and shadows, pill-shaped buttons, large rounded containers, chips, and segmented buttons. One blue primary color and one teal tertiary color reserved for verification codes.
- **Functional landmarks**: The temporary email address and extracted verification codes are the two primary visual landmarks. Both render in Roboto Mono and must never wrap awkwardly on desktop or mobile.
- **Short copy**: A screen says only what the user needs to act. No explanatory paragraphs where a label, chip, or placeholder is enough. No marketing previews of features the user will discover by using them.
- **Light and dark are equal**: Every screen ships in both schemes from the same tokens. Theme and language controls are visible on every public screen, including the inbox on mobile.
- **AI-native discovery (AX)**: Every page is paired with machine-readable discovery surfaces (clean `robots.txt`, XML sitemaps, Open Graph metadata, semantic pre-rendered shells, and markdown twins with `Vary: Accept`).

Reference mockups (home, inbox desktop/mobile, message reader, admin dashboard; light and dark): https://claude.ai/artifact/NZpBiETUV1hG7sW5oiGFMp

## Design Tokens

Color roles follow the Material 3 scheme (blue seed, custom teal tertiary). Use roles, never raw hex, in components.

| Role | Light | Dark | Use |
|------|-------|------|-----|
| `surface` | `#F9F9FF` | `#111318` | Page background |
| `surface-container-lowest` | `#FFFFFF` | `#0C0E13` | Composer field, reader body well, table rows |
| `surface-container-low` | `#F1F3FA` | `#191C20` | Cards, panes, hero block |
| `surface-container` | `#EDEDF4` | `#1D2024` | Bottom app bar |
| `surface-container-high` | `#E5E7EE` | `#282A2F` | Search bar, domain chip |
| `surface-container-highest` | `#E2E2E9` | `#33353A` | Avatars of read messages |
| `on-surface` | `#1A1B20` | `#E2E2E9` | Primary text |
| `on-surface-variant` | `#44474F` | `#C4C6D0` | Secondary text, icons |
| `outline` | `#74777F` | `#8E9099` | Outlined buttons, segmented button |
| `outline-variant` | `#C4C6D0` | `#44474F` | Chips, dividers |
| `primary` | `#345CA8` | `#ADC6FF` | Filled buttons, links |
| `on-primary` | `#FFFFFF` | `#002E69` | Text on primary |
| `primary-container` | `#D8E2FF` | `#1B4487` | Brand mark, FAB, unread avatar |
| `on-primary-container` | `#001A41` | `#D8E2FF` | |
| `secondary-container` | `#DAE2F9` | `#3E4759` | Active nav pill, selected list item, tonal buttons |
| `on-secondary-container` | `#131C2B` | `#DAE2F9` | |
| `tertiary` | `#006A6A` | `#80D5D4` | "Copy code" button |
| `on-tertiary` | `#FFFFFF` | `#003737` | |
| `tertiary-container` | `#9CF1F0` | `#004F4F` | Verification code surfaces only |
| `on-tertiary-container` | `#002020` | `#9CF1F0` | |
| `error` / `error-container` | `#BA1A1A` / `#FFDAD6` | `#FFB4AB` / `#93000A` | Delete, DNS failure, nav badge |
| warning container | `#FFDDB3` on `#291800` | `#653E00` on `#FFDDB3` | MX mismatch |
| success | `#2E6B30` | `#8FD88A` | Live-refresh dot, healthy status |

Rules:
- `tertiary-container` is reserved for verification codes (latest-code card, code chips in the list, code banner in the reader). Do not reuse it for decoration.
- Status must not rely on hue alone: pair every status color with an icon or a text label.
- Arbitrary email HTML keeps its own colors on a white sheet in both schemes; only the surrounding well follows the theme.

### Typography
- **Sans**: Roboto Flex (fallback Roboto, system-ui) for all UI text.
- **Mono**: Roboto Mono for email addresses, verification codes, domains, and timestamps in tables.
- Scale (M3): display 60/64 weight 500 on the home hero; headline 32 (admin page title) and 24 (message subject, inbox address); title 16–18 weight 500; body 14–16; label 12–14 weight 500.
- Verification codes: mono, weight 500, letter-spacing `0.12em`, grouped in threes (`482 913`) for display; copy the ungrouped value.

### Shape & Spacing
- Corner radii: chips and small badges 8px; list items 20px; cards and panes 28px; home hero block 40px; buttons and search bars fully rounded (height ÷ 2).
- Component heights: buttons 40px (56px for the primary home action), icon buttons 40px desktop / 48px mobile, search bar and composer 56px, nav drawer items 56px, chips 32px.
- Spacing grid of 4px; gaps between panes 12–16px; page gutters 24px desktop, 12–16px mobile.
- Elevation through tonal surfaces. Shadows only on the home composer and the mobile FAB.

## Motion Principles
- Transitions 100–200ms with M3 standard easing for interactions and state toggles.
- Animate only `transform` and `opacity`. Never animate layout dimensions or block user input.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` globally zeroes transitions and animations and restores `scroll-behavior: auto`.

## Breakpoints & Viewports
- **Desktop (1440×900)**: Inbox uses the M3 list-detail layout: message list pane (380–440px) beside the reader pane. The address card and latest-code card share one row above the panes.
- **Tablet (768×1024)**: Panes stack; the list stays visible above the reader.
- **Mobile (390×844, 375×812)**: Single column. Top app bar holds brand, language, theme, and menu. Inbox actions live in a bottom app bar (refresh, QR, password, more) with a FAB for "new address". Reader opens as its own screen with a back arrow. Touch targets at least 48×48px.
- **Reflow (320px)**: No horizontal overflow; the composer wraps the action buttons under the address field; wide tables scroll inside their own container.

## Component Rules
1. **Address landmark**: Always mono with a one-click copy button as the primary (filled) action next to it. Never truncate the domain suffix before the local part.
2. **Home composer**: One rounded field reads `local @ [domain ▾]`, with a shuffle icon button and the filled "Open inbox" button inside it. A segmented button above switches between "New address" and "Existing address". Saved inboxes appear as input chips under the field; a lock icon marks password-protected ones.
3. **Latest code**: A `tertiary-container` card at the top of the inbox shows the newest extracted code with a "Copy code" button, so the user does not need to open the message. Each list row with a code shows it as a chip.
4. **Inbox toolbar**: Copy is the only filled button. Refresh, QR, sound, notifications, and password are icon buttons with `aria-label`; toggled ones use `secondary-container` and `aria-pressed`. "New address" is an outlined button (FAB on mobile). The auto-refresh countdown sits in the address card label.
5. **Language and theme**: The language button shows a globe icon plus the current language (full name on desktop, code such as `VI` on mobile) and opens a menu. It appears in the header of every public screen, including the inbox.
6. **Navigation**: Public site uses pill nav items in the top app bar (active = `secondary-container`). Admin uses an M3 navigation drawer grouped into "Operations" and "Configuration", with an error badge on Domains showing the number of MX failures in the last 24 hours. The drawer carries the brand, theme toggle, "View public site" link, and logout, so the admin hides the public top app bar; below 952px it collapses into a top section with a horizontally scrolling nav. The admin link lives in the public footer, not the main nav.
7. **Admin dashboard**: Headline title with an "Updated at" line and a tonal Refresh button; a row of status chips (mail server, domain sync, MX errors in 24 hours; error chips use `error-container`); two KPI cards (Mail, Domains) with three numbers each; then the recent MX failures table with a "View domains" text button. Show only states the API reports; no placeholder health indicators.
8. **Sandbox boundary**: Arbitrary email HTML always renders inside a sandboxed iframe with nonce'd CSP and postMessage delivery.
9. **Discovery twins**: Every public content page maintains a corresponding `.md` twin and accepts `Accept: text/markdown`.

## Voice & Tone: Do and Don't
- **Do**: Lead with the outcome in a few words ("Email tạm thời, dùng ngay." / "Nhận mã xác minh trong vài giây, không cần đăng ký.").
- **Do**: State the temporary nature and retention of mailboxes where it affects a decision (footer, feature card, password dialog).
- **Do**: Keep labels to one line; prefer a chip, icon label, or placeholder over a helper paragraph.
- **Don't**: Explain what the user will see once they act ("the code appears as soon as mail arrives").
- **Don't**: Use vague marketing slogans or hide disposable-mailbox limitations.
