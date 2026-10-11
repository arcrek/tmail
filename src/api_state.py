from __future__ import annotations

from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
import sqlite3
import tempfile
from typing import Callable


DEFAULT_SETTINGS = {
    "app_name": "Temporary Inbox",
    "logo_data_url": "",
    "favicon_data_url": "",
    "primary_color": "#0b57d0",
    "accent_color": "#0842a0",
    "language": "en",
    "cookie_enabled": False,
    "cookie_text": "",
    "auto_sync_domains": True,
    "fetch_seconds": 20,
    "message_limit": 15,
    "local_part_min": 3,
    "local_part_max": 32,
    "forbidden_ids": [],
    "blocked_sender_domains": [],
    "blacklisted_domains": [],
    "manual_domains": [],
    "header_html": "",
    "footer_html": "",
    "content_css": "",
    "ad_slots": {},
}

# Original brand colors. `INSERT OR IGNORE`
# below never overwrites a row that already exists, so an existing
# state.db keeps these forever unless explicitly migrated. On startup we
# upgrade a database still sitting on both legacy values (i.e. an admin
# never customized either color) to the new defaults; a site that set its
# own colors — including one that happens to match only one legacy value —
# is left untouched.
_LEGACY_BRAND_COLORS = {
    "primary_color": "#3454e0",
    "accent_color": "#4a4fce",
}


