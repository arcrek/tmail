---
title: "Ember on Bone: redesign ships, review catches a DB migration gap and a font-fallback lie"
date: 2026-09-10
summary: "Warm ink/bone token redesign across public site and admin console; pre-ship review caught a silent state.db migration gap and a Vietnamese font-fallback bug, plus a tint fix that verification shows did not actually land"
---

# Ember on Bone: redesign ships, review catches a DB migration gap and a font-fallback lie

# Ember on Bone: redesign ships, review catches a DB migration gap, a contrast regression, and a font-fallback lie

**Date**: 2026-09-10 19:54
**Severity**: Medium
**Component**: Frontend (`frontend/src/styles.css`, `frontend/src/main.ts`, `frontend/index.html`, `frontend/src/theme.ts`) + `src/api_state.py`
**Status**: Resolved (PR #30 open against `main`), with one open concern noted below

## What Happened

Shipped the "Ember on Bone" frontend redesign on `feature/frontend-redesign-ember-on-bone` (PR #30): a token-layer reskin of the whole TMail frontend — public address/hero/inbox/message-reader and the entire admin console — from the old blue/Inter look to a warm near-black ink on a low-chroma bone canvas with a single ember accent, Schibsted Grotesk (display) + Libre Franklin (body) + JetBrains Mono (kept). Per the accepted brief (`plans/260910-1810-frontend-redesign-ember-on-bone/plan.md`), this was deliberately scoped as token-only: no `.vue` markup or logic touched, no button/nav item removed or added, `--brand-primary`/`--brand-accent` admin-override indirection left intact. Three phases (foundation tokens, semantic color/shape audit, visual QA + a11y + docs) executed sequentially against the single shared `styles.css`, landed as one commit (`800615e`).

Before commit, a stage-2 code-quality review (`plans/reports/review-260910-1914-ember-on-bone-stage2.md`) ran against the full uncommitted diff and came back with 2 HIGH, 3 MEDIUM, 9 LOW findings. Three of them got real fixes, each one a case where the "obvious" thing to do (silently patch the CSS/code and move on) was correctly *not* done — the finding, the trade-off, and the fix were written down and a call was made instead of quietly overriding scope.

## The Brutal Truth

The good news: three real ship-blockers got caught before they hit `main`, not after a support ticket. The review process worked exactly as designed — it ran the actual build/test gates and diffed the dark-theme token block against the light one byte-for-byte instead of eyeballing it.

The uncomfortable part, found while writing this entry: verifying the *shipped* commit against the review's own recommendation shows the third fix — restoring `.badge-amber`'s tint to 15% — did not make it into `800615e`. `frontend/src/styles.css:2071` currently reads `color-mix(in srgb, var(--amber) 4%, transparent)`, while its siblings `.badge-red`, `.pill-success`, `.pill-error` are correctly at 15% (lines 2023, 2076, 2224, 2229). The review report itself never mentions "4%" at all — that catch and the decision to fix it apparently happened in a later, unrecorded pass, and whatever edit made the fix seems to have been made against a state that got overwritten (most likely during the H2 rework that split `--ember` into a dedicated `--amber` token — see below). Documenting a decision is only half the job; the diff that actually lands has to be checked against the decision, not just the changelog of what was *supposed* to happen. This journal entry is that check, hours after the fact.

## Technical Details

### Fix 1 — state.db never upgrades existing brand-color rows (`src/api_state.py`)

`StateStore` seeds `DEFAULT_SETTINGS` with `INSERT OR IGNORE`, so any row already in `state.db` is permanently untouched by a change to the default value — that's correct behavior for admin-customized settings, but it also means every already-deployed site would have kept `primary_color = "#3454e0"` / `accent_color = "#4a4fce"` (the old blue) forever, rendering blue on the new bone canvas indefinitely. Worse, the review's H2 finding noted this collides with semantics: `.badge-amber`/`.counter-warn` at the time derived from `--ember` (= `--primary` = admin's `primary_color`), so a stale-blue install would render its MX-mismatch warning badge and its "near the character limit" counter in blue — visually identical to informational text, silently losing the warning signal.

Fix, added as `StateStore._migrate_legacy_brand_colors()`:

```python
_LEGACY_BRAND_COLORS = {
    "primary_color": "#3454e0",
    "accent_color": "#4a4fce",
}
...
def _migrate_legacy_brand_colors(self, conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT key, value FROM settings WHERE key IN ('primary_color', 'accent_color')"
    ).fetchall()
    current = {row["key"]: json.loads(row["value"]) for row in rows}
    if current == _LEGACY_BRAND_COLORS:
        conn.executemany(
            "UPDATE settings SET value = ? WHERE key = ?",
            ((json.dumps(DEFAULT_SETTINGS[key]), key) for key in _LEGACY_BRAND_COLORS),
        )
```

Runs once per startup, only upgrades a database sitting on **both** legacy values simultaneously — an admin who customized only one color (e.g. kept the old blue primary but picked their own accent) is left alone, because `current == _LEGACY_BRAND_COLORS` requires an exact match on both keys. This is a user decision, not a silent default-value bump: overriding an admin's own color choice, even one that happens to coincide with an old default, was explicitly rejected as a failure mode.

Separately, H2 also got its own fix (not itemized by the user's ask but load-bearing for fix 1's rationale): `--ember` as an alias of the admin-controllable `--primary` was replaced with a fixed, non-overridable `--amber: #b45309` token, with the reasoning written directly into the CSS at `styles.css:23-25`:

```css
/* Fixed warning hue for semantic indicators (.badge-amber, .counter-warn). Deliberately NOT
   derived from --brand-primary/--primary: those track the admin's live brand-color override,
   so a reddish admin color would otherwise make a warning badge indistinguishable from --red. */
--amber: #b45309;
```

### Fix 2 — status-pill/badge tint: decided at 15%, `.badge-amber` shipped at 4%

Phase-02's spec (`plans/260910-1810-frontend-redesign-ember-on-bone/phase-02-semantic-color-and-shape-audit.md:48-49`) is explicit: soft/tinted backgrounds use a 15% mix so dark theme's brighter token values still read clearly. The review's own diff excerpt shows `.badge-amber` *was* at 15% pre-fix, and the decision recorded was to keep every status affordance at that same 15% (the review's M2 finding independently flagged that under-tinted pills are borderline-invisible against `--surface` in dark mode).

**Verification note (found while writing this entry, not before):** `.badge-red`, `.pill-success`, and `.pill-error` are correctly at 15% in the shipped commit. `.badge-amber` is not — line 2071 is `color-mix(in srgb, var(--amber) 4%, transparent)`. `.counter-warn` doesn't use a tinted background at all (solid `color: var(--amber)`), so it's unaffected. The most likely explanation is that the 4→15% fix landed against the `--ember`-based rule, and the *separate* H2 rework (swapping `--ember` for `--amber`, described above) re-copied the rule from an earlier, pre-fix version of the file rather than the corrected one — two fixes touching the same three lines, one edit clobbering the other, and the test gates have no visibility into a CSS percentage, so nothing caught it. This is now the actual open item — see Next Steps.

### Fix 3 — `--font-display`'s Libre Franklin "fallback" claim was false for Vietnamese

The original comment on `--font-display` claimed the fallback chain handled non-Latin text. It doesn't, because CSS font fallback resolves **per glyph, not per word or per string** — a browser substitutes fonts character-by-character based on which `@font-face`'s `unicode-range` covers that codepoint, not by picking one font for the whole run. Schibsted Grotesk's actual shipped subsets (verified against the production `dist/assets/*.css`, per the review) are `latin` (`U+0000-00FF,U+0131,U+0152-0153,…`) and `latin-ext` (`U+0100-02BA,…`) — neither covers `U+1EA0–U+1EF1`, the block holding nearly every precomposed Vietnamese vowel (ạ ả ấ ầ ậ ắ ặ ẹ ẻ ế ...). Libre Franklin does ship that range. Result: any Vietnamese heading (`address.title` = "Nhận thư. Giữ địa chỉ của bạn.", `h1` at `clamp(2.6rem, 6vw, 5.8rem)`) would render with some glyphs in Schibsted Grotesk and others silently falling through to the OS generic `sans-serif`, mid-word, at the largest type size on the page — and it would regress a previously-working locale, since the old `Inter Variable` package had full Vietnamese coverage.

Fix: scope `--font-display` per-locale instead of relying on the fallback chain to save it.

```css
--font-display: 'Schibsted Grotesk Variable', 'Schibsted Grotesk', 'Libre Franklin Variable', -apple-system, sans-serif;
...
html[lang='vi'] {
  --font-display: 'Libre Franklin Variable', 'Libre Franklin', -apple-system, 'Segoe UI', sans-serif;
}
```

`html[lang="vi"]` fully repoints the display token to the family that actually has Vietnamese coverage, rather than trying to patch the fallback stack (which can't fix a per-glyph problem across a font boundary — Schibsted Grotesk would still win for every glyph it *does* cover, producing exactly the same mixed-font-mid-word result at a smaller blast radius). This is a decision to accept "no Schibsted Grotesk on Vietnamese headings at all" over "Schibsted Grotesk sometimes, unpredictably, per letter."

## What We Tried

- For the font issue, the review listed three options: (a) use `--font-sans`/Libre Franklin at heavier weight instead of a second display family everywhere, (b) pick a different display family with vi coverage, (c) accept and document per-glyph fallback. The chosen fix is closest to (b) but scoped rather than global — Schibsted Grotesk stays for every other locale, Libre Franklin takes over only under `html[lang='vi']`. Rejected (a) because it would have de-differentiated headings from body text on every locale to fix a problem specific to one; rejected (c) because "accept it" was the exact state that was already shipping and already broken.
- For the color routing, rejected leaving `.badge-amber`/`.counter-warn` on `--ember` (= admin's live `primary_color`) because it's a real, demonstrated failure mode: an admin picking any red/crimson `primary_color` makes the MX-mismatch amber badge and the red failure badge the same color, and color is the *only* channel distinguishing them (both are glyph-free 0.75rem/600 pills).
- For the DB migration, rejected an unconditional `UPDATE` on ship (would silently overwrite any admin's real brand-color customization) and rejected doing nothing (would leave every existing deployment on stale blue forever, compounding the H2 badge-collision bug above). The conditional both-values-match check was the middle path.

## Root Cause Analysis

- The migration gap exists because `INSERT OR IGNORE` is the right primitive for "don't clobber admin settings" and the wrong primitive for "ship a new default," and nobody had needed both behaviors from the same seeding call before this redesign changed a default that users are expected to *see*, not just read.
- The font bug's root cause is a false assumption baked into a comment: "the fallback chain handles it" was never verified against the actual shipped `@font-face` unicode-range subsets, and CSS font fallback's per-glyph (not per-string) resolution model is unintuitive enough that it's an easy thing to get backwards without checking the built CSS.
- The `.badge-amber` tint gap's root cause (established just now, writing this entry) looks like two independent, correct-in-isolation fixes touching the same three lines of `styles.css` in the wrong order, with no CSS-level test to catch a percentage regression — `theme.test.ts` only tracks the theme-color meta literal, and the review itself says outright: "No test added or changed covers any of the new tokens... The palette itself is untested."

## Lessons Learned

- `INSERT OR IGNORE` seeding and "ship a new default value" are in tension the moment a default is user-visible (a color, not just a feature flag) — any future default change to `DEFAULT_SETTINGS` needs the same "is this a value existing rows should adopt" question asked explicitly, not assumed away by the ignore-on-conflict pattern.
- CSS font fallback is per-glyph. A comment or code review claim that "the fallback handles it" for a specific script needs to be checked against the actual `unicode-range` of the fallback font's shipped `@font-face` subsets, not assumed from the font's general reputation for broad coverage.
- A percentage-only regression in a `color-mix()` call is functionally invisible to the type checker, the unit test runner, or the backend test suite — none of them render CSS. Two overlapping hand-edits to the same rule block, made in separate fix passes, can clobber each other with zero test signal. Anything with a "restore this exact recorded value" fix should get grepped back out of the final diff before calling the review closed, not just cross-referenced against the recorded finding.

## Next Steps

- Open item, owner: whoever picks up PR #30 review comments before merge. `.badge-amber`'s background tint (`frontend/src/styles.css:2071`) needs to go from `4%` to `15%` to match `.badge-red`/`.pill-success`/`.pill-error` and the phase-02 spec — either as a follow-up commit on this branch before merge, or a fast-follow immediately after, given it's a one-line CSS change.
- Consider adding at least a lightweight assertion (even a simple regex check in a vitest test over `styles.css`) for the small set of `color-mix(... N%, ...)` rules that are supposed to move in lockstep, so a future hand-edit to one status-pill rule can't silently diverge from its siblings again.
- No action needed on the `state.db` migration or the `html[lang='vi']` font scoping — both verified present and correct in the shipped commit (`src/api_state.py` `_migrate_legacy_brand_colors`, `frontend/src/styles.css:64-76`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
