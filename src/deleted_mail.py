from __future__ import annotations

from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
import sqlite3
from typing import Callable
import zlib


BACKUP_RETENTION_DAYS = 365
MAX_EML_BACKUP_BYTES = 10 * 1024 * 1024
_LAZY_PURGE_LIMIT = 100
_SUMMARY_COLUMNS = (
    "message_id, account_id, msgid, mailbox_address, from_name, from_address, "
    "to_json, subject, intro, has_attachments, size, has_source, received_at, "
    "deleted_at, expires_at"
)
_DETAIL_COLUMNS = (
    f"{_SUMMARY_COLUMNS}, cc_json, bcc_json, text_body, html_body_json, attachments_json"
)


class DeletedMailStore:
    def __init__(self, path: str, clock: Callable[[], datetime] | None = None):
        self.path = path
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        directory = os.path.dirname(os.path.abspath(path))
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(f"{path}.migration.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with closing(sqlite3.connect(path)) as conn:
                conn.row_factory = sqlite3.Row
                try:
                    os.chmod(path, 0o600)
                    if hasattr(os, "geteuid") and os.geteuid() == 0 and directory:
                        dir_stat = os.stat(directory)
                        if dir_stat.st_uid != 0 or dir_stat.st_gid != 0:
                            os.chown(path, dir_stat.st_uid, dir_stat.st_gid)
                            os.chown(f"{path}.migration.lock", dir_stat.st_uid, dir_stat.st_gid)
                except OSError:
                    pass
                has_tables = conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1"
                ).fetchone()
                if not has_tables:
                    conn.execute("PRAGMA auto_vacuum = INCREMENTAL")
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")
                with conn:
                    conn.execute("BEGIN IMMEDIATE")
                    self._initialize(conn)

    @staticmethod
    def _initialize(conn: sqlite3.Connection) -> None:
        schema = """
            CREATE TABLE IF NOT EXISTS deleted_messages (
              message_id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              msgid TEXT NOT NULL,
              mailbox_address TEXT NOT NULL,
              from_name TEXT NOT NULL,
              from_address TEXT NOT NULL,
              to_json TEXT NOT NULL,
              cc_json TEXT NOT NULL,
              bcc_json TEXT NOT NULL,
              subject TEXT NOT NULL,
              intro TEXT NOT NULL,
              has_attachments INTEGER NOT NULL,
              size INTEGER NOT NULL,
              text_body TEXT NOT NULL,
              html_body_json TEXT NOT NULL,
              attachments_json TEXT NOT NULL,
              raw_eml_zlib BLOB,
              has_source INTEGER NOT NULL,
              received_at TEXT NOT NULL,
              deleted_at TEXT NOT NULL,
              expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS deleted_messages_deleted_at
              ON deleted_messages(deleted_at DESC, message_id DESC);
            CREATE INDEX IF NOT EXISTS deleted_messages_expires_at
              ON deleted_messages(expires_at);
            CREATE INDEX IF NOT EXISTS deleted_messages_mailbox
              ON deleted_messages(mailbox_address, deleted_at DESC);
            CREATE INDEX IF NOT EXISTS deleted_messages_from
              ON deleted_messages(from_address, deleted_at DESC);
        """
        for statement in schema.split(";"):
            if statement.strip():
                conn.execute(statement)

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path)) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            with conn:
                yield conn

    @staticmethod
    def _utc_iso(value: datetime | str) -> str:
        if isinstance(value, datetime):
            dt = value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            dt = parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            return "1970-01-01T00:00:00Z"

    def archive(
        self,
        *,
        message_id: str,
        account_id: str,
        msgid: str,
        mailbox_address: str,
        from_name: str,
        from_address: str,
        to_list: list[dict[str, str]],
        cc_list: list[dict[str, str]],
        bcc_list: list[dict[str, str]],
        subject: str,
        intro: str,
        has_attachments: bool,
        size: int,
        text_body: str,
        html_body: list[str],
        attachments: list[dict[str, object]],
        raw_eml_zlib: bytes | None,
        received_at: datetime | str,
    ) -> dict[str, object]:
        now = self.clock()
        deleted_iso = self._utc_iso(now)
        expires_iso = self._utc_iso(now + timedelta(days=BACKUP_RETENTION_DAYS))
        received_iso = self._utc_iso(received_at)
        has_source = 1 if raw_eml_zlib is not None else 0

        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM deleted_messages WHERE message_id IN ("
                "SELECT message_id FROM deleted_messages WHERE expires_at <= ? "
                "ORDER BY expires_at LIMIT ?"
                ")",
                (deleted_iso, _LAZY_PURGE_LIMIT),
            )
            conn.execute(
                "INSERT OR REPLACE INTO deleted_messages ("
                "message_id, account_id, msgid, mailbox_address, from_name, from_address, "
                "to_json, cc_json, bcc_json, subject, intro, has_attachments, size, "
                "text_body, html_body_json, attachments_json, raw_eml_zlib, has_source, "
                "received_at, deleted_at, expires_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    message_id,
                    account_id,
                    msgid,
                    mailbox_address,
                    from_name,
                    from_address,
                    json.dumps(to_list, ensure_ascii=False),
                    json.dumps(cc_list, ensure_ascii=False),
                    json.dumps(bcc_list, ensure_ascii=False),
                    subject,
                    intro,
                    1 if has_attachments else 0,
                    int(size),
                    text_body,
                    json.dumps(html_body, ensure_ascii=False),
                    json.dumps(attachments, ensure_ascii=False),
                    sqlite3.Binary(raw_eml_zlib) if raw_eml_zlib is not None else None,
                    has_source,
                    received_iso,
                    deleted_iso,
                    expires_iso,
                ),
            )
        return {
            "id": message_id,
            "deletedAt": deleted_iso,
            "expiresAt": expires_iso,
            "hasSource": bool(has_source),
        }

    def purge_expired(self, now: datetime | None = None, batch_size: int = 500) -> int:
        cutoff_iso = self._utc_iso(now or self.clock())
        total_deleted = 0
        while True:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.execute(
                    "DELETE FROM deleted_messages WHERE message_id IN ("
                    "SELECT message_id FROM deleted_messages WHERE expires_at <= ? "
                    "ORDER BY expires_at LIMIT ?"
                    ")",
                    (cutoff_iso, batch_size),
                )
                deleted = cursor.rowcount
            total_deleted += deleted
            if deleted < batch_size:
                break
        if total_deleted > 0:
            with closing(sqlite3.connect(self.path)) as conn:
                try:
                    conn.execute("PRAGMA incremental_vacuum(500)")
                except sqlite3.Error:
                    pass
        return total_deleted

    @staticmethod
    def _escape_like(query: str) -> str:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return f"%{escaped}%"

    @staticmethod
    def _row_to_summary(row: sqlite3.Row) -> dict[str, object]:
        message_id = row["message_id"]
        has_source = bool(row["has_source"])
        return {
            "id": message_id,
            "accountId": row["account_id"],
            "msgid": row["msgid"],
            "mailboxAddress": row["mailbox_address"],
            "from": {"name": row["from_name"], "address": row["from_address"]},
            "to": json.loads(row["to_json"]),
            "subject": row["subject"],
            "intro": row["intro"],
            "hasAttachments": bool(row["has_attachments"]),
            "size": row["size"],
            "hasSource": has_source,
            "downloadUrl": f"/admin/api/deleted-messages/{message_id}/source" if has_source else None,
            "receivedAt": row["received_at"],
            "deletedAt": row["deleted_at"],
            "expiresAt": row["expires_at"],
        }

    def _row_to_detail(self, row: sqlite3.Row) -> dict[str, object]:
        summary = self._row_to_summary(row)
        return {
            **summary,
            "cc": json.loads(row["cc_json"]),
            "bcc": json.loads(row["bcc_json"]),
            "text": row["text_body"],
            "html": json.loads(row["html_body_json"]),
            "attachments": json.loads(row["attachments_json"]),
        }

    def list_messages(
        self, page: int = 1, limit: int = 20, query: str = ""
    ) -> tuple[int, list[dict[str, object]]]:
        now_iso = self._utc_iso(self.clock())
        clean_query = query.strip().lower()
        offset = max(0, (page - 1) * limit)
        with self._connect() as conn:
            if clean_query:
                pattern = self._escape_like(clean_query)
                where = (
                    "expires_at > ? AND ("
                    "LOWER(mailbox_address) LIKE ? ESCAPE '\\' OR "
                    "LOWER(from_address) LIKE ? ESCAPE '\\' OR "
                    "LOWER(from_name) LIKE ? ESCAPE '\\' OR "
                    "LOWER(subject) LIKE ? ESCAPE '\\'"
                    ")"
                )
                params: tuple[object, ...] = (now_iso, pattern, pattern, pattern, pattern)
            else:
                where = "expires_at > ?"
                params = (now_iso,)

            total = conn.execute(
                f"SELECT COUNT(*) FROM deleted_messages WHERE {where}", params
            ).fetchone()[0]
            rows = conn.execute(
                f"SELECT {_SUMMARY_COLUMNS} FROM deleted_messages "
                f"WHERE {where} ORDER BY deleted_at DESC, message_id DESC LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
        return int(total), [self._row_to_summary(row) for row in rows]

    def get_message(self, message_id: str) -> dict[str, object] | None:
        now_iso = self._utc_iso(self.clock())
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT {_DETAIL_COLUMNS} FROM deleted_messages "
                "WHERE message_id = ? AND expires_at > ?",
                (message_id, now_iso),
            ).fetchone()
        return self._row_to_detail(row) if row is not None else None

    def get_source(self, message_id: str) -> bytes | None:
        now_iso = self._utc_iso(self.clock())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT raw_eml_zlib FROM deleted_messages "
                "WHERE message_id = ? AND expires_at > ?",
                (message_id, now_iso),
            ).fetchone()
        if row is None or row["raw_eml_zlib"] is None:
            return None
        return zlib.decompress(bytes(row["raw_eml_zlib"]))

    def delete_message(self, message_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM deleted_messages WHERE message_id = ?", (message_id,)
            )
            return cursor.rowcount > 0
