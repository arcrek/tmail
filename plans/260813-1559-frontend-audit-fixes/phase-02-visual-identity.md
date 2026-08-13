# Phase 2: Visual identity — brand default + address-preview hero

## Context Links

- Plan overview: [plan.md](./plan.md) — see "Correction vs. the published audit artifact" for why the hex values here differ from the artifact.
- Brand token indirection: `frontend/src/styles.css:9-13` (light) and `:64-82`/`:90-109` (dark, explicit + OS-preference duplicate blocks)
- Backend default: `src/api_state.py:9-30` (`DEFAULT_SETTINGS`)
- Site color override flow: `frontend/src/App.vue:45-68` (`applySite()` sets `--brand-primary`/`--brand-accent` from the API response), `frontend/src/admin/GeneralTab.vue:93-94` (admin color pickers)
- Address preview: `frontend/src/components/AddressPanel.vue:162-168` (template), `frontend/src/styles.css:528-541` (`.address-preview`)

## Overview

- Priority: P1
- Status: Pending
- Two changes, both cosmetic/token-level, no logic changes: (A) replace the out-of-box brand color pair, verified against every token it derives into; (B) give the generated address the visual weight the product's own core interaction deserves.

## Part A — Brand default

### Why this needs two files, not one

`--brand-primary`/`--brand-accent` in `styles.css` is the pre-hydration fallback (what paints before `App.vue`'s `applySite()` runs, `styles.css:9-13`). The *actual* default a fresh, un-customized install serves via `/site` — which is what everyone sees unless an admin opens **General → Branding** — comes from `src/api_state.py:13-14`. Both currently hold the identical value (`#4f46e5`/`#4338ca`, Tailwind's unmodified `indigo-600`/`indigo-700`). Changing only the CSS fallback would fix the one-frame flash before the API responds and do nothing else; changing only the backend default would leave a visible color flash on every cold load. Both must change to the same new pair.

### Verified replacement values

The audit artifact proposed `#3f3ad6`/`#2b2894`. Re-checked with the project's actual `color-mix()` formulas (`styles.css:74-78`, `:100-104`) before writing this plan — that pair fails two dark-mode pairs (accent-as-text on dark surface drops to 3.37:1, under the 4.5:1 AA line). Replaced with a pair that passes every derived token in both themes:

**`--brand-primary: #3454e0`** (was `#4f46e5`) &nbsp;&nbsp; **`--brand-accent: #4a4fce`** (was `#4338ca`)

| Pair | Light | Dark |
|---|---|---|
| primary text on white / canvas | 6.02:1 / 5.62:1 | — |
| white on primary (button bg) | 6.02:1 | primary-dark text on surface: 5.12:1 |
| accent text/link on white | 6.36:1 | accent-dark text on surface: 5.00:1 |
| white on accent (button hover bg) | 6.36:1 | on-primary on accent-dark: 5.43:1 |
| white on primary-hover (secondary hover) | 7.63:1 | on-primary on primary-hover-dark: 6.98:1 |
| ink on primary-soft (selected row bg) | 15.94:1 | — |

All ≥ 4.5:1 (AA). As a side effect this also fixes a pre-existing marginal fail in the *current* shipped colors: dark-mode `--accent`-as-text was at 4.27:1 (under AA) before this change; it's 5.00:1 after.

If this exact pair doesn't read right once seen live, any replacement must be re-verified with the same method (compute `color-mix()` by hand or with a script — don't eyeball dark-mode derived tints) before shipping; the failure mode is invisible until an actual dark-mode user with a saturated accent color can't read it.

### Changes

**`frontend/src/styles.css:11-12`**
```diff
-  --brand-primary: #4f46e5;
-  --brand-accent: #4338ca;
+  --brand-primary: #3454e0;
+  --brand-accent: #4a4fce;
```

**`src/api_state.py:13-14`**
```diff
-    "primary_color": "#4f46e5",
-    "accent_color": "#4338ca",
+    "primary_color": "#3454e0",
+    "accent_color": "#4a4fce",
```