class StateStore:
    def __init__(self, path: str, clock: Callable[[], datetime] | None = None):
        self.path = path
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.backup_path: str | None = None
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(f"{path}.migration.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with closing(sqlite3.connect(path)) as conn:
                conn.row_factory = sqlite3.Row
                version = conn.execute("PRAGMA user_version").fetchone()[0]
                if version > 1:
                    raise RuntimeError("Unsupported state database version")
                if version == 0 and conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1"
                ).fetchone():
                    self.backup_path = self._backup(conn)
                conn.execute("PRAGMA journal_mode=WAL")
                with conn:
                    conn.execute("BEGIN IMMEDIATE")
                    self._initialize(conn)

    def _backup(self, conn: sqlite3.Connection) -> str:
        directory = os.path.dirname(os.path.abspath(self.path))
        fd, temporary = tempfile.mkstemp(prefix=".state-backup-", dir=directory)
        os.close(fd)
        published = temporary + ".sqlite3"
        try:
            with closing(sqlite3.connect(temporary)) as backup:
                conn.backup(backup)
                if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("State database backup verification failed")
            with open(temporary, "rb") as file:
                os.fsync(file.fileno())
            # Link publishes a complete backup without replacing a prior one.
            os.link(temporary, published)
            directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            return published
        finally:
            os.unlink(temporary)

    def _initialize(self, conn: sqlite3.Connection) -> None:
        schema = """
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS frozen_domains (domain TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS admin_sessions (
                  token_hash TEXT PRIMARY KEY,
                  csrf_token TEXT NOT NULL,
                  expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS access_credentials (
                  id TEXT PRIMARY KEY,
                  kind TEXT NOT NULL,
                  label TEXT NOT NULL,
                  secret_hash TEXT NOT NULL UNIQUE,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS access_sessions (
                  token_hash TEXT PRIMARY KEY,
                  expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS activity (
                  id INTEGER PRIMARY KEY,
                  kind TEXT NOT NULL,
                  domain TEXT,
                  detail TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mailbox_security (
                  address TEXT PRIMARY KEY,
                  password_hash TEXT,
                  generation INTEGER NOT NULL CHECK (generation >= 0),
                  protected_until TEXT,
                  CHECK ((password_hash IS NULL) = (protected_until IS NULL))
                );
                CREATE TABLE IF NOT EXISTS mailbox_sessions (
                  token_hash TEXT PRIMARY KEY,
                  address TEXT NOT NULL,
                  generation INTEGER NOT NULL,
                  expires_at TEXT NOT NULL,
                  elevated INTEGER NOT NULL,
                  admin_session_hash TEXT
                );
                CREATE INDEX IF NOT EXISTS mailbox_sessions_expires_at
                  ON mailbox_sessions(expires_at);
                CREATE INDEX IF NOT EXISTS mailbox_sessions_address
                  ON mailbox_sessions(address);
        """
        for statement in schema.split(";"):
            if statement.strip():
                conn.execute(statement)
        conn.execute("PRAGMA user_version=1")
        conn.executemany(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            ((key, json.dumps(value)) for key, value in DEFAULT_SETTINGS.items()),
        )
        self._migrate_legacy_brand_colors(conn)

    def _migrate_legacy_brand_colors(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            "SELECT key, value FROM settings WHERE key IN ('primary_color', 'accent_color')"
        ).fetchall()
        current = {row["key"]: json.loads(row["value"]) for row in rows}
        if current == _LEGACY_BRAND_COLORS:
            conn.executemany(
                "UPDATE settings SET value = ? WHERE key = ?",
                (
                    (json.dumps(DEFAULT_SETTINGS[key]), key)
                    for key in _LEGACY_BRAND_COLORS
                ),
            )

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path)) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            with conn:
                yield conn

    def _mailbox(self, conn: sqlite3.Connection, address: str, now: datetime) -> dict:
        row = conn.execute(
            "SELECT * FROM mailbox_security WHERE address = ?", (address,)
        ).fetchone()
        if row is None:
            return {"address": address, "password_hash": None, "generation": 0,
                    "protected_until": None}
        security = dict(row)
        if security["protected_until"] is not None and datetime.fromisoformat(
            security["protected_until"]
        ) <= now:
            conn.execute(
                "UPDATE mailbox_security SET password_hash=NULL, protected_until=NULL, "
                "generation=generation+1 WHERE address=?", (address,)
            )
            conn.execute("DELETE FROM mailbox_sessions WHERE address=?", (address,))
            security.update(password_hash=None, protected_until=None,
                            generation=security["generation"] + 1)
        return security

    def mailbox_security(self, address: str) -> dict:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            return self._mailbox(conn, address, self.clock())

    @staticmethod
    def _same_mailbox(current: dict, observed: dict) -> bool:
        # Login renewal can change the deadline without invalidating verification.
        return (current["generation"], current["password_hash"]) == (
            observed["generation"], observed["password_hash"]
        )

    @staticmethod
    def _parent(conn: sqlite3.Connection, token_hash: str, now: datetime) -> datetime:
        row = conn.execute(
            "SELECT expires_at FROM admin_sessions WHERE token_hash=?", (token_hash,)
        ).fetchone()
        if row is None:
            raise ValueError("Invalid administrator session")
        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at <= now:
            raise ValueError("Invalid administrator session")
        return expires_at

    @staticmethod
    def _insert_mailbox_session(conn, token_hash, security, expires_at,
                                elevated=False, admin_session_hash=None):
        conn.execute(
            "INSERT INTO mailbox_sessions "
            "(token_hash,address,generation,expires_at,elevated,admin_session_hash) "
            "VALUES (?,?,?,?,?,?)",
            (token_hash, security["address"], security["generation"],
             expires_at.isoformat(), elevated, admin_session_hash),
        )
        return {"address": security["address"], "generation": security["generation"],
                "expires_at": expires_at.isoformat(), "elevated": elevated,
                "admin_session_hash": admin_session_hash}

    def mutate_mailbox(self, observed: dict, password_hash: str | None,
                       token_hash: str | None = None,
                       admin_session_hash: str | None = None, *, elevated: bool = False) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            now = self.clock()
            current = self._mailbox(conn, observed["address"], now)
            if admin_session_hash is not None:
                self._parent(conn, admin_session_hash, now)
            if not self._same_mailbox(current, observed):
                return None
            deadline = now + timedelta(days=90) if password_hash is not None else None
            security = {"address": current["address"], "generation": current["generation"] + 1,
                        "password_hash": password_hash,
                        "protected_until": deadline.isoformat() if deadline else None}
            conn.execute(
                "INSERT INTO mailbox_security VALUES (?,?,?,?) "
                "ON CONFLICT(address) DO UPDATE SET password_hash=excluded.password_hash, "
                "generation=excluded.generation, protected_until=excluded.protected_until",
                (security["address"], password_hash, security["generation"],
                 security["protected_until"]),
            )
            conn.execute("DELETE FROM mailbox_sessions WHERE address=?", (security["address"],))
            if token_hash is not None:
                self._insert_mailbox_session(conn, token_hash, security, now + timedelta(days=90),
                                             elevated=elevated)
            return security

    def login_mailbox(self, observed: dict, token_hash: str,
                      upgraded_hash: str | None = None, *, elevated: bool = False) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            now = self.clock()
            current = self._mailbox(conn, observed["address"], now)
            if current["password_hash"] is None or not self._same_mailbox(current, observed):
                return None
            deadline = max(datetime.fromisoformat(current["protected_until"]),
                           now + timedelta(days=90))
            conn.execute(
                "UPDATE mailbox_security SET protected_until=?, password_hash=? WHERE address=?",
                (deadline.isoformat(), upgraded_hash or current["password_hash"], current["address"]),
            )
            return self._insert_mailbox_session(conn, token_hash, current, now + timedelta(days=90),
                                                elevated=elevated)

    def admin_mailbox_session(self, observed: dict, token_hash: str,
                              admin_session_hash: str) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            now = self.clock()
            current = self._mailbox(conn, observed["address"], now)
            expires_at = self._parent(conn, admin_session_hash, now)
            if not self._same_mailbox(current, observed):
                return None
            return self._insert_mailbox_session(
                conn, token_hash, current, min(expires_at, now + timedelta(hours=12)),
                elevated=True, admin_session_hash=admin_session_hash,
            )

    def mailbox_session(self, token_hash: str) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            now = self.clock()
            conn.execute(
                "DELETE FROM mailbox_sessions WHERE token_hash IN "
                "(SELECT token_hash FROM mailbox_sessions WHERE expires_at<=? "
                "ORDER BY expires_at LIMIT 100)", (now.isoformat(),)
            )
            row = conn.execute(
                "SELECT * FROM mailbox_sessions WHERE token_hash=?", (token_hash,)
            ).fetchone()
            if row is None:
                return None
            session = dict(row)
            current = self._mailbox(conn, session["address"], now)
            if (session["generation"] != current["generation"] or
                    datetime.fromisoformat(session["expires_at"]) <= now):
                return None
            if session["admin_session_hash"] is not None:
                try:
                    self._parent(conn, session["admin_session_hash"], now)
                except ValueError:
                    return None
            elif current["password_hash"] is None:
                return None
            return session

    def delete_mailbox_session(self, token_hash: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM mailbox_sessions WHERE token_hash=?", (token_hash,))

    def get_settings(self) -> dict[str, object]:
        with self._connect() as conn:
            return {row["key"]: json.loads(row["value"]) for row in conn.execute("SELECT key, value FROM settings")}

    def update_settings(self, values: dict[str, object]) -> None:
        with self._connect() as conn:
            conn.executemany(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                ((key, json.dumps(value)) for key, value in values.items()),
            )

    def get_frozen_domains(self) -> list[str]:
        with self._connect() as conn:
            return [row["domain"] for row in conn.execute("SELECT domain FROM frozen_domains ORDER BY domain")]

    def replace_frozen_domains(self, domains: list[str]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM frozen_domains")
            conn.executemany(
                "INSERT INTO frozen_domains (domain) VALUES (?)",
                ((domain,) for domain in sorted(set(domains))),
            )

    def create_admin_session(self, token_hash: str, csrf_token: str, expires_at: datetime) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO admin_sessions (token_hash, csrf_token, expires_at) VALUES (?, ?, ?)",
                (token_hash, csrf_token, expires_at.isoformat()),
            )

    def get_admin_session(self, token_hash: str, now: datetime) -> dict[str, object] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT token_hash, csrf_token, expires_at FROM admin_sessions WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
            if row is None or datetime.fromisoformat(row["expires_at"]) <= now:
                conn.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_hash,))
                return None
            return dict(row)

    def delete_admin_session(self, token_hash: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_hash,))

    def create_access_credential(
        self, id: str, kind: str, label: str, secret_hash: str, created_at: datetime
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO access_credentials (id, kind, label, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (id, kind, label, secret_hash, created_at.isoformat()),
            )

    def list_access_credentials(self) -> list[dict[str, object]]:
        with self._connect() as conn:
            return [dict(row) for row in conn.execute(
                "SELECT id, kind, label, created_at FROM access_credentials ORDER BY created_at DESC"
            )]

    def delete_access_credential(self, id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM access_credentials WHERE id = ?", (id,))
            return cursor.rowcount > 0

    def find_access_credential_by_hash(self, secret_hash: str) -> dict[str, object] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, kind, label FROM access_credentials WHERE secret_hash = ?", (secret_hash,)
            ).fetchone()
            return dict(row) if row is not None else None

    def create_access_session(self, token_hash: str, expires_at: datetime) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO access_sessions (token_hash, expires_at) VALUES (?, ?)",
                (token_hash, expires_at.isoformat()),
            )

    def get_access_session(self, token_hash: str, now: datetime) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT expires_at FROM access_sessions WHERE token_hash = ?", (token_hash,)
            ).fetchone()
            if row is None or datetime.fromisoformat(row["expires_at"]) <= now:
                conn.execute("DELETE FROM access_sessions WHERE token_hash = ?", (token_hash,))
                return False
            return True

    def delete_access_session(self, token_hash: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM access_sessions WHERE token_hash = ?", (token_hash,))

    def record_event(self, kind: str, domain: str | None = None, detail: str | None = None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO activity (kind, domain, detail, created_at) VALUES (?, ?, ?, ?)",
                (kind, domain, detail, datetime.now(timezone.utc).isoformat()),
            )

    def record_sync(self, success: bool, detail: str) -> None:
        self.record_event("sync_success" if success else "sync_failure", detail=detail)

    def last_sync(self) -> dict[str, object]:
        return self.sync_history()["lastSync"]

    def sync_history(self) -> dict[str, dict[str, object]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT kind, detail, created_at FROM activity WHERE id IN ("
                "SELECT MAX(id) FROM activity WHERE kind = 'sync_success' UNION "
                "SELECT MAX(id) FROM activity WHERE kind = 'sync_failure'"
                ") ORDER BY id DESC"
            ).fetchall()
        statuses = [{
            "success": row["kind"] == "sync_success",
            "detail": row["detail"],
            "created_at": row["created_at"],
        } for row in rows]
        return {
            "lastSync": statuses[0] if statuses else {},
            "lastSuccessfulSync": next((item for item in statuses if item["success"]), {}),
            "lastSyncError": next((item for item in statuses if not item["success"]), {}),
        }

    def activity_summary(self) -> dict[str, object]:
        now = datetime.now(timezone.utc)
        today = now.date().isoformat()
        seven_days = (now - timedelta(days=7)).isoformat()
        with self._connect() as conn:
            domains_today = conn.execute(
                "SELECT COUNT(*) FROM activity WHERE kind = 'domain_provisioned' AND created_at >= ?",
                (today,),
            ).fetchone()[0]
            domains_seven_days = conn.execute(
                "SELECT COUNT(*) FROM activity WHERE kind = 'domain_provisioned' AND created_at >= ?",
                (seven_days,),
            ).fetchone()[0]
            recent_domains = [
                dict(row)
                for row in conn.execute(
                    "SELECT domain, created_at FROM activity WHERE kind = 'domain_provisioned' "
                    "ORDER BY id DESC LIMIT 10"
                )
            ]
            recent_mx_failures = [
                dict(row)
                for row in conn.execute(
                    "SELECT kind, domain, detail, created_at FROM activity "
                    "WHERE kind IN ('mx_mismatch', 'mx_lookup_error') ORDER BY id DESC LIMIT 10"
                )
            ]
            return {
                "domainsToday": domains_today,
                "domainsSevenDays": domains_seven_days,
                "recentDomains": recent_domains,
                "recentMxFailures": recent_mx_failures,
            }
