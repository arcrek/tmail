from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import multiprocessing
import sqlite3
from threading import Barrier

import pytest

from src.api_state import StateStore


def test_settings_and_frozen_domains_round_trip(tmp_path):
    store = StateStore(str(tmp_path / "state.db"))
    assert store.get_settings()["primary_color"] == "#0b57d0"
    assert store.get_settings()["accent_color"] == "#0842a0"
    store.update_settings({"auto_sync_domains": False, "fetch_seconds": 20})
    store.replace_frozen_domains(["b.example", "a.example"])
    assert store.get_settings()["auto_sync_domains"] is False
    assert store.get_frozen_domains() == ["a.example", "b.example"]

    store.update_settings({"primary_color": "#b8501b", "accent_color": "#8f3e15"})
    reopened = StateStore(store.path)
    assert reopened.get_settings()["primary_color"] == "#b8501b"
    assert reopened.get_settings()["accent_color"] == "#8f3e15"


def test_admin_session_expires(tmp_path):
    store = StateStore(str(tmp_path / "state.db"))
    now = datetime.now(timezone.utc)
    store.create_admin_session("hash", "csrf", now - timedelta(seconds=1))
    assert store.get_admin_session("hash", now) is None


def test_activity_summary_counts_domains_today_and_seven_days(tmp_path):
    store = StateStore(str(tmp_path / "state.db"))
    store.record_event("domain_provisioned", "old.example")
    with sqlite3.connect(store.path) as connection:
        connection.execute(
            "UPDATE activity SET created_at = ? WHERE domain = ?",
            ((datetime.now(timezone.utc) - timedelta(days=8)).isoformat(), "old.example"),
        )
    store.record_event("domain_provisioned", "example.com")
    for index in range(11):
        store.record_event(
            "mx_mismatch" if index % 2 else "mx_lookup_error",
            f"failure-{index}.example",
            detail=f"detail-{index}",
        )
    summary = store.activity_summary()
    assert summary["domainsToday"] == 1
    assert summary["domainsSevenDays"] == 1
    assert summary["recentDomains"][0]["domain"] == "example.com"
    assert {event["domain"] for event in summary["recentDomains"]} == {"example.com", "old.example"}
    assert [event["domain"] for event in summary["recentMxFailures"]] == [
        f"failure-{index}.example" for index in range(10, 0, -1)
    ]
    assert len(summary["recentMxFailures"]) == 10
    assert summary["mxFailures24h"] == 11


def test_activity_summary_counts_mx_failures_only_within_24_hours(tmp_path):
    store = StateStore(str(tmp_path / "state.db"))
    store.record_event("mx_mismatch", "stale.example")
    with sqlite3.connect(store.path) as connection:
        connection.execute(
            "UPDATE activity SET created_at = ? WHERE domain = ?",
            ((datetime.now(timezone.utc) - timedelta(days=2)).isoformat(), "stale.example"),
        )
    store.record_event("mx_lookup_error", "fresh.example")
    store.record_event("domain_provisioned", "ok.example")

    assert store.activity_summary()["mxFailures24h"] == 1


def test_sync_history_retains_success_and_error_independently(tmp_path):
    store = StateStore(str(tmp_path / "state.db"))
    store.record_sync(True, "2 domains")
    store.record_sync(False, "TimeoutError")

    history = store.sync_history()

    assert history["lastSync"]["success"] is False
    assert history["lastSuccessfulSync"]["detail"] == "2 domains"
    assert history["lastSyncError"]["detail"] == "TimeoutError"


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
ADDRESS = "user@example.com"


def test_mailbox_claim_and_login_races_preserve_devices(tmp_path):
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: NOW)
    observed = store.mailbox_security(ADDRESS)
    barrier = Barrier(2)

    def claim(index):
        barrier.wait()
        return store.mutate_mailbox(observed, "encoded-password", f"claim-{index}")

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(claim, range(2)))
    assert sum(result is not None for result in results) == 1
    observed = store.mailbox_security(ADDRESS)

    def login(index):
        barrier.wait()
        return store.login_mailbox(observed, f"login-{index}")

    with ThreadPoolExecutor(2) as pool:
        assert all(pool.map(login, range(2)))
    assert store.mailbox_session("login-0")
    assert store.mailbox_session("login-1")
    assert store.mailbox_security(ADDRESS)["generation"] == 1
    store.delete_mailbox_session("login-0")
    assert store.mailbox_session("login-0") is None
    assert store.mailbox_session("login-1")


