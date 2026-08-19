# Phase 3: Audio alerts and QR code address sharing

## Context Links

- Plan: [plan.md](./plan.md)
- Inbox view component: `frontend/src/components/InboxView.vue`
- Audio chime utility: `frontend/src/sound.ts`
- QR Code helper / modal: `frontend/src/qrcode.ts`, `frontend/src/components/QrCodeModal.vue`
- Global styles: `frontend/src/styles.css`
- Translation catalogs: `frontend/src/i18n.ts`
- Tests: `frontend/src/tests/InboxView.test.ts`, `frontend/src/tests/sound.test.ts`, `frontend/src/tests/qrcode.test.ts`

## Overview

- Priority: P2
- Status: Completed
- Provide a subtle audio chime notification when new mail is received, and a modal/popover QR code generator allowing users to scan and load the temporary email address directly on mobile devices.

## Key Insights

- **Sound Alert:**
  - When SSE or auto-polling receives a new message, users working in other tabs or windows benefit from an audible cue.
  - Using Web Audio API `AudioContext` and `OscillatorNode` generates a clean, instant synthetic chime (e.g. 520Hz -> 660Hz two-tone sine chime) with zero network request and zero audio asset files.
  - Include an audio toggle (sound on/off stored in `localStorage` or paired with notification toggle) so users can mute it anytime.
- **QR Code Generation:**
  - Users frequently need to transfer a generated temporary email address to a mobile device.
  - A lightweight, self-contained QR matrix algorithm (or pure SVG generator) avoids bulky dependencies and renders an crisp QR code inside an accessible modal dialog.
  - Triggered via a "QR code" button next to Copy in `InboxView.vue`'s hero action bar.

## Requirements

### Functional

1. **Sound notification (`frontend/src/sound.ts`):**
   - Implement `playNewMailChime()` using native `window.AudioContext` or `webkitAudioContext`.
   - Ensure it respects audio enable/disable preferences (`soundEnabled = ref(loadSoundPreference())`).
   - Trigger `playNewMailChime()` when a new message is detected in `InboxView.vue` (both via SSE stream and polling comparison with `knownIds`).
2. **QR Code Generation & Modal (`frontend/src/qrcode.ts`, `frontend/src/components/QrCodeModal.vue`):**
   - Provide minimal QR generator that renders either an SVG or HTML `<canvas>` representation of `mailto:` or the plain email address string.
   - In `InboxView.vue`, add a `QR` button in `.inbox-hero-actions` with an `AppIcon name="qr"` or similar icon.
   - Clicking opens `QrCodeModal` displaying the QR code, the full address, and a 1-click copy button, with `Esc` / overlay click to close.

### Non-functional

- Zero external npm packages required.
- Keyboard accessible modal with trap focus and proper `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- i18n support in `en` and `vi` for QR modal and sound controls.
- Unit tests covering sound invocation guard and QR code matrix generation.

## Related Code Files

- Create: `frontend/src/sound.ts`
- Create: `frontend/src/qrcode.ts`
- Create: `frontend/src/components/QrCodeModal.vue`
- Modify: `frontend/src/components/InboxView.vue`
- Modify: `frontend/src/components/AppIcon.vue`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/i18n.ts`
- Create: `frontend/src/tests/sound.test.ts`
- Create: `frontend/src/tests/qrcode.test.ts`
- Modify: `frontend/src/tests/InboxView.test.ts`

## Implementation Steps

1. In `frontend/src/sound.ts`:
   - Implement simple oscillator chime (e.g., two-note sequence: 587.33Hz (D5) -> 880Hz (A5)).
   - Add state helper `getSoundEnabled()` / `setSoundEnabled()`.
2. In `frontend/src/qrcode.ts`:
   - Implement a compact pure-JS QR code generator (Version 1-4 standard alphanumeric/byte mode QR encoder).
3. In `frontend/src/components/QrCodeModal.vue`:
   - Create accessible modal with SVG/Canvas QR rendering, address title, and close button.
4. In `frontend/src/components/InboxView.vue`:
   - Add QR code button in hero actions.
   - Hook up `playNewMailChime()` upon receiving new message items.
5. In `frontend/src/styles.css`:
   - Style the QR modal and QR canvas.
6. In `frontend/src/i18n.ts`:
   - Add translations: `inbox.qrCode`, `inbox.qrTitle`, `inbox.qrHelp`, `inbox.soundOn`, `inbox.soundOff`.
7. Write unit tests in `sound.test.ts`, `qrcode.test.ts`, and update `InboxView.test.ts`.
8. Verify test suite passes cleanly.

## Todo List

- [x] Create `sound.ts` with Web Audio API chime
- [x] Create zero-dependency `qrcode.ts` and `QrCodeModal.vue`
- [x] Add QR icon to `AppIcon.vue`
- [x] Wire QR modal and sound trigger into `InboxView.vue`
- [x] Add CSS styling for QR modal
- [x] Add i18n keys for QR and Sound in `en` and `vi`
- [x] Add test coverage in `frontend/src/tests/`
- [x] Verify test suite passes 100%

## Success Criteria

- New messages trigger a clean, audible chime when sound is enabled.
- Clicking "QR" shows a clear, scannable QR code of the current address.
- Modal is fully keyboard accessible and responsive.
- Vitest unit tests pass 100%.
