# Phase 1: Toast core — composable, component, styles, mount

## Context Links

- Plan overview: [plan.md](./plan.md)
- Style reference for module-level composable pattern: `frontend/src/i18n.ts` (module-level `ref`, exported functions, no Pinia)
- Design tokens: `frontend/src/styles.css` lines 1-95 (`--surface`, `--ink`, `--red`, `--green`, `--shadow-1`, `--radius`, `--space-*`, dark theme via `[data-theme='dark']` and `@media (prefers-color-scheme: dark)`)

## Overview

- Priority: P1 (everything else in this plan depends on it)
- Status: Pending
- Build the toast store, the visual stack component, and mount it once at the app root. No existing code is touched yet — this phase is purely additive.

## Key Insights

- No UI library in the project (`frontend/package.json` deps: `vue` only). Build a hand-rolled composable, not a third-party toast lib.
- Existing module-singleton pattern (see `i18n.ts`, `session.ts`, `access.ts`): plain `ref` at module scope, exported functions mutate it, `useI18n()`/equivalent returns `readonly()` views. Follow the same shape: `useToast()` returns `{ toasts: readonly(...), success, error, dismiss }`, backed by one module-level `ref<Toast[]>([])`. A single global instance is correct here — the app has exactly one toast stack, so no provide/inject indirection is needed.
- Auto-dismiss timer per toast (`setTimeout`), plus manual dismiss button. Keep it simple: no pause-on-hover, no swipe-to-dismiss (YAGNI — not asked for, adds state).
- Two kinds only for now: `success`, `error` — matches every existing call site (no `info`/`warning` currently used anywhere in the codebase). Don't add unused kinds.
- Accessibility: success toasts are `role="status" aria-live="polite"` (non-interrupting), error toasts are `role="alert"` (existing `.form-error` convention was always `role="alert"`, keep that semantic). Each toast gets its own live region — don't wrap the whole stack in one shared `aria-live`, or rapid successive toasts will clobber each other's announcement.
- Respect `prefers-reduced-motion` — codebase already has a global block for this at `styles.css:1545`; the toast enter/exit transition must be covered by it (either add the toast transition inside that existing media query, or use `<TransitionGroup>` with a class that's neutralized there).
- z-index: only one existing use of `z-index` in `styles.css` (value `1`, unrelated). Toast stack needs to sit above everything, including admin nav/sandbox iframes — use a high value (e.g. `1000`) and note it as the ceiling for future overlays.

## Requirements

- `toast.success(message: string): void` and `toast.error(message: string): void` — no-op on falsy/empty message (several call sites currently do `error.value = cause instanceof Error ? cause.message : t('error.x')`, which is always truthy, but keep the guard defensively since some flows clear `error.value = ''` first without displaying it).
- Multiple toasts stack (don't replace one with the next) — several admin actions can plausibly overlap (e.g. file upload error + save error).
- Auto-dismiss after a fixed duration (5000ms — matches typical toast UX, no config surface needed).
- Manual dismiss via a close button on each toast.
- Toasts render above all page content, including the `SandboxFrame` iframes used for site header/footer/ad HTML (those are same-page elements, not separate windows, so pure CSS stacking is enough — verify `SandboxFrame`'s container has no competing `z-index`/`isolation` that would trap the toast under it).

## Architecture

**New file: `frontend/src/toast.ts`**

```ts
import { readonly, ref } from 'vue'

export type ToastKind = 'success' | 'error'
export interface ToastEntry { id: number; kind: ToastKind; message: string }

const DURATION_MS = 5000
const toasts = ref<ToastEntry[]>([])
let nextId = 0

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((entry) => entry.id !== id)
}

function push(kind: ToastKind, message: string): void {
  if (!message) return
  const id = ++nextId
  toasts.value = [...toasts.value, { id, kind, message }]
  setTimeout(() => dismiss(id), DURATION_MS)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    dismiss,
  }
}
```

**New file: `frontend/src/components/ToastStack.vue`**

```vue
<script setup lang="ts">
import { useToast } from '../toast'
import { useI18n } from '../i18n'

const { toasts, dismiss } = useToast()
const { t } = useI18n()
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.kind}`"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
        aria-live="polite"
      >
        <span>{{ toast.message }}</span>
        <button type="button" class="toast-dismiss" :aria-label="t('toast.dismiss')" @click="dismiss(toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
```

(Exact markup/props may be adjusted during implementation — the composable contract above is the load-bearing part; the component is a thin renderer over it.)

**`frontend/src/App.vue`**: import and mount `<ToastStack />` once, as a sibling at the end of `.app-frame`, outside `<main>` so it isn't affected by `view`/`loading` branching or the sandboxed content frames.

**`frontend/src/styles.css`**: new section near the end (or beside `.form-error`/`.form-status`, which this plan will later delete) —
- `.toast-stack`: `position: fixed`, anchored to a corner (bottom-right matches most existing modal/dropdown conventions in this codebase — verify by checking if any existing fixed-position UI sets a precedent; if none, default to bottom-right), `z-index: 1000`, `display: flex; flex-direction: column; gap: var(--space-2)`, `pointer-events: none` on the container (so it never blocks clicks through empty space) with `pointer-events: auto` on `.toast` itself.
- `.toast`: `background: var(--surface)`, `color: var(--ink)`, `box-shadow: var(--shadow-1)`, `border-radius: var(--radius)`, padding via `--space-*` tokens, a left border or icon accent colored by kind.
- `.toast-success`: accent `var(--green)`. `.toast-error`: accent `var(--red)`. Reuse these existing tokens — do not invent new color values (they already resolve correctly in dark mode via the existing `[data-theme='dark']` / `prefers-color-scheme` blocks).
- Toast enter/exit transition classes for `<TransitionGroup name="toast">`, folded into the existing `@media (prefers-reduced-motion: reduce)` block at line ~1545 so motion is disabled the same way every other animation in this app already is.

## Related Code Files

- Create: `frontend/src/toast.ts`
- Create: `frontend/src/components/ToastStack.vue`
- Modify: `frontend/src/App.vue` (mount point)
- Modify: `frontend/src/styles.css` (new `.toast*` rules + reduced-motion entry)
- Modify: `frontend/src/i18n.ts` (add `toast.dismiss` key — see Phase 4, but the key must exist before `ToastStack.vue` can call `t('toast.dismiss')`; add it here to keep this phase's component functional standalone)

## Implementation Steps

1. Add `toast.dismiss` (en: "Dismiss", vi: "Đóng" — matches existing `access.dismiss` translation) to `en`/`vi` in `i18n.ts`.
2. Create `toast.ts` per the contract above.
3. Create `ToastStack.vue` per the markup above.
4. Add `.toast-stack`/`.toast`/`.toast-success`/`.toast-error`/`.toast-dismiss`/transition rules to `styles.css`; add the transition-neutralizing rule to the existing reduced-motion block.
5. Mount `<ToastStack />` in `App.vue`, inside `.app-frame`, after `<main>` (or after the cookie notice — either works since it's `position: fixed`; pick the spot that reads cleanest in the template).
6. Manually sanity-check in dev (`npm run dev` in `frontend/`): temporarily call `useToast().success('test')` from a mounted hook, confirm it renders, stacks, auto-dismisses, and is dismissible — then remove the temporary call (real call sites come in Phases 2-3).

## Todo List

- [ ] `toast.dismiss` i18n key added (en + vi)
- [ ] `toast.ts` created with `success`/`error`/`dismiss`/`toasts`
- [ ] `ToastStack.vue` created
- [ ] CSS added, respects dark theme tokens and reduced-motion block
- [ ] Mounted once in `App.vue`
- [ ] Manually verified stacking + auto-dismiss + manual dismiss in dev server

## Success Criteria

- `useToast().success('x')` / `.error('x')` called from anywhere in the app renders a toast in the stack within one tick.
- Toast auto-dismisses after 5s; clicking the dismiss button removes it immediately.
- Multiple toasts stack without replacing each other.
- Renders correctly in both light and dark theme (token-derived colors only).
- No new console warnings/errors; `vue-tsc --noEmit` passes.

## Risk Assessment

- **z-index conflicts**: mitigate by checking `SandboxFrame.vue`'s container CSS for stacking context traps before assuming `z-index: 1000` wins.
- **aria-live spam**: mitigate by giving each toast its own `role`/`aria-live` rather than one shared region (see Key Insights).

## Security Considerations

- Toast messages are always `t(...)`-translated strings or `Error.message`/API error text — never render as raw HTML (use `{{ }}` interpolation, never `v-html`), since API error `detail` strings are server-controlled but should still be treated as plain text here, consistent with how `.form-error` rendered them before.

## Next Steps

- Phase 2 wires the first real call sites (`AddressPanel.vue`, `App.vue`).
