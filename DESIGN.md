# TMail Design System & UX/AX Guidelines

## Brand Essence
**TMail**: Fast, passwordless disposable email with instant verification code extraction and custom domain routing.

## Art Direction
- **Modern, Professional & Trustworthy**: A restrained functional grid, calm neutral surfaces (`#f6f8fc` light, `#131314` dark), high-contrast readability, and one clear brand accent (`#1a73e8` blue).
- **Functional Landmarks**: The temporary email address (rendered in JetBrains Mono) and extracted verification codes (`4471`) are the two primary visual landmarks. They must never break or wrap awkwardly across standard desktop and mobile viewports.
- **Knowledgeable Voice & Storytelling**: Plain, outcome-first headlines ("Receive mail. Keep your address."), concrete mechanisms, explicit message retention disclosures, and accessible REST API documentation.
- **AI-Native Discovery (AX)**: Every page is paired with machine-readable discovery surfaces (clean `robots.txt`, XML sitemaps, Open Graph metadata, semantic pre-rendered shells, and markdown twins with `Vary: Accept`).

## Design Tokens

### Color System
- **Light Theme**:
  - Background Surface: `oklch(97.5% 0.006 75)` / `#f6f8fc`
  - Card Surface: `#ffffff`
  - Ink (Primary Text): `oklch(18% 0.012 50)` / `#1f1f1f`
  - Muted Text: `#5f6368`
  - Line / Border: `#dadce0`
  - Brand Primary / Accent: `#1a73e8`
  - Primary Soft: `rgba(26, 115, 232, 0.08)`
  - Verification Code Box: `rgba(26, 115, 232, 0.06)` border `#1a73e8`
- **Dark Theme**:
  - Background Surface: `#131314`
  - Card Surface: `#1e1f20`
  - Ink (Primary Text): `#e3e3e3`
  - Muted Text: `#9aa0a6`
  - Line / Border: `#3c4043`
  - Brand Primary / Accent: `#8ab4f8`

### Typography Scale
- **Display**: Schibsted Grotesk / Libre Franklin (Headings)
- **Body**: Libre Franklin (`font-size: 1rem; line-height: 1.5`)
- **Mono**: JetBrains Mono (`--font-mono` for email addresses, verification codes, tokens, timestamps)
- **Address Rail Scale**: `clamp(0.95rem, 1.1vw, 1.12rem)` — tuned so standard 20–26 character addresses remain unbroken on one line in the 18.5rem sidebar rail.

### Spacing & Elevation
- Spacing: `--space-1` (0.25rem) to `--space-6` (1.5rem)
- Radii: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (16px), `--radius-pill` (9999px)
- Shadows: Subtle layered ambient shadows (`0 1px 3px rgba(0,0,0,0.06)`)

## Motion Principles
- Transitions: 100ms–200ms ease-out (`var(--transition): 0.15s ease`) for UI interactions and state toggles.
- Animate only `transform` and `opacity`. Never animate layout dimensions or block user input.
- **Reduced Motion**: Mandatory `@media (prefers-reduced-motion: reduce)` globally zeroes transitions, animations, and restores `scroll-behavior: auto`.

## Breakpoints & Viewports
- **Desktop (1440×900)**: 2-column inbox layout (`minmax(16rem, 18.5rem)` rail + flexible message stream). Unbroken address display.
- **Tablet (768×1024)**: Compact 2-column layout or stacked administration console; top navigation collapses into accessible hamburger menu.
- **Mobile (375×812)**: Single-column stack. Touch targets at least 44×44px. Card header titles and random generation actions decoupled to avoid awkward 2-line wraps.
- **Reflow (320px width)**: Reflow without horizontal overflow. Single-row compact header; skip link remains off-screen until focused.

## Component Rules
1. **Address Landmark**: Always monospace with prominent one-click copy button. Never truncate or wrap critical domain suffix.
2. **Verification Code Banner**: Top of message reader with high-contrast copy button for instant OTP retrieval.
3. **Sandbox Boundary**: Arbitrary email HTML must always render inside a sandboxed iframe with nonce'd CSP and postMessage delivery.
4. **Discovery Twins**: Every public content page must maintain a corresponding `.md` twin and accept `Accept: text/markdown`.

## Voice & Tone: Do and Don't
- **Do**: State outcomes directly ("Receive mail. Keep your address.").
- **Do**: Clearly state the temporary nature and retention period of mailboxes.
- **Don't**: Use clever, vague marketing slogans ("The future of email communication").
- **Don't**: Hide disposable mailbox limitations or create false expectations of permanent storage.
