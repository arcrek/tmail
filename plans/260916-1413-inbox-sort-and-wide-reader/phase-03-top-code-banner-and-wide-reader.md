# Phase 3 — Frontend: Top Code Banner & Wide Reader Layout

## Overview

**Priority:** P1  
**Status:** Completed  
**Estimate:** 1.5h  

## Related Code Files

- **Modify**: `frontend/src/components/MessageReader.vue`
  - Move `<aside class="verification-code">` directly above `.reader-body` inside `.reader-content-grid`.
  - Add icon badge and primary copy action button.
- **Modify**: `frontend/src/styles.css`
  - Widen `.page.inbox-page` container from `72rem` to `86rem`.
  - Tighten `.inbox-view` sidebar column from `minmax(17rem, 22rem)` to `minmax(16rem, 18.5rem)`.
  - Change `.reader-content-grid` from a 2-column grid (`minmax(0, 1fr) 14rem`) to a single-column vertical flow (`display: flex; flex-direction: column; gap: 1.25rem;`).
  - Style `.verification-code` as a full-width banner with `var(--primary-soft)` background and `1px solid var(--primary)` border, prominent monospace text, and copy CTA.
  - Verify responsive behavior on mobile (`max-width: 640px`).
- **Modify**: `frontend/src/tests/MessageReader.test.ts`
  - Add test asserting that `.verification-code` is rendered above `.reader-body` in document flow and copy function works properly.

## Implementation Steps

1. In `frontend/src/components/MessageReader.vue`, restructure template:
   ```html
   <div class="reader-content-grid">
     <aside v-if="verificationCode" class="verification-code" :aria-label="t('reader.code')">
       <div class="verification-code-lead">
         <span class="verification-code-badge">
           <AppIcon name="key" />
           {{ t('reader.code') }}
         </span>
         <code>{{ verificationCode }}</code>
       </div>
       <button class="primary-button compact-button" type="button" @click="copyVerificationCode">
         <AppIcon name="copy" />
         {{ t('address.copy') }}
       </button>
     </aside>

     <div class="reader-body">
       <div v-if="message.html.length && message.text" class="body-switcher" :aria-label="t('reader.format')">
         ...
       </div>
       <SandboxFrame ... />
       <pre v-else class="plain-message">{{ message.text || t('reader.empty') }}</pre>
     </div>
   </div>
   ```

2. In `frontend/src/styles.css`:
   - Line ~568:
     ```css
     .page.inbox-page {
       width: min(100% - 2rem, 86rem);
     }
     ```
   - Line ~867:
     ```css
     .inbox-view {
       display: grid;
       grid-template-columns: minmax(16rem, 18.5rem) minmax(0, 1fr);
       align-items: start;
       gap: var(--space-6);
     }
     ```
   - Line ~1287:
     ```css
     .reader-content-grid {
       display: flex;
       flex-direction: column;
       gap: 1.25rem;
     }

     .verification-code {
       display: flex;
       align-items: center;
       justify-content: space-between;
       flex-wrap: wrap;
       gap: 1rem;
       margin: 0;
       padding: 0.85rem 1.25rem;
       border: 1px solid var(--primary);
       border-radius: var(--radius);
       background: var(--primary-soft);
     }

     .verification-code-lead {
       display: flex;
       align-items: center;
       flex-wrap: wrap;
       gap: 0.75rem 1.25rem;
     }

     .verification-code-badge {
       display: inline-flex;
       align-items: center;
       gap: 0.35rem;
       font-size: var(--text-xs);
       font-weight: 700;
       text-transform: uppercase;
       letter-spacing: 0.04em;
       color: var(--primary);
     }

     .verification-code code {
       font-family: var(--font-mono);
       font-size: clamp(1.25rem, 2.5vw, 1.6rem);
       font-weight: 700;
       letter-spacing: 0.06em;
       color: var(--ink);
     }
     ```

3. In `frontend/src/tests/MessageReader.test.ts`:
   - Verify that all existing verification code tests pass (`.verification-code` text assertions remain valid).
   - Add assertion verifying that `.verification-code` appears before `.reader-body` in the reader container.

4. Run frontend tests:
   ```bash
   npx vitest run frontend/src/tests/MessageReader.test.ts
   npm test
   ```

5. Run frontend build to verify TypeScript and CSS:
   ```bash
   npm run build
   ```

## Success Criteria

- `.verification-code` renders horizontally on top of `.reader-body` whenever a code is extracted.
- Email viewing iframe (`.sandbox-frame`) expands to fill 100% of the reader panel width, achieving >900px on typical 1080p+ screens.
- Mobile view (`max-width: 640px`) wraps elements cleanly without horizontal scrolling.
- All vitest tests and TypeScript typechecks pass with 0 errors.

## Todo

- [x] Update `MessageReader.vue` template with top banner layout and key/copy icons.
- [x] Update container width, `.inbox-view`, `.reader-content-grid`, and `.verification-code` in `styles.css`.
- [x] Add DOM order assertion in `MessageReader.test.ts`.
- [x] Run vitest suite and frontend build.
