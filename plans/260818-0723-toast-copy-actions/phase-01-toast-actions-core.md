# Phase 1: Toast core — action buttons

## Context Links

- Plan: [plan.md](./plan.md)
- Current implementation: `frontend/src/toast.ts`, `frontend/src/components/ToastStack.vue`
- Test precedent: `frontend/src/tests/toast.test.ts`, `frontend/src/tests/ToastStack.test.ts`

## Overview

- Priority: P2
- Status: Done
- Add an `actions` field to `ToastEntry`, extend `useToast()`'s `success`/`error` signatures to accept it, render action buttons in `ToastStack.vue`, dismiss-on-click, longer auto-dismiss duration when actions are present.

## Key Insights

- Current `toast.ts` is a plain module-level `ref<ToastEntry[]>` with a fixed 5000ms `DURATION_MS` and a `push(kind, message)` internal helper — small, easy to extend without restructuring.
- `ToastStack.vue` already handles `role`/`aria-live` per kind (`alert`/`assertive` for error, `status`/`polite` for success) — action buttons need to fit inside that same live region without breaking the announcement (a button appearing inside an `aria-live` region announces along with the text, which is fine/expected here).

## Requirements

### Functional

- `ToastEntry` gains `actions?: ToastAction[]` where `ToastAction = { label: string; onClick: () => void }`.
- `useToast().success(message: string, actions?: ToastAction[])` and `.error(message: string, actions?: ToastAction[])` — both optional, default `undefined`, fully backward compatible with every existing call site (grep all `toast.success(`/`toast.error(` call sites across the codebase and confirm none break — they all pass exactly one string arg today).
- Duration: `actions?.length ? 8000 : 5000`.
- `ToastStack.vue`: render each action as a `<button type="button">` after the message, before the dismiss `×`. Clicking an action button calls `action.onClick()` then `dismiss(toast.id)`.
- Keep the existing dismiss `×` button working unchanged for toasts with or without actions.

### Non-functional

- No new npm dependency.
- No behavior change for any existing toast call site (message-only toasts render and time out exactly as before).

## Architecture

```ts
// toast.ts
export interface ToastAction { label: string; onClick: () => void }
export interface ToastEntry { id: number; kind: ToastKind; message: string; actions?: ToastAction[] }

const DEFAULT_DURATION_MS = 5000
const ACTION_DURATION_MS = 8000

function push(kind: ToastKind, message: string, actions?: ToastAction[]): void {
  if (!message) return
  const id = ++nextId
  toasts.value = [...toasts.value, { id, kind, message, actions }]
  setTimeout(() => dismiss(id), actions?.length ? ACTION_DURATION_MS : DEFAULT_DURATION_MS)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string, actions?: ToastAction[]) => push('success', message, actions),
    error: (message: string, actions?: ToastAction[]) => push('error', message, actions),
    dismiss,
  }
}
```

```html
<!-- ToastStack.vue, inside the existing per-toast div -->
<span>{{ toast.message }}</span>
<button
  v-for="action in toast.actions"
  :key="action.label"
  type="button"
  class="toast-action"
  @click="() => { action.onClick(); dismiss(toast.id) }"
>{{ action.label }}</button>
<button type="button" class="toast-dismiss" :aria-label="t('toast.dismiss')" @click="dismiss(toast.id)">×</button>
```

## Related Code Files

- Modify: `frontend/src/toast.ts`
- Modify: `frontend/src/components/ToastStack.vue` (template + a `.toast-action` style rule alongside the existing `.toast-dismiss` styling)

## Implementation Steps

1. Add `ToastAction` interface and `actions?` field to `ToastEntry` in `toast.ts`.
2. Change `push()`'s duration calculation and `success`/`error` signatures as above.
3. Update `ToastStack.vue` template to render action buttons; add minimal styling consistent with the existing toast button style (`.toast-dismiss`) — action buttons should look like secondary/text buttons, not compete visually with dismiss.
4. Grep the codebase for every existing `toast.success(`/`toast.error(` call site — confirm each still compiles with the new optional second parameter (should require zero changes at call sites, this step is verification only).

## Todo List

- [x] `ToastEntry`/`ToastAction` types added, `push()` accepts optional actions
- [x] Action-bearing toasts get 8s duration, plain toasts stay at 5s
- [x] `ToastStack.vue` renders action buttons, click runs handler then dismisses
- [x] All existing `toast.success`/`toast.error` call sites unaffected (no signature break)

## Success Criteria

- A toast pushed with two actions renders two buttons plus the existing dismiss `×`, and clicking either action fires its handler and removes the toast.
- Every pre-existing toast call site in the app still renders/behaves identically to before this change.

## Risk Assessment

- **Duration change surprising existing toasts:** only toasts *with* actions get the longer duration — verify no existing call site accidentally starts passing actions and silently changes its timing.
- **Action button keyboard/focus order:** action buttons must be reachable by keyboard before the dismiss button (natural DOM order handles this) — don't add a custom tabindex that reorders it.

## Security Considerations

- `action.onClick` handlers are supplied by call sites within this codebase (not user-controlled strings executed as code) — no injection surface; `label` is rendered as text (Vue's default `{{ }}` escaping), not `v-html`.

## Next Steps

- Phase 2 wires the first real consumer of this capability into `InboxView.vue`.
