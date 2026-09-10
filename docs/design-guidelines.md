# TMail Frontend Design Guidelines: Ember on Bone

This document defines the visual design system, token contracts, and typographic hierarchy for the TMail frontend (public application and administrative console).

Design Rationale Record: `plans/reports/brainstorm-260910-1753-frontend-redesign.html`

---

## 1. Aesthetic Thesis

TMail employs the **"Ember on Bone"** visual direction — an editorial-minimal design system engineered for high legibility, low visual noise, and utilitarian elegance.

- **Canvas & Ink:** High-contrast, warm monochrome foundation. Warm near-black ink on a low-chroma bone canvas avoids the clinical harshness of pure black-on-white while retaining strict contrast.
- **Single Accent:** A single warm ember tone (`#b8501b` light / `#cc815b` dark), strictly restrained to $\le 10\%$ of visible surface area, acts as the primary navigational beacon and eye-director.
- **Hairline Geometry:** Elevation and spatial separation are achieved through hairline borders (`1px solid var(--line)`) rather than heavy multi-layer box shadows.
- **Typographic Duality:** Sharp Scandinavian display grotesk for structural headings and actions paired with a humanist grotesque for dense body readability, grounded by a clean technical monospace for functional addresses and codes.

---

## 2. Color System & Tokens

### Two-Variable Brand Indirection
All brand-derived colors flow through two foundational variables:
- `--brand-primary`: Default `#b8501b` (Light)
- `--brand-accent`: Default `#8f3e15` (Light)

When a site administrator customizes `primaryColor` or `accentColor` via the admin console (`AdminApp.vue` / `GeneralTab.vue`), these two root CSS properties are modified at runtime. All button fills, focus rings, active rail states, and soft tints derive from them automatically via CSS `color-mix()`.

### Light Palette (Bone & Warm Ink)

| Token | Hex | OKLCH Equivalent | Role |
|---|---|---|---|
| `--canvas` | `#f6f4ef` | `oklch(97.5% 0.006 75)` | Root page background |
| `--surface` | `#fcfbf9` | `oklch(98.8% 0.003 75)` | Primary card and panel surface |
| `--surface-2` | `#edeae3` | `oklch(93.5% 0.008 75)` | Secondary surface, input backgrounds, table headers |
| `--ink` | `#1e1a15` | `oklch(18.0% 0.012 50)` | Primary headings and body copy (15.7:1 contrast on canvas) |
| `--muted` | `#6b6156` | `oklch(46.0% 0.020 60)` | Secondary labels, timestamps, metadata (5.5:1 contrast on canvas) |
| `--line` | `#dad5cb` | `oklch(87.0% 0.010 75)` | Hairline borders and dividers |
| `--primary` | `#b8501b` | `oklch(56.0% 0.150 45)` | Ember brand accent, primary CTA fill, active borders |
| `--primary-hover` | `#9c4417` (`color-mix(--brand-primary 85%, black)`) | — | Darker same-hue shade for interactive hover |
| `--primary-soft` | `#f8eee8` (`color-mix(--brand-primary 10%, white)`) | — | Low-opacity ember tint for selection, unread rows, alerts |
| `--green` | `#2f7d4f` | `oklch(53.0% 0.110 145)` | Success state, healthy API indicator |
| `--red` | `#c13327` | `oklch(52.0% 0.180 25)` | Error state, delete confirmations (distinct crimson hue 25) |
| `--amber` | `#b45309` | — | Fixed warning hue (mx-mismatch badges, char-limit counters) — deliberately **not** derived from `--brand-primary`, so it stays distinct from `--red` and unaffected by admin brand-color overrides |

### Dark Palette (Espresso & Luminous Ember)

| Token | Hex / Formula | Role |
|---|---|---|
| `--canvas` | `#1a1611` | Root page background (warm dark brown) |
| `--surface` | `#231e17` | Card and panel surface |
| `--surface-2` | `#2d2620` | Secondary surface and elevated controls |
| `--ink` | `#ede8df` | Primary headings and text (14.7:1 contrast on canvas) |
| `--muted` | `#a79a88` | Secondary labels and metadata (6.5:1 contrast on canvas) |
| `--line` | `#3a3126` | Hairline borders and card boundaries |
| `--primary` | `color-mix(in srgb, var(--brand-primary) 72%, white)` | Luminous ember accent (5.88:1 contrast on canvas) |
| `--primary-hover` | `color-mix(in srgb, var(--brand-primary) 60%, white)` | Hover state |
| `--primary-soft` | `color-mix(in srgb, var(--primary) 5%, var(--surface))` | Soft background tint for unread items and badges |
| `--on-primary` | `#1a1611` | Text color on primary filled buttons in dark theme |
| `--green` | `#5fae7f` | Luminous green for success badges (6.7:1 contrast) |
| `--red` | `#e85d46` | Luminous crimson for error badges (5.2:1 contrast) |
| `--amber` | `#e8a33d` | Fixed warning hue, dark-theme luminous counterpart to the light `--amber` |

