from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import stat
import zlib

from src.deleted_mail import BACKUP_RETENTION_DAYS, DeletedMailStore


def _sample_record(message_id: str = "m1", mailbox: str = "box@example.com") -> dict:
    return {
        "message_id": message_id,
        "account_id": "mail-account",
        "msgid": f"<{message_id}@example.com>",
        "mailbox_address": mailbox,
        "from_name": "Alice",
        "from_address": "alice@sender.example",
        "to_list": [{"name": "Box", "address": mailbox}],
        "cc_list": [],
        "bcc_list": [],
        "subject": f"Subject for {message_id}",
        "intro": "Short preview",
        "has_attachments": True,
        "size": 512,
        "text_body": "Plain text body",
        "html_body": ["<p>HTML body</p>"],
        "attachments": [
            {
                "id": "att-1",
                "filename": "report.pdf",
                "contentType": "application/pdf",
                "disposition": "attachment",
                "size": 128,
            }
        ],
        "raw_eml_zlib": zlib.compress(b"From: alice@sender.example\r\n\r\nPlain text body"),
        "received_at": "2026-10-10T10:00:00Z",
    }


def test_store_creates_private_wal_db_and_round_trips_message(tmp_path):
    db_path = tmp_path / "deleted_mail.db"
    now = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
    store = DeletedMailStore(str(db_path), clock=lambda: now)

    assert db_path.exists()
    assert stat.S_IMODE(os.stat(db_path).st_mode) == 0o600

    meta = store.archive(**_sample_record("m1"))
    assert meta == {
        "id": "m1",
        "deletedAt": "2026-10-20T12:00:00Z",
        "expiresAt": "2027-10-20T12:00:00Z",
        "hasSource": True,
    }

    total, items = store.list_messages(page=1, limit=20)
    assert total == 1
    assert len(items) == 1
    assert items[0]["id"] == "m1"
    assert items[0]["mailboxAddress"] == "box@example.com"
    assert items[0]["from"] == {"name": "Alice", "address": "alice@sender.example"}
    assert items[0]["hasSource"] is True
    assert items[0]["downloadUrl"] == "/admin/api/deleted-messages/m1/source"
    assert "text" not in items[0]

    detail = store.get_message("m1")
    assert detail is not None
    assert detail["text"] == "Plain text body"
    assert detail["html"] == ["<p>HTML body</p>"]
    assert detail["attachments"][0]["filename"] == "report.pdf"

    raw = store.get_source("m1")
    assert raw == b"From: alice@sender.example\r\n\r\nPlain text body"


def test_store_handles_null_source_for_oversized_messages(tmp_path):
    db_path = tmp_path / "deleted_mail.db"
    store = DeletedMailStore(str(db_path))
    record = _sample_record("oversized")
    record["raw_eml_zlib"] = None
    record["size"] = 12 * 1024 * 1024

    meta = store.archive(**record)
    assert meta["hasSource"] is False

    detail = store.get_message("oversized")
    assert detail is not None
    assert detail["hasSource"] is False
    assert detail["downloadUrl"] is None
    assert store.get_source("oversized") is None


def test_search_escapes_like_wildcards_and_filters_fields(tmp_path):
    db_path = tmp_path / "deleted_mail.db"
    store = DeletedMailStore(str(db_path))
    store.archive(**{**_sample_record("m1", "user_1@example.com"), "subject": "100% verified"})
    store.archive(**{**_sample_record("m2", "userX1@example.com"), "subject": "1000 verified"})

    # Searching for literal 'user_1' should not match 'userX1'
    total, items = store.list_messages(query="user_1")
    assert total == 1
    assert [item["id"] for item in items] == ["m1"]

    # Searching for literal '100%' should not match '1000'
    total_pct, items_pct = store.list_messages(query="100%")
    assert total_pct == 1
    assert [item["id"] for item in items_pct] == ["m1"]


def test_lazy_purge_on_archive_and_explicit_purge_expired(tmp_path):
    db_path = tmp_path / "deleted_mail.db"
    current_time = [datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)]
    store = DeletedMailStore(str(db_path), clock=lambda: current_time[0])

    store.archive(**_sample_record("old-1"))
    store.archive(**_sample_record("old-2"))

    # Advance 200 days: still within 365-day retention
    current_time[0] += timedelta(days=200)
    store.archive(**_sample_record("mid-1"))
    assert store.get_message("old-1") is not None
    assert store.get_message("mid-1") is not None

    # Advance past 365 days from initial archive (total +366 days from start)
    current_time[0] = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc) + timedelta(
        days=BACKUP_RETENTION_DAYS + 1
    )
    # Expired messages are immediately hidden from reads even before purge
    assert store.get_message("old-1") is None
    assert store.get_source("old-1") is None
    total, items = store.list_messages()
    assert total == 1
    assert [item["id"] for item in items] == ["mid-1"]

    # Archiving a new message lazily purges old-1 and old-2 from the table
    store.archive(**_sample_record("fresh-1"))
    with store._connect() as conn:
        remaining = {
            row["message_id"]
            for row in conn.execute("SELECT message_id FROM deleted_messages")
        }
    assert remaining == {"mid-1", "fresh-1"}

    # Advance another 200 days so mid-1 expires, then run purge_expired()
    current_time[0] += timedelta(days=200)
    purged = store.purge_expired()
    assert purged == 1
    with store._connect() as conn:
        remaining_after = {
            row["message_id"]
            for row in conn.execute("SELECT message_id FROM deleted_messages")
        }
    assert remaining_after == {"fresh-1"}


def test_manual_delete_removes_record(tmp_path):
    db_path = tmp_path / "deleted_mail.db"
    store = DeletedMailStore(str(db_path))
    store.archive(**_sample_record("m1"))

    assert store.delete_message("m1") is True
    assert store.delete_message("m1") is False
    assert store.get_message("m1") is None
