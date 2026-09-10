# Stage 2 Code-Quality Review — "Ember on Bone" frontend redesign (pending)

Date: 2026-09-10
Scope: uncommitted diff (`frontend/index.html`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/main.ts`, `frontend/src/styles.css`, `frontend/src/theme.ts`, `frontend/src/tests/theme.test.ts`, `src/api_state.py`, `docs/design-guidelines.md`)
LOC: 105 insertions / 72 deletions across 8 tracked files + 131-line new doc
Stage 1 (spec compliance): PASSED — not re-litigated here.

Gates run: `npm run test` 190/190 pass · `npm run build` (incl. `vue-tsc --noEmit`) clean · `.venv/bin/pytest` 280/280 pass. No lint tooling configured in `frontend/package.json`, so no linter signal available.

---

## HIGH

### H1 — `--font-display` (Schibsted Grotesk) has no Vietnamese subset; the shipped `vi` locale will render headings with mid-word font fallback

`frontend/src/styles.css:61`

```css
--font-display: 'Schibsted Grotesk Variable', 'Schibsted Grotesk', -apple-system, sans-serif;
```

Verified against the actual production build (`dist/assets/index-*.css`): Schibsted Grotesk ships exactly two `@font-face` subsets —

- latin: `U+0000-00FF,U+0131,U+0152-0153,…`
- latin-ext: `U+0100-02BA,…,U+1EF2-1EFF,…`

`U+1EA0–U+1EF1` is covered by **neither**. That block holds essentially every precomposed Vietnamese vowel (ạ ả ấ ầ ậ ắ ặ ẹ ẻ ế ề ệ ỉ ị ọ ỏ ố ồ ộ ớ ờ ở ợ ụ ủ ứ ừ ử ữ ự). Libre Franklin (`--font-sans`) *does* ship it — the build emits `libre-franklin-vietnamese-wght-normal-DTJpi3oK.woff2` with `unicode-range: …,U+1EA0-1EF9,…`. Schibsted emits no such file.

`--font-display` is applied to, at minimum:

| selector | file:line | vi string that breaks |
|---|---|---|
| `h1` | `styles.css:213` | `address.title` = "Nhận thư. Giữ địa chỉ của bạn." (`i18n.ts:41`) |
| `h2` | `styles.css:222` | various |
| `.eyebrow` | `styles.css:267` | `address.eyebrow` = "Hộp thư tạm thời" (`i18n.ts:41`) |
| `.primary-button`/`.secondary-button` | `styles.css:309` | `address.open` = "Mở hộp thư" |
| `.text-button` | `styles.css:342` | various |
| `.app-header .brand-name` | `styles.css:474` | `app.defaultName` = "Hộp thư tạm thời" (`i18n.ts:40`) |

**Failure scenario:** a user on `?lang=vi` loads the landing page. The hero `h1` at `clamp(2.6rem, 6vw, 5.8rem)` with `letter-spacing: -0.065em` (`styles.css:214-215`) renders "Nh" + "n thư. Gi" in Schibsted Grotesk and "ậ", "ữ", "ị", "ỉ", "ủ", "ạ" in the OS generic `sans-serif` (Arial/DejaVu/Roboto). Mixed x-height, weight, and side-bearings inside single words, at the largest type size on the page. This is a **regression**: the previous `Inter Variable` package ships a vietnamese subset, so the old build had complete coverage on every element.

Also note `--font-display`'s weights: `.eyebrow` and the buttons use `font-weight: 750` (`styles.css:268`, `styles.css:310`). The fallback generic will synthesize/snap that to 700, compounding the mismatch.

**Options:** (a) use `--font-sans` (Libre Franklin, which has full vi coverage) at a heavier weight for display instead of a second family; (b) pick a display family with a vietnamese subset; (c) explicitly accept and document per-glyph fallback on `vi`, and at minimum add a vi-covering fallback ahead of the generic.

---

### H2 — `--ember` aliases the admin-overridable brand color into semantic *warning* slots, collapsing two status states into one

`frontend/src/styles.css:33-35, 88-90, 119-121, 2063-2066, 2295-2298`

```css
--ember: var(--primary);            /* :root, [data-theme='dark'], @media block */
…
.badge-amber { background: color-mix(in srgb, var(--ember) 15%, transparent); color: var(--ember); }
.counter-warn { color: var(--ember); font-weight: 600; }
```

`--primary` derives from `--brand-primary`, which `frontend/src/App.vue:49` writes at runtime from the admin-configured `primaryColor`:

```js
root.style.setProperty('--brand-primary', value.primaryColor)
```

So the color of two *semantic status* affordances is now under site-admin control:

1. **`.badge-amber` vs `.badge-red`** — `frontend/src/admin/DashboardTab.vue:113` uses exactly these two classes to distinguish `mx_mismatch` from every other MX failure kind:
   `:class="failure.kind === 'mx_mismatch' ? 'badge-amber' : 'badge-red'"`.
   Both badges are 0.75rem/600 glyph-free pills (`styles.css:2048-2056`), so **color is the only channel carrying the distinction**. An admin who sets `primary_color` to any red/crimson hue makes `.badge-amber` and `.badge-red` visually identical and the dashboard silently loses the ability to tell "MX points elsewhere" from other failure kinds. Even at the shipped default the separation is thin: `--ember` `#b8501b` vs `--red` `#c13327` are adjacent hues at 12px.
2. **`.counter-warn`** — `frontend/src/admin/ContentTab.vue:97,116,134` turns the char counter this color at `> MAX_CONTENT_LENGTH * 0.9`. With a neutral/blue/grey `primary_color` it reads as ordinary emphasis, not a "you are about to hit the cap" warning.

**Interaction with H3 below (this is the *additional* hazard beyond the documented default-color risk):** `src/api_state.py:68` seeds settings with `INSERT OR IGNORE`, so **every already-deployed site keeps `primary_color = "#3454e0"` (blue)**. On those installs the MX-mismatch badge and the over-90% char counter will render **blue** on the new bone palette — neither amber nor distinguishable from informational text.

**Fix:** give warning its own token (e.g. `--warn` / `--warn-soft`) defined alongside `--green`/`--red` in all three token blocks, and derive `.badge-amber`/`.counter-warn` from it. Keep `--ember` for brand surfaces only.

---

## MEDIUM

### M1 — Dark-mode `--accent` link contrast regressed below WCAG AA (5.01 → 4.28)

`frontend/src/styles.css:12` (`--brand-accent: #8f3e15`), consumed at `styles.css:83`/`114` (`--accent: color-mix(in srgb, var(--brand-accent) 72%, white)`) and `styles.css:334` (`.text-button, .saved-address { color: var(--accent) }`).

Computed dark `--accent` = `color-mix(#8f3e15 72%, white)` ≈ `#ae7456` (rel. luminance 0.2216).

| combination | ratio | AA (4.5 needed, text is 0.8rem/750 → *not* large text) |
|---|---|---|
| new `#ae7456` on `--surface` `#231e17` | **4.28** | FAIL |
| new `#ae7456` on `--canvas` `#1a1611` | 4.65 | pass |
| old `#7d80dc` on old `--surface` `#161923` | 5.01 | pass |

**Failure scenario:** `.text-button` is the "Forget", "Copy", "Retry" style affordance and `.saved-address` is the saved-mailbox list — both live inside `.panel` cards (`--surface`, `styles.css:247-252`), which is the failing background. Dark-theme users on any card-hosted link get sub-AA text. Nudge the dark mix (e.g. `78-80%` white) or lift `--brand-accent`'s lightness.

### M2 — Light-mode tinted status pills/badges are sub-AA; `.pill-success` regressed

`frontend/src/styles.css:2216-2224, 2063-2071`

All follow the pattern `background: color-mix(in srgb, var(--X) 15%, transparent); color: var(--X)` at `font-size: 0.75rem` (12px) — normal text for WCAG, so 4.5 is required.

| rule | line | new ratio | old ratio | verdict |
|---|---|---|---|---|
| `.pill-success` (`--green` `#2f7d4f`) | 2216 | **4.01** | 4.41 | FAIL, **worse than before** |
| `.badge-amber` (`--ember` `#b8501b`) | 2063 | **3.94** | 2.83 | FAIL (improved) |
| `.pill-error` / `.badge-red` (`--red` `#c13327`) | 2221 / 2068 | **4.29** | 3.97 | FAIL (improved) |

(Dark-mode equivalents pass: `.pill-success` dark ≈ 4.84.)

`docs/design-guidelines.md:42-43` documents `--green`/`--red` contrast implicitly against canvas, but the actual shipped usage is text-on-15%-tint, which is what fails. Either darken the light-mode `--green`/`--red` or reduce the tint (e.g. 8-10%) so the background stays nearer `--surface`.

### M3 — `docs/design-guidelines.md` token table contains three hex values that do not match what the CSS computes

The doc is the design authority produced by phase 03; hand-implementing from it yields different colors than the code.

| doc | claim | actual (`styles.css`) |
|---|---|---|
| `docs/design-guidelines.md:40` | `--primary-hover` = `#8f3e15` | `color-mix(in srgb, #b8501b 85%, black)` = **`#9c4417`** (`styles.css:26`). `#8f3e15` is in fact `--brand-accent` (`styles.css:12`) — the doc conflates hover with accent. |
| `docs/design-guidelines.md:41` | `--primary-soft` = `#f3e1d4` | `color-mix(in srgb, #b8501b 10%, white)` = **`#f8ede8`** (`styles.css:27`). The documented value corresponds to a ~20% mix. |
| `docs/design-guidelines.md:14` | dark ember = `#e08347` | dark `--primary` = `color-mix(in srgb, #b8501b 72%, white)` = **`#cc815b`** (`styles.css:80`) |

Contrast claims that I *did* verify as accurate: `--ink` 15.7:1 (measured 15.74), `--muted` 5.5:1 (5.51), dark `--ink` 14.7:1 (14.75), dark `--muted` 6.5:1 (6.53), dark `--green` 6.7:1 (6.72). Only the three hexes above drift. Prefer documenting the derivation (`color-mix(...)`) rather than a hand-computed hex that cannot be kept in sync.

---

## LOW

### L1 — Dead tokens introduced: `--ember-hover` and `--ember-soft` are declared six times and referenced zero times

`frontend/src/styles.css:34-35, 89-90, 120-121`. Grep across `styles.css` and all `.vue`/`.ts` finds consumers only for `--ember` (lines 2064, 2065, 2296). Worse, the dead pair is *internally inconsistent*: `--ember-soft` is `var(--primary-soft)` in light (line 35) but `color-mix(in srgb, var(--primary) 12%, var(--surface))` in dark (lines 90, 121), whereas `--primary-soft` in dark is `5%` (lines 82, 113). Whoever first uses `--ember-soft` will get an unexplained light/dark asymmetry. Delete, or wire up and reconcile.

### L2 — `--ember` is a zero-value alias of `--primary`

`frontend/src/styles.css:33, 88, 119`: `--ember: var(--primary)` in every block. It adds a second name for one value, which is precisely the DRY problem the `--brand-*` indirection comment at `styles.css:9-10` was written to avoid. If H2 is fixed by introducing a real `--warn` token, `--ember` can be dropped entirely.

### L3 — `.badge-amber` no longer renders amber

`frontend/src/styles.css:2063` + `frontend/src/admin/DashboardTab.vue:113`. The class name is now a false statement about the rule body. Rename to `.badge-warn` (which is what `.counter-warn` already implies) when fixing H2.

### L4 — `--font-display` fallback stack drops `system-ui` and `'Segoe UI'`, diverging from `--font-sans`

`frontend/src/styles.css:61-62`:

```css
--font-display: 'Schibsted Grotesk Variable', 'Schibsted Grotesk', -apple-system, sans-serif;
--font-sans:    'Libre Franklin Variable', 'Libre Franklin', -apple-system, 'Segoe UI', sans-serif;
```

The pre-diff `--font-sans` was `'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif` — `system-ui` was dropped from both. `-apple-system` resolves on nothing but Apple platforms, so on Windows the display stack now falls to generic `sans-serif` (Arial) rather than Segoe UI, and on Linux/Android to the generic default. This is the stack that carries every H1 fallback glyph in H1 above.

### L5 — Font payload: a third webfont family with no preload

`frontend/src/main.ts:1-3` now imports three families. Measured from the production build for an English (latin-only) first paint: `schibsted-grotesk-latin` 46.75 kB + `libre-franklin-latin` 29.29 kB + `jetbrains-mono-latin` 40.40 kB = **116.4 kB** of woff2, plus a 39.49 kB CSS (8.01 kB gz) carrying 13 `@font-face` blocks. The display family is entirely additive versus the previous two-family setup.

Mitigating (verified, not assumed): all 13 `@font-face` rules carry `font-display: swap`, so this is FOUT not FOIT, and no font blocks first paint. `frontend/index.html` has no `<link rel="preload">` for the latin subsets, so the swap-in happens after CSS parse + fetch — the hero `h1` will visibly reflow on cold cache. Consider preloading only `schibsted-grotesk-latin` + `libre-franklin-latin`, or collapsing to one family (see H1).

### L6 — `var()` fallbacks that duplicate the token value

`frontend/src/styles.css:2053, 2113, 2128, 2144` (`var(--radius-sm, 6px)`) and `styles.css:2235` (`var(--radius, 8px)`). The tokens are unconditionally defined at `styles.css:39-41`, so the fallbacks are unreachable, and they now encode a *second* copy of the radius scale that will silently drift the next time the scale changes. The diff updated four of them by hand this round, which is the drift cost already being paid. Drop the fallback arg.

### L7 — `color-mix(in srgb, var(--green) 0%, transparent)` is an obfuscated `transparent`

`frontend/src/styles.css:1936-1937` (`@keyframes pulse-ring`). A 0% mix with `transparent` is exactly `transparent`; writing it this way suggests the author intended a variable ramp. Semantics are correct (srgb `color-mix` with `transparent` is premultiplied, so `40%` at line 1930/1935 correctly yields `--green` at alpha 0.4, matching the old `rgba(34,197,94,0.4)`), and interpolation between the two keyframes is smooth. Purely a readability nit — use `transparent` literally.

### L8 — `.saved-address` did not receive `--font-display` while its co-declared sibling `.text-button` did

`frontend/src/styles.css:327-343`. The two share one rule block, then `.text-button` gets a separate one-property rule adding the display font. `.saved-address` is the same visual affordance (underlined 0.8rem/750 inline link). Either intentional and worth a comment, or an oversight.

### L9 — Blank-line separators removed between rules in two places

`frontend/src/styles.css:2215-2216` (`.status-pill` → `.pill-success`) and `styles.css:2292-2295` (`.char-counter` → `.counter-warn`). Every other rule pair in the file is blank-line separated. Cosmetic, but it is unexplained churn inside a token-only diff.

---

## Verified clean (checked, no finding)

These were explicitly on the checklist and came back negative — recording so they are not re-checked:

- **Dark-block sync.** The `[data-theme='dark']` block (`styles.css:69-91`) and the `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` block (`styles.css:101-122`) are **byte-identical** after whitespace normalization, including the newly added `--green`, `--red`, `--ember*` lines. Diffed programmatically. No drift.
  - Latent (pre-existing, unchanged): the media block's `:root:not([data-theme='light'])` is specificity `(0,2,0)` and outranks `[data-theme='dark']` `(0,1,0)`. With OS=dark **and** an explicit dark choice, the media block wins. Harmless while the blocks are identical; any future one-sided edit to the `[data-theme='dark']` block would be silently ignored on OS-dark machines. Worth a comment at `styles.css:93-98`.
- **CSP / inlined fonts.** `assetsInlineLimit: 0` is untouched (`frontend/vite.config.ts:32`). Production build emits **0** `url(data:` occurrences in the CSS; all 13 faces are separate `/assets/*.woff2`. The SPA CSP (`src/api_server.py:914-918`) is `default-src 'self'` with no `font-src`, so same-origin woff2 resolves against `default-src` and loads. No regression.
- **theme-color literal sync.** `#f6f4ef` / `#1a1611` match across all three copies: `frontend/index.html:6-7`, `frontend/src/theme.ts:6-7`, `frontend/src/tests/theme.test.ts:80`. (Three copies of one literal is a pre-existing DRY smell, unchanged by this diff.)
- **Markup/logic-free.** Confirmed: no `.vue` file is modified (`git status`). `frontend/src/main.ts` changes only the font import lines; `frontend/src/theme.ts` changes only two hex literals. No behavior change.
- **Backend defaults.** No test in `tests/` references `#3454e0`, `#4a4fce`, `primary_color`, or `accent_color`. `src/api_state.py:66-69` uses `INSERT OR IGNORE`, so existing DBs are untouched — matching the plan's documented accepted risk. The one *additional* code-level hazard beyond that is folded into H2 above.
- **Dead CSS.** `--shadow-1` is still consumed at `styles.css:528` and `styles.css:1821` after the `.panel` removal; not orphaned. No duplicate selectors introduced.
- **No security-relevant change** in this diff. `color-mix()` takes no untrusted input; admin `primary_color`/`accent_color` flow through `src/admin_api.py:146` validation and are set via `CSSStyleDeclaration.setProperty` (`App.vue:49-50`), not string-concatenated into a stylesheet. Unchanged by this diff.
- **Performance.** `color-mix()` resolves at computed-value time and is cached per element; the ~20 new call sites are negligible. No new selector is more expensive than the rules it replaced.

---

## Recommended actions (ordered)

1. **H1** — resolve Vietnamese coverage for `--font-display` before ship. This breaks a first-class shipped locale on the largest type on the page.
2. **H2** — introduce a real `--warn` token; stop routing an admin-controlled value into `.badge-amber` / `.counter-warn`. Note the deployed-site blue-badge consequence.
3. **M1** — lift dark `--accent` above 4.5:1 on `--surface`.
4. **M2** — fix `.pill-success` light contrast (it regressed) and ideally the other two tinted pills.
5. **M3** — correct the three drifting hexes in `docs/design-guidelines.md`, or replace them with the `color-mix()` expressions.
6. **L1/L2/L3** — delete or wire up `--ember-hover`/`--ember-soft`; drop the `--ember` alias and rename `.badge-amber` as part of the H2 fix.
7. L4-L9 at leisure.

## Metrics

- Type coverage: `vue-tsc --noEmit` clean; no `any` introduced (diff touches no types beyond two string literals).
- Tests: 190/190 frontend, 280/280 backend. **No test added or changed covers any of the new tokens** — `theme.test.ts` only tracks the theme-color literal. The palette itself is untested, which is consistent with the repo's existing approach to CSS.
- Linting: no linter configured for `frontend/` (no eslint/stylelint in `package.json`). No signal.

## Unresolved questions

1. Was the loss of Vietnamese coverage in the display font (H1) a considered tradeoff, or did the family selection not check subset coverage against `i18n.ts`'s `vi` locale?
2. Is `.badge-amber`'s reuse of the brand color (H2) intentional "everything warm is ember," or an unnoticed side effect of the `--ember` alias? The answer changes whether the fix is a new token or a design revision.
3. Should already-deployed sites be migrated to the new default brand colors, or is the mixed blue-on-bone rendering (documented as accepted for surfaces) also acceptable for the status badges in H2?
