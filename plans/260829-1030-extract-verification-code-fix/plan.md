---
title: "Fix verification code extraction in emails"
description: "Refine extractVerificationCode algorithm to cleanly strip HTML/CSS/scripts and filter noise (phone numbers, timestamps, dates, zip codes) to correctly extract OTP codes from complex emails."
status: completed
priority: P1
effort: 1h
blockedBy: []
blocks: []
---

# Fix Verification Code Extraction in Emails

## Root Cause Analysis

On live test with `cusube@nort1.name.ng` on `tm-mails.com`:
1. **HTML/CSS numbers in `text` and `DOMParser`:** Many emails include raw HTML or `<style>` blocks in body/text containing numbers in font URLs (`...Y6323m...`), CSS color codes (`#333333`, `#323539`), unicode ranges (`U+0100-024F`), etc. The naive regex `/(?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9])/g` ran on `full.text` before cleaning, matching `6323` instead of the real OTP `944967` in Zoom email.
2. **Noise pollution (dates, timestamps, phone numbers, zip codes, copyright years):** In non-OTP notification emails (e.g. "New Zoom Sign-in Detected"), standalone numbers like phone `+1.888.799.9666`, zip `95113`, date `2026` were falsely recognized as OTP codes.
3. **Keyword-aware priority matching:** Priority should be given to codes immediately preceded/followed by OTP keywords (e.g. `code`, `pin`, `otp`, `verification`, `mã xác thực`, `xác minh`, etc.), then fallback to general numbers while filtering noise.

## Proposed Changes

1. **`frontend/src/verificationCode.ts`**:
   - Add robust HTML tag & `<style>`/`<script>`/`<head>`/comment stripping.
   - Clean noise: URLs, email addresses, phone numbers, timestamps, dates, US zip codes, copyright years.
   - Implement keyword-guided priority extraction (multilingual: English, Vietnamese, Spanish, etc.).
   - Discard 4-digit years (19xx, 20xx) in general search when not associated with verification keywords.
2. **`frontend/src/tests/verificationCode.test.ts`**:
   - Add test cases covering HTML emails with embedded CSS/font URLs, phone numbers, timestamps, and real Zoom emails.
   - Verify zero false positives on notification emails.

## Phases

- [Phase 1: Code Extraction Refinement](./phase-01-code-extraction-refinement.md)

## Verification & Execution Summary

- **Status:** Completed
- **Unit Testing:** 100% passing across 9 test cases in `frontend/src/tests/verificationCode.test.ts`.
- **Live Verification (`cusube@nort1.name.ng` on `tm-mails.com`):**
  - Correctly extracted OTP `243968` from subject line.
  - Correctly extracted OTP `944967` from HTML email body despite font URLs with embedded numbers, CSS hex values, and footer noise.
  - Correctly returned empty string `""` on security alert emails ("New Zoom Sign-in Detected") avoiding false positive matches on dates, times, phone numbers, and zip codes.