def test_expiry_boundary_renewal_and_fixed_session_expiry(tmp_path):
    clock = [NOW]
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: clock[0])
    store.mutate_mailbox(store.mailbox_security(ADDRESS), "encoded", "first")
    clock[0] += timedelta(days=89)
    observed = store.mailbox_security(ADDRESS)
    assert store.login_mailbox(observed, "second")
    clock[0] = NOW + timedelta(days=90)
    assert store.mailbox_session("first") is None
    assert store.mailbox_session("second")
    assert store.mailbox_security(ADDRESS)["generation"] == 1
    clock[0] = NOW + timedelta(days=179)
    assert store.login_mailbox(observed, "stale") is None
    public = store.mailbox_security(ADDRESS)
    assert public["password_hash"] is None
    assert public["generation"] == 2
    assert store.mailbox_security(ADDRESS) == public
    assert store.mailbox_session("second") is None


@pytest.mark.parametrize("mutation", ["reset", "remove", "expiry"])
def test_verified_login_cannot_overwrite_mutation(tmp_path, mutation):
    clock = [NOW]
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: clock[0])
    store.mutate_mailbox(store.mailbox_security(ADDRESS), "old", "first")
    observed = store.mailbox_security(ADDRESS)
    if mutation == "expiry":
        clock[0] += timedelta(days=90)
    else:
        store.mutate_mailbox(observed, "new" if mutation == "reset" else None)
    assert store.login_mailbox(observed, "stale") is None
    assert store.mailbox_session("first") is None
    assert store.mailbox_session("stale") is None
    assert store.mailbox_security(ADDRESS)["generation"] == 2


def test_concurrent_expiry_and_reopen_preserve_tombstones(tmp_path):
    clock = [NOW]
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: clock[0])
    store.mutate_mailbox(store.mailbox_security(ADDRESS), "encoded")
    clock[0] += timedelta(days=90)
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda _: store.mailbox_security(ADDRESS), range(4)))
    assert {result["generation"] for result in results} == {2}
    reopened = StateStore(store.path, clock=lambda: clock[0])
    assert reopened.mailbox_security(ADDRESS) == results[0]
    assert reopened.mutate_mailbox(results[0], "new")["generation"] == 3


def test_admin_parent_is_checked_at_commit_and_read(tmp_path):
    clock = [NOW]
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: clock[0])
    observed = store.mailbox_security(ADDRESS)
    store.create_admin_session("parent", "csrf", NOW + timedelta(hours=12))
    session = store.admin_mailbox_session(observed, "child", "parent")
    assert session["elevated"]
    assert store.mailbox_session("child")
    assert store.mailbox_security(ADDRESS) == observed
    store.delete_admin_session("parent")
    assert store.mailbox_session("child") is None
    with pytest.raises(ValueError):
        store.mutate_mailbox(observed, "new", admin_session_hash="parent")
    with pytest.raises(ValueError):
        store.admin_mailbox_session(observed, "another-child", "parent")
    store.create_admin_session("parent", "csrf", NOW)
    with pytest.raises(ValueError):
        store.mutate_mailbox(observed, None, admin_session_hash="parent")
    assert store.mailbox_security(ADDRESS) == observed


def test_hash_cost_upgrade_does_not_revoke_sessions(tmp_path):
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: NOW)
    store.mutate_mailbox(store.mailbox_security(ADDRESS), "old-cost", "first")
    observed = store.mailbox_security(ADDRESS)
    assert store.login_mailbox(observed, "second", upgraded_hash="new-cost")
    assert store.mailbox_security(ADDRESS)["generation"] == observed["generation"]
    assert store.mailbox_session("first")
    assert store.mailbox_session("second")