No other file references these hex values (verified via repo-wide grep) — existing self-hosted instances that already saved a custom color in their DB are untouched (this only changes the *default* new installs start from; `GeneralTab.vue`'s color pickers keep working exactly as before).

## Part B — Address-preview hero treatment

### Why

The product does exactly one thing: hand someone a disposable address. The inbox screen already treats that address as a hero (`.inbox-address`, `styles.css:693-702`: `clamp(1.25rem, 2vw, 1.75rem)`, mono, bold). The *creation* screen — the first time anyone sees their address — renders the identical string at `0.82rem` in `var(--muted)`, styled like a form hint (`.address-preview`, `styles.css:528-541`). The moment the product exists to deliver is currently its smallest, lowest-contrast text.

### Constraint

`.address-preview` is a `flex` row sharing space with the copy button (`styles.css:528-535`: `justify-content: space-between`). A full inbox-hero-sized address (up to `1.75rem`) risks colliding with or wrapping awkwardly against the button on narrow viewports. Scale up meaningfully but stay inside the row's real estate; let the row wrap if it must, rather than shrinking to fit.

### Changes

**`frontend/src/styles.css:528-541`** — add `flex-wrap: wrap` to the existing rule, and a new modifier for the filled state:

```diff
 .address-preview {
   display: flex;
+  flex-wrap: wrap;
   min-height: 46px;
   align-items: center;
   justify-content: space-between;
   gap: 1rem;
   margin: 1rem 0 0;
   padding: 0.65rem 0;
   border-bottom: 1px solid var(--line);
   color: var(--muted);
   font-family: var(--font-mono);
   font-size: 0.82rem;
   overflow-wrap: anywhere;
 }
+
+.address-preview-value {
+  color: var(--ink);
+  font-size: clamp(1.05rem, 2.6vw, 1.5rem);
+  font-weight: 700;
+}
```

(The base `.address-preview` rule keeps `color: var(--muted)` / `font-size: 0.82rem` as the *placeholder* state — `t('address.preview')`, shown before the visitor has typed anything. `.address-preview-value` overrides both, applied only once there's a real address.)

**`frontend/src/components/AddressPanel.vue:162-168`** — bind the new class to the existing `address` computed:

```diff
   <div class="address-preview">
-    <span>{{ address || t('address.preview') }}</span>
+    <span :class="{ 'address-preview-value': address }">{{ address || t('address.preview') }}</span>
     <button class="text-button" type="button" :disabled="!address" @click="copyAddress">
```

No script changes — `address` is already a computed in this component (`AddressPanel.vue:25-29`).

## Related Code Files

- Modify: `frontend/src/styles.css` (brand tokens + `.address-preview`/`.address-preview-value`)
- Modify: `src/api_state.py` (`DEFAULT_SETTINGS` brand colors)
- Modify: `frontend/src/components/AddressPanel.vue` (one class binding)

## Implementation Steps

1. Update `--brand-primary`/`--brand-accent` in `styles.css`.
2. Update `primary_color`/`accent_color` in `src/api_state.py`.
3. Add `.address-preview-value` and `flex-wrap: wrap` to `styles.css`.
4. Bind the class in `AddressPanel.vue`.
5. Manual check in dev server: address-creation screen in both themes, at 375px and 1024px+, with a long local-part (near the 64-char max) to confirm wrapping doesn't collide with the copy button.

## Todo List

- [ ] Brand hex pair updated in both `styles.css` and `api_state.py` (same values, both files)
- [ ] `.address-preview-value` + `flex-wrap` added
- [ ] Class bound in `AddressPanel.vue`
- [ ] Verified in light + dark, 375px + desktop, short and near-max-length local-part

## Success Criteria

- Fresh install (no admin color customization) serves `#3454e0`/`#4a4fce` from `/site`, matching the CSS fallback exactly — no color flash on cold load.
- Every derived token pair listed in the table above still meets 4.5:1 in both themes (re-run the check if the values are tuned further).
- The address preview reads as the visual anchor of the address-creation panel — noticeably larger/higher-contrast than the surrounding label text — without breaking the row at 375px with a 64-character local-part.
- Existing `tests/test_admin_api.py:215` (`{"primaryColor": "red"}`) is a custom-override test, unaffected by the default value change — confirm it still passes.
- `npm test` in `frontend/` still passes (no test asserts the literal `0.82rem`/`var(--muted)` styling on `.address-preview`).

## Risk Assessment

- **Self-hosted instances that never customized colors** will see their color scheme change on next deploy (this is the intended effect of changing a *default*, not a bug — flag it in the release notes/changelog if this project keeps one).
- **Contrast regression risk**: mitigated by computing every derived pair before choosing the hex values (see table above) rather than picking by eye.

## Security Considerations

None.

## Next Steps

- Independent of Phase 1 and Phase 3.
