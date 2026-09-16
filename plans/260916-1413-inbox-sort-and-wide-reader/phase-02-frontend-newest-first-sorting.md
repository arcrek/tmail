# Phase 2 — Frontend: Inbox Message List Newest-First Sorting

## Overview

**Priority:** P1  
**Status:** Completed  
**Estimate:** 0.5h  

## Related Code Files

- **Modify**: `frontend/src/components/InboxView.vue`
  - Update computed `pageMessages` to sort items by `createdAt` descending.
- **Modify**: `frontend/src/tests/InboxView.test.ts`
  - Add unit test verifying that `InboxView` orders message rows newest-first even if the API collection payload delivers them in scrambled or chronological order.

## Implementation Steps

1. In `frontend/src/components/InboxView.vue`, update line 61:
   ```typescript
   const pageMessages = computed(() => {
     const items = collection.value?.['hydra:member'] ?? []
     return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   })
   ```
2. In `frontend/src/tests/InboxView.test.ts`, add test:
   ```typescript
   it('renders message rows ordered newest-first by createdAt', async () => {
     const wrapper = mount(InboxView, {
       props: {
         session: { address: 'box@example.com', token: 'signed' },
         fetchSeconds: 10,
       },
     })
     await flushPromises()

     const oldMsg = { ...summary('old'), createdAt: '2026-07-20T10:00:00Z', subject: 'Older Mail' }
     const newMsg = { ...summary('new'), createdAt: '2026-07-22T10:00:00Z', subject: 'Newer Mail' }
     mocks.messages.mockResolvedValue({
       '@context': '/contexts/Message',
       '@id': '/messages?page=1',
       '@type': 'hydra:Collection',
       'hydra:totalItems': 2,
       'hydra:member': [oldMsg, newMsg], // intentionally oldest-first from mock
       'hydra:view': { '@id': '/messages?page=1', '@type': 'hydra:PartialCollectionView' },
     })

     const refreshButton = wrapper.get('[data-action="refresh"]')
     await refreshButton.trigger('click')
     await flushPromises()

     const subjects = wrapper.findAll('.message-subject').map((el) => el.text())
     expect(subjects).toEqual(['Newer Mail', 'Older Mail'])
   })
   ```
3. Run vitest:
   ```bash
   npx vitest run frontend/src/tests/InboxView.test.ts
   ```

## Success Criteria

- Regardless of raw array ordering from the API, the user always sees the newest received emails at the top.
- Searching and filtering in `messages` inherits the newest-first sort order.
- Vitest tests pass cleanly.

## Todo

- [x] Update computed `pageMessages` in `frontend/src/components/InboxView.vue`.
- [x] Add sorting unit test to `frontend/src/tests/InboxView.test.ts`.
- [x] Run vitest to verify.