---

## 3. Typography Hierarchy

Fonts are self-hosted via `@fontsource-variable/*` packages and bundled into static production assets with zero external CDN dependencies.

### Font Families
```css
--font-display: 'Schibsted Grotesk Variable', 'Schibsted Grotesk', 'Libre Franklin Variable', -apple-system, sans-serif;
--font-sans: 'Libre Franklin Variable', 'Libre Franklin', -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Consolas, monospace;
```

Schibsted Grotesk ships no Vietnamese glyphs. `html[lang="vi"]` overrides `--font-display` to Libre Franklin alone (full vi coverage) instead of relying on the fallback above, since font-matching is per-glyph and a trailing fallback can't stop a heading from mixing faces mid-word.

### Typographic Mapping
- **Display Grotesk (`--font-display`):** Applied to `h1`, `h2`, `.eyebrow`, `.app-header .brand-name`, `.primary-button`, `.secondary-button`, `.text-button`. Features tight tracking (`-0.02em` to `-0.065em`) and deliberate editorial weight (600 to 750).
- **Body Sans (`--font-sans`):** Default root font family. Used for form labels, descriptions, instructions, helper notes, and table content.
- **Technical Monospace (`--font-mono`):** Functional data only — generated mailbox addresses (`demo.user@example.com`), authentication/verification codes, timestamps, and DNS records.

---

## 4. Radius & Shape Scale

The radius scale enforces crisp, modern geometry across all components:

- `--radius-sm: 6px`: Badges, status pills, inner icon buttons, color preview swatches, thumbnail previews.
- `--radius: 8px`: Form inputs (`input`, `select`, `textarea`), standard buttons, list items, metric cards.
- `--radius-lg: 10px`: Outer panel wrappers (`.panel`), modals (`.qr-modal`), dropdown menus.

---

## 5. Depth & Surface Strategy

### Hairline-First Panels
- Standard container panels (`.panel`, `.settings-card`) use **hairline borders with zero box-shadow**:
  ```css
  .panel {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  ```
- No drop shadows on static dashboard metrics, form cards, or address list rows.

### Reserved Floating Shadows
Drop shadows (`--shadow-1` or explicit float shadows) are strictly limited to elevated interactive layers:
- Floating modals: `.qr-modal` (`box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15)`)
- System notifications: `.toast` (`box-shadow: var(--shadow-1)`)
- Header unlock flyout: `.header-unlock .field` (`box-shadow: var(--shadow-1)`)
- Mobile drawer navigation: `.app-header-nav.mobile-open` (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)`)

---

## 6. Accessibility & Compliance

- **Contrast Ratios:** Every text and background pair meets or exceeds WCAG AA requirements ($\ge 4.5:1$):
  - Ink on Canvas: $15.7:1$ (Light), $14.7:1$ (Dark)
  - Muted on Canvas: $5.5:1$ (Light), $6.5:1$ (Dark)
  - White on Ember Primary: $5.0:1$ (Light)
  - Dark Ink on Ember Primary: $5.88:1$ (Dark)
- **Focus Rings:** Visible `:focus-visible` rings are retained at `3px solid var(--primary)`.
- **Target Sizes:** Interactive controls maintain a minimum touch target height of $44\text{px}$ (`min-height: 44px` on buttons, inputs, and nav links).

---

## 7. Intentional Design Exceptions

- **Message Content Sandbox (`.sandbox-frame`):**
  Arbitrary email HTML and site content rendered inside the sandboxed iframe intentionally retains `background: #fff` across both light and dark themes. Email authors format content expecting a white paper canvas; inverting or darkening raw email HTML breaks external branding and third-party layout formatting.
- **QR Code Wrapper (`.qr-code-wrapper`):**
  Retains `background: #fff` in both themes to ensure sufficient optical contrast when scanned by mobile device camera sensors.