def test_expired_session_cleanup_is_bounded_and_indexed(tmp_path):
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: NOW)
    with sqlite3.connect(store.path) as conn:
        conn.executemany("INSERT INTO mailbox_sessions VALUES (?,?,?,?,?,?)", [
            (str(i), ADDRESS, 0, (NOW - timedelta(days=1)).isoformat(), 0, None)
            for i in range(150)
        ])
        assert any(row[1] == "mailbox_sessions_expires_at"
                   for row in conn.execute("PRAGMA index_list(mailbox_sessions)"))
    assert store.mailbox_session("missing") is None
    with sqlite3.connect(store.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM mailbox_sessions").fetchone()[0] == 50


def _start_store(path):
    store = StateStore(path)
    return store.backup_path


def test_existing_wal_database_backup_and_concurrent_startup(tmp_path):
    path = str(tmp_path / "state.db")
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE preserved (value TEXT)")
        conn.execute("INSERT INTO preserved VALUES ('keep me')")
        conn.commit()
        with multiprocessing.get_context("fork").Pool(3) as pool:
            backups = list(pool.map(_start_store, [path] * 3))
        backups = [backup for backup in backups if backup]
        assert len(backups) == 1
        with sqlite3.connect(backups[0]) as backup:
            assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert backup.execute("SELECT value FROM preserved").fetchone()[0] == "keep me"
            assert backup.execute("PRAGMA user_version").fetchone()[0] == 0
        assert conn.execute("SELECT value FROM preserved").fetchone()[0] == "keep me"
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
        assert conn.execute("SELECT name FROM sqlite_master WHERE name=?",
                            ("mailbox_sessions_expires_at",)).fetchone()
    assert StateStore(path).backup_path is None


def test_migration_failure_rolls_back_and_reentry_keeps_backups(tmp_path, monkeypatch):
    path = str(tmp_path / "state.db")
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE preserved (value TEXT)")
        conn.execute("INSERT INTO preserved VALUES ('keep me')")
    initialize = StateStore._initialize

    def fail(self, conn):
        initialize(self, conn)
        raise RuntimeError("interrupted migration")

    with monkeypatch.context() as scoped:
        scoped.setattr(StateStore, "_initialize", fail)
        with pytest.raises(RuntimeError):
            StateStore(path)
    previous = list(tmp_path.glob(".state-backup-*.sqlite3"))
    assert len(previous) == 1
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 0
        assert not conn.execute("SELECT name FROM sqlite_master WHERE name='mailbox_security'").fetchone()
    store = StateStore(path)
    assert len(list(tmp_path.glob(".state-backup-*.sqlite3"))) == 2
    assert str(previous[0]) != store.backup_path


def test_backup_failure_aborts_migration(tmp_path, monkeypatch):
    path = str(tmp_path / "state.db")
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE preserved (value TEXT)")
    monkeypatch.setattr("src.api_state.os.link", lambda *args: (_ for _ in ()).throw(OSError("full")))
    with pytest.raises(OSError):
        StateStore(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 0
        assert not conn.execute("SELECT name FROM sqlite_master WHERE name='mailbox_security'").fetchone()


def test_admin_access_and_activity_pruning_and_injected_clock(tmp_path):
    now = NOW
    store = StateStore(str(tmp_path / "state.db"), clock=lambda: now)
    expired = (now - timedelta(days=2)).isoformat()
    stale_activity = (now - timedelta(days=31)).isoformat()

    with sqlite3.connect(store.path) as conn:
        index_names = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")
        }
        assert {
            "admin_sessions_expires_at",
            "access_sessions_expires_at",
            "activity_kind_created_at",
            "activity_kind_id",
        }.issubset(index_names)

        conn.executemany(
            "INSERT INTO admin_sessions (token_hash, csrf_token, expires_at) VALUES (?, ?, ?)",
            [(f"adm-{i}", "csrf", expired) for i in range(130)],
        )
        conn.executemany(
            "INSERT INTO access_sessions (token_hash, expires_at) VALUES (?, ?)",
            [(f"acc-{i}", expired) for i in range(130)],
        )
        conn.execute(
            "INSERT INTO activity (kind, domain, detail, created_at) VALUES (?, ?, ?, ?)",
            ("sync_success", None, "2 domains", stale_activity),
        )
        conn.execute(
            "INSERT INTO activity (kind, domain, detail, created_at) VALUES (?, ?, ?, ?)",
            ("sync_failure", None, "TimeoutError", stale_activity),
        )
        conn.executemany(
            "INSERT INTO activity (kind, domain, detail, created_at) VALUES (?, ?, ?, ?)",
            [("domain_provisioned", f"d{i}.example", None, stale_activity) for i in range(120)],
        )

    assert store.get_admin_session("missing", now) is None
    assert store.get_access_session("missing", now) is False
    store.record_event("domain_provisioned", "fresh.example")

    with sqlite3.connect(store.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM admin_sessions").fetchone()[0] == 30
        assert conn.execute("SELECT COUNT(*) FROM access_sessions").fetchone()[0] == 30
        # 120 stale domain_provisioned - 100 pruned + 2 preserved sync rows + 1 fresh row = 23
        assert conn.execute("SELECT COUNT(*) FROM activity").fetchone()[0] == 23

    history = store.sync_history()
    assert history["lastSuccessfulSync"]["detail"] == "2 domains"
    assert history["lastSyncError"]["detail"] == "TimeoutError"

    summary = store.activity_summary()
    assert summary["domainsToday"] == 1
    assert summary["domainsSevenDays"] == 1
    assert summary["recentDomains"][0] == {
        "domain": "fresh.example",
        "created_at": now.isoformat(),
    }

