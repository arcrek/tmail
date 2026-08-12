---
title: "Refocus public inbox workspace"
status: completed
priority: P2
tags: [frontend, ux]
---

# Refocus public inbox workspace

## Goal

Make the public inbox feel like a useful workspace instead of two cramped, equally weighted cards.

## Plan

1. Widen only pages containing the inbox, preserving the compact address-creation flow.
2. Use the space for a clearer address rail, dominant message panel, stronger empty state, and readable message scanning.
3. Retain all existing Vue behavior, controls, labels, motion settings, and responsive one-column fallback.
4. Update the existing layout assertion and run the focused inbox test.

## Files

- Modify `frontend/src/styles.css`
- Modify `frontend/src/tests/InboxView.test.ts`
