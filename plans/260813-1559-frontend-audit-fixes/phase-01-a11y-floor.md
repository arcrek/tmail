# Phase 1: Accessibility floor — skip links + text-size cleanup

## Context Links

- Plan overview: [plan.md](./plan.md)
- Existing focus-visible convention: `frontend/src/styles.css:164-167` (`outline: 3px solid var(--primary); outline-offset: 3px;`)
- Existing type scale: `frontend/src/styles.css:48-53` (`--text-xs: 0.75rem` already exists — the fix is *using* it, not adding a new token)
- i18n pattern: `frontend/src/i18n.ts` — flat `key: value` records per locale, see `'nav.site'`, `'toast.dismiss'` for style

## Overview

- Priority: P0
- Status: Pending
- Two unrelated, independently-shippable fixes bundled in one phase because both are small and touch the same two files (`styles.css`, `i18n.ts`).

## Key Insights

- **Skip link**: the admin shell (`AdminApp.vue`) puts a 6-item tablist between page load and `.admin-content` for every keyboard/AT pass — there is currently no way to jump past it. The public shell (`App.vue`) has a shorter nav (2-3 links + unlock + locale + theme) but the same gap exists in principle and the fix is cheap, so do both for consistency.
- Skip link must be **visually hidden until focused**, not `display: none` (which would remove it from the tab order entirely) and not permanently visible (clutters the header for mouse/touch users). Standard pattern: `position: fixed; top: -3rem` at rest, `top: 1rem` on `:focus-visible`.
- The link's target needs `tabindex="-1"` so focus actually *lands* there (not just scrolls) for AT users — anchor-to-id navigation alone moves visual scroll but not keyboard focus unless the target is focusable.
- Text-size fix: five call sites hardcode `0.70rem`/`0.72rem` (11.2-11.5px), all below the 12px body-text floor. `--text-xs: 0.75rem` (12px) already exists in the token scale and is unused by all five — this is a "use the existing token" fix, not a new-token fix (YAGNI: don't add `--text-2xs`, the value already exists).
- All five are secondary/metadata text (timestamps, counts, hints) — bumping to 12px doesn't change any layout meaningfully (checked: none of the five sit in a fixed-height container that would clip).

## Requirements

1. One skip link in the public shell, jumping to `<main>`.
2. One skip link in the admin shell (post-login view only — the login form has no nav ahead of it, skip link would have nothing useful to skip), jumping to `.admin-content`.
3. Both skip links keyboard-only visible, styled with existing tokens (no new colors).
4. Replace the five hardcoded `0.7rem`/`0.72rem` font-sizes with `var(--text-xs)`.

## Architecture

**`frontend/src/styles.css`** — new rule, placed near the existing `:focus-visible` rule (~line 167) since it's the same "keyboard affordance" concern:

```css
.skip-link {
  position: fixed;
  top: -3rem;
  left: var(--space-4);
  z-index: 2000; /* above .toast-stack (1000, styles.css:1374) and the fixed admin/app header */
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 700;
  font-size: var(--text-sm);
  text-decoration: none;
  transition: top var(--transition);
}

.skip-link:focus-visible {
  top: var(--space-4);
}
```

(`z-index: 2000` becomes the new documented ceiling — `styles.css`'s only other z-index is the toast stack at `1000`; note this in a comment so the next overlay knows the current top value.)

**`frontend/src/App.vue`**:
- Add `<a class="skip-link" href="#main-content">{{ t('a11y.skipToContent') }}</a>` as the very first child of `.app-frame`, before the header `SandboxFrame`.
- Add `id="main-content"` and `tabindex="-1"` to the existing `<main>` (line 224).

**`frontend/src/admin/AdminApp.vue`**:
- Inside the `v-else` branch (post-login, `.admin-shell.three-pane`, line 149), add `<a class="skip-link" href="#admin-main-content">{{ t('a11y.skipToContent') }}</a>` as the first child.
- Add `id="admin-main-content"` and `tabindex="-1"` to `<section class="admin-content">` (line 176). The `role="tabpanel"` div inside already has `tabindex="0"`, so this doesn't create a nested-tabstop conflict — the section becomes the skip target, the tabpanel remains the normal tab-navigation stop.

**`frontend/src/i18n.ts`**: add one key to both locale blocks, near `'nav.site'` (line 8 / line 26):
- `en`: `'a11y.skipToContent': 'Skip to content'`
- `vi`: `'a11y.skipToContent': 'Chuyển tới nội dung chính'`

**`frontend/src/styles.css`** — five call sites, no other change:

| Line | Selector | Change |
|---|---|---|
| 718 | `.toolbar-notice` | `font-size: 0.72rem` → `font-size: var(--text-xs)` |
| 749 | `.list-heading span` | `font-size: 0.72rem` → `font-size: var(--text-xs)` |
| 834 | `.message-row-top time, .message-intro` | `font-size: 0.7rem` → `font-size: var(--text-xs)` |
| 847 | `.attachment-flag` | `font-size: 0.7rem` → `font-size: var(--text-xs)` |
| 875 | `.pagination span` | `font-size: 0.72rem` → `font-size: var(--text-xs)` |

(Line numbers as of this audit; re-locate by selector if the file has shifted.)

## Related Code Files

- Modify: `frontend/src/styles.css` (skip-link rule + 5 font-size edits)
- Modify: `frontend/src/App.vue` (skip link + `#main-content`)
- Modify: `frontend/src/admin/AdminApp.vue` (skip link + `#admin-main-content`)
- Modify: `frontend/src/i18n.ts` (`a11y.skipToContent`, en + vi)

## Implementation Steps

1. Add `a11y.skipToContent` to `i18n.ts` (both locales).
2. Add `.skip-link` / `.skip-link:focus-visible` rules to `styles.css`.
3. Add the skip link + `id`/`tabindex` to `App.vue`.
4. Add the skip link + `id`/`tabindex` to `AdminApp.vue`.
5. Replace the 5 font-size literals with `var(--text-xs)`.
6. Manual check: Tab from a fresh page load in both the public app and the logged-in admin panel — confirm the skip link is the first stop, is invisible until focused, and activating it moves focus (not just scroll) to the target.

## Todo List

- [ ] `a11y.skipToContent` key added (en + vi)
- [ ] `.skip-link` styles added, respects existing `--space-*`/`--radius-sm`/`--primary` tokens
- [ ] Public shell skip link + `#main-content` target wired
- [ ] Admin shell skip link + `#admin-main-content` target wired
- [ ] 5 font-size literals replaced with `var(--text-xs)`
- [ ] Manually tabbed through both shells to verify skip-link focus behavior

## Success Criteria

- First Tab stop on `/` and on `/admin` (post-login) is the skip link; it's visually hidden until it receives focus.
- Activating the skip link moves keyboard focus to the main content region (verify via browser dev tools' accessibility inspector or by continuing Tab and confirming the next stop is inside content, not back in the header/nav).
- No element renders text smaller than `var(--text-xs)` (12px) anywhere in `frontend/src`.
- `vue-tsc --noEmit` and existing test suite (`npm test` in `frontend/`) still pass — no test asserts an exact `font-size` value or DOM child order that this would break; if one does, update the test's expectation, not this fix.

## Risk Assessment

- **z-index collision**: skip link at `2000` is above the toast stack (`1000`) by design — a toast could theoretically render while the skip link is focused-visible (edge case, both are fixed/top-of-viewport but toast defaults to bottom-right per `styles.css:1371-1372`, so no actual overlap).
- **Focus target conflicts in admin**: verified `.admin-content`'s child `[role="tabpanel"]` already has its own `tabindex="0"` — adding `tabindex="-1"` to the parent `<section>` doesn't change the tablist's own roving-tabindex behavior (`AdminApp.vue:37-51`), it only gives the skip link somewhere to land.

## Security Considerations

None — markup/CSS/i18n only, no new data flow.

## Next Steps

- Phase 2 (visual identity) and Phase 3 (unread signal) are independent of this phase and of each other.
