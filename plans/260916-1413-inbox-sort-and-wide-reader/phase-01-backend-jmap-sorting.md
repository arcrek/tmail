# Phase 1 — Backend: JMAP Newest-First Query Sorting

## Overview

**Priority:** P1  
**Status:** Completed  
**Estimate:** 0.5h  

## Related Code Files

- **Modify**: `src/jmap_client.py`
  - In `list_messages()`, update the `Email/query` payload to include standard RFC 8621 sort comparator:
    `"sort": [{"property": "receivedAt", "isAscending": False}]`
- **Modify**: `tests/test_jmap_mail.py`
  - In `test_list_messages_queries_recipient_and_returns_query_total`, assert that `query["sort"]` matches the descending `receivedAt` comparator.

## Implementation Steps

1. In `src/jmap_client.py`, locate `list_messages` (~line 205):
   ```python
   def list_messages(self, account_id: str, address: str, limit: int, position: int) -> tuple[int, list[dict]]:
       method_responses = self._call([
           ["Email/query", {
               "accountId": account_id,
               "filter": {"operator": "OR", "conditions": [
                   {"to": address}, {"header": ["Delivered-To", address]},
               ]},
               "sort": [{"property": "receivedAt", "isAscending": False}],
               "limit": limit,
               "position": position,
               "calculateTotal": True,
           }, "q"],
           ...
   ```
2. In `tests/test_jmap_mail.py`, update `test_list_messages_queries_recipient_and_returns_query_total`:
   ```python
   assert query["sort"] == [{"property": "receivedAt", "isAscending": False}]
   ```
3. Run backend test suite:
   ```bash
   .venv/bin/pytest tests/test_jmap_mail.py
   .venv/bin/pytest
   ```

## Success Criteria

- Stalwart / JMAP upstream receives explicit reverse-chronological sort on `receivedAt`.
- Page 1 pagination returns the newest 15 messages.
- All backend pytest tests pass without regression.

## Todo

- [x] Add `"sort": [{"property": "receivedAt", "isAscending": False}]` to `Email/query` in `src/jmap_client.py`.
- [x] Add sort assertion in `tests/test_jmap_mail.py`.
- [x] Run pytest to verify all tests pass.
