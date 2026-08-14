# Phase 2 — Frontend: consume the stream, keep polling as fallback

## Overview

**Priority:** P1
**Status:** Done
**Estimate:** 2.5h
**Depends on:** Phase 1 (`/messages/stream` must exist)

## Related code files

- Modify: `frontend/src/components/InboxView.vue` — replace the always-on `setInterval` with an
  SSE-first strategy; keep `refresh()`, `notifyNew()`, `startPolling()`/`stopPolling()` unchanged
  as the fallback path.
- Modify: `frontend/src/api.ts` — add a small stream-reading helper (not a new "api client
  method" that returns parsed JSON like the rest of the file — this one returns an async
  iterator/callback since the payload is SSE framing, not JSON).
- Add/modify: a frontend test (find the existing `InboxView` test file under
  `frontend/src/tests/`) covering the new stream-driven refresh + fallback behavior.

## Implementation steps

1. In `api.ts`, add:
   ```ts
   export async function streamMessages(token: string, onUpdate: () => void, signal: AbortSignal): Promise<void> {
     const response = await fetch('/messages/stream', {
       headers: { Authorization: `Bearer ${token}` },
       credentials: 'same-origin',
       signal,
     })
     if (!response.ok || !response.body) throw new ApiError(response.status, 'Stream failed')
     const reader = response.body.getReader()
     const decoder = new TextDecoder()
     let buffer = ''
     while (true) {
       const { done, value } = await reader.read()
       if (done) return
       buffer += decoder.decode(value, { stream: true })
       const frames = buffer.split('\n\n')
       buffer = frames.pop() ?? ''
       for (const frame of frames) {
         if (frame.startsWith('event: update')) onUpdate()
       }
     }
   }
   ```
   (Heartbeat `: keep-alive` comment lines are simply frames that don't start with `event:` —
   ignored by this loop, no special-case needed.)
2. In `InboxView.vue`:
   - Replace the unconditional `startPolling()` call on mount with: try opening the stream first
     (`streamMessages`, with an `AbortController` stored for cleanup); on stream `onUpdate`, call
     the existing `refresh()`. On the stream promise rejecting (network error, non-OK response,
     proxy killed it), fall back to `startPolling()` — the existing interval-based path, unchanged.
   - `document.hidden` handling: today, polling stops entirely when hidden. With the stream, do
     **not** abort on hide — the whole point of this plan is background delivery. Only the
     polling *fallback* should still respect `document.hidden` (it already does; leave that
     branch as-is).
   - On unmount (`onBeforeUnmount`), abort the stream's `AbortController` in addition to the
     existing `stopPolling()` call — no leaked open connections when the inbox view is torn down
     (e.g. user opens a different address).
   - Manual "Refresh" button keeps calling `refresh()` directly, unaffected.
3. Add tests to the existing `InboxView` test file:
   - `stream update event triggers refresh()` — mock `streamMessages` to invoke its `onUpdate`
     callback once, assert `api.messages` was called.
   - `stream failure falls back to interval polling` — mock `streamMessages` to reject, assert
     `window.setInterval` fallback path still refreshes on the tick.
   - `unmount aborts the stream` — assert the `AbortController`'s `abort()` fires on
     `onBeforeUnmount`.

## Success criteria

- New mail while the tab is in background now triggers `notifyNew()` (verified by the Phase-1
  manual test: backgrounded tab still gets a desktop notification).
- If the stream fails for any reason, the inbox silently falls back to the existing polling
  behavior — no visible error, no broken inbox.
- No duplicate refreshes: stream-driven and polling-driven refresh don't both run at once (stream
  success means polling never starts; fallback means stream is abandoned).
- No leaked `fetch` stream readers or `AbortController`s across address switches / unmounts.

## Todo

- [x] Add `streamMessages()` helper to `api.ts`.
- [x] Wire `InboxView.vue` to try the stream first, fall back to polling on failure.
- [x] Stop aborting the stream on `document.hidden` (polling fallback keeps its existing hidden
      behavior).
- [x] Abort the stream's `AbortController` on unmount.
- [x] Add the three tests above.
- [x] Run `npm test -- --run` for the affected test file(s).
