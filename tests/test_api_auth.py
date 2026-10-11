import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from threading import Barrier
from unittest.mock import MagicMock

from argon2.exceptions import HashingError, InvalidHashError, VerificationError
import pytest

from src.api_auth import (
    AddressToken,
    AddressValidationError,
    MailboxAuth,
    MailboxConflict,
    PasswordBusy,
    PasswordServiceError,
    _domain_matches_rule,
    _domain_rule,
    active_domains,
    normalize_address,
    validate_password,
)
from src.api_state import StateStore
from src.domain_cache import DomainCache


def test_address_token_round_trip_and_tamper_rejection():
    signer = AddressToken("s" * 32)
    token = signer.issue("User@Example.com")
    assert signer.read(token) == ("user@example.com", False)
    with pytest.raises(ValueError):
        signer.read(token + "x")


def test_address_token_carries_elevated_flag():
    signer = AddressToken("s" * 32)
    token = signer.issue("user@example.com", elevated=True)
    assert signer.read(token) == ("user@example.com", True)


def test_normalize_address_applies_whitelist_and_forbidden_ids():
    settings = {"local_part_min": 3, "local_part_max": 32, "forbidden_ids": ["admin"]}
    assert normalize_address("User@Example.com", ["example.com"], settings) == "user@example.com"
    with pytest.raises(AddressValidationError):
        normalize_address("admin@example.com", ["example.com"], settings)
    with pytest.raises(AddressValidationError):
        normalize_address("user@other.com", ["example.com"], settings)


@pytest.mark.parametrize(("value", "expected"), [
    ("EXAMPLE.COM", "example.com"),
    ("*.Täst.example", "*.xn--tst-qla.example"),
])
def test_domain_rule_normalizes_exact_and_wildcard_values(value, expected):
    assert _domain_rule(value) == expected


@pytest.mark.parametrize("value", ["*", "*.", "a.*.example.com"])
def test_domain_rule_rejects_unsupported_wildcards(value):
    with pytest.raises(AddressValidationError):
        _domain_rule(value)


def test_domain_rule_matches_only_the_base_and_subdomains():
    assert _domain_matches_rule("thesunk.edu.vn", "*.thesunk.edu.vn")
    assert _domain_matches_rule("mail.thesunk.edu.vn", "*.thesunk.edu.vn")
    assert not _domain_matches_rule("notthesunk.edu.vn", "*.thesunk.edu.vn")
    assert not _domain_matches_rule("mail.thesunk.edu.vn", "thesunk.edu.vn")


def test_active_domains_unions_manual_domains_with_each_source(tmp_path):
    cache = tmp_path / "domains.json"
    cache.write_text('["live.example"]')
    state = StateStore(str(tmp_path / "state.db"))
    state.update_settings({"manual_domains": ["Manual.example", "live.example"]})
    assert active_domains(str(cache), state) == ["live.example", "manual.example"]
    state.replace_frozen_domains(["frozen.example"])
    state.update_settings({"auto_sync_domains": False})
    assert active_domains(str(cache), state) == ["frozen.example", "live.example", "manual.example"]


def test_auto_sync_reuses_last_valid_long_lived_cache_snapshot(tmp_path):
    path = tmp_path / "domains.json"
    path.write_text('["live.example"]')
    cache = DomainCache(str(path))
    cache.load()
    state = StateStore(str(tmp_path / "state.db"))

    path.write_text("corrupt")

    assert active_domains(cache, state) == ["live.example"]


def test_auto_sync_retains_snapshot_when_refresh_lock_fails_then_retries(
    tmp_path, monkeypatch
):
    path = tmp_path / "domains.json"
    path.write_text('["old.example"]')
    cache = DomainCache(str(path))
    cache.load()
    state = StateStore(str(tmp_path / "state.db"))
    authoritative = DomainCache(str(path))
    authoritative.load()
    authoritative.replace(["new.example"])

    with monkeypatch.context() as scoped:
        scoped.setattr(
            "src.domain_cache.fcntl.flock",
            MagicMock(side_effect=PermissionError("lock denied")),
        )
        assert active_domains(cache, state) == ["old.example"]

    assert active_domains(cache, state) == ["new.example"]


def test_auto_sync_falls_back_to_frozen_domains_when_cache_empty(tmp_path):
    path = tmp_path / "domains.json"
    cache = DomainCache(str(path))
    state = StateStore(str(tmp_path / "state.db"))
    state.replace_frozen_domains(["frozen.example"])
    state.update_settings({"auto_sync_domains": True})

    assert active_domains(cache, state) == ["frozen.example"]

@pytest.fixture
def mailbox(tmp_path):
    clock = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    state = StateStore(str(tmp_path / "state.db"), clock=lambda: clock[0])
    return MailboxAuth(state, AddressToken("s" * 32)), clock


@pytest.mark.parametrize("password", [None, 123, b"a" * 12, "a" * 11, "a" * 129])
def test_password_type_and_length_limits(password):
    with pytest.raises(ValueError):
        validate_password(password)


@pytest.mark.parametrize("password", [" " * 12, "🔒" * 128, "  mật khẩu  🔒  "])
def test_exact_unicode_and_space_passwords(mailbox, password):
    auth, clock = mailbox
    token = auth.set_password("user@example.com", password)
    encoded = auth.state.mailbox_security("user@example.com")["password_hash"]
    assert encoded.startswith("$argon2id$v=19$m=32768,t=2,p=1$")
    assert auth.resolve(token)["kind"] == "visitor"
    assert auth.resolve(auth.login("user@example.com", password))["kind"] == "visitor"
    with pytest.raises(ValueError):
        auth.login("user@example.com", password + "x")
    with auth.state._connect() as conn:
        hashes = [row[0] for row in conn.execute("SELECT token_hash FROM mailbox_sessions")]
    assert token not in hashes
    assert auth.token_hash(token) in hashes


def test_password_lifecycle_revokes_tokens_and_logout_preserves_other_devices(mailbox):
    auth, clock = mailbox
    address = "user@example.com"
    public = auth.public_token(address)
    first = auth.set_password(address, "first password")
    with pytest.raises(ValueError):
        auth.resolve(public)
    second = auth.login(address, "first password")
    auth.logout(first)
    with pytest.raises(ValueError):
        auth.resolve(first)
    assert auth.resolve(second)
    changed = auth.set_password(address, "second password", "first password")
    with pytest.raises(ValueError):
        auth.resolve(second)
    with pytest.raises(ValueError):
        auth.remove_password(address, "first password")
    public_again = auth.remove_password(address, "second password")
    with pytest.raises(ValueError):
        auth.resolve(changed)
    with pytest.raises(ValueError):
        auth.resolve(public)
    assert auth.resolve(public_again)["generation"] == 3
    reclaimed = auth.set_password(address, "third password")
    with pytest.raises(ValueError):
        auth.resolve(public_again)
    assert auth.resolve(reclaimed)["generation"] == 4


def test_failed_login_and_token_reads_never_renew(mailbox):
    auth, clock = mailbox
    address = "user@example.com"
    first = auth.set_password(address, "first password")
    initial = auth.state.mailbox_security(address)
    clock[0] += timedelta(days=89)
    with pytest.raises(ValueError):
        auth.login(address, "wrong password")
    assert auth.resolve(first)
    assert auth.state.mailbox_security(address) == initial
    clock[0] += timedelta(days=1)
    with pytest.raises(ValueError):
        auth.resolve(first)
    public = auth.login(address, "first password")
    assert auth.resolve(public)["kind"] == "public"
    assert auth.state.mailbox_security(address)["password_hash"] is None
    assert auth.state.mailbox_security(address)["generation"] == 2


@pytest.mark.parametrize("elevated", [False, True])
def test_password_lifecycle_preserves_domain_elevation(mailbox, elevated):
    auth, _ = mailbox
    address = "user@blocked.example"
    auth.state.update_settings({"blacklisted_domains": ["blocked.example"]})
    public = auth.login(address, elevated=elevated)
    assert auth.resolve(public)["elevated"] is elevated
    claimed = auth.set_password(address, "first password", elevated=elevated)
    assert auth.resolve(claimed)["elevated"] is elevated
    with pytest.raises(ValueError, match="Mailbox password required"):
        auth.login(address, elevated=True)
    with pytest.raises(ValueError, match="Invalid mailbox credentials"):
        auth.login(address, "wrong password", elevated=True)
    logged_in = auth.login(address, "first password", elevated=elevated)
    assert auth.resolve(logged_in)["elevated"] is elevated
    for action in (auth.set_password, auth.remove_password):
        with pytest.raises(ValueError):
            if action == auth.set_password:
                action(address, "second password", "wrong password", elevated=True)
            else:
                action(address, "wrong password", elevated=True)
    changed = auth.set_password(address, "second password", "first password",
                                elevated=elevated)
    assert auth.resolve(changed)["elevated"] is elevated
    removed = auth.remove_password(address, "second password", elevated=elevated)
    assert auth.resolve(removed)["elevated"] is elevated


def _legacy_token(version, address="user@example.com"):
    payload = {"address": address, "v": version}
    if version == 2:
        payload["elevated"] = True
    data = json.dumps(payload).encode()
    signature = hmac.new(b"s" * 32, data, hashlib.sha256).digest()
    return ".".join(base64.urlsafe_b64encode(part).rstrip(b"=").decode()
                    for part in (data, signature))


@pytest.mark.parametrize("version", [1, 2])
def test_legacy_tokens_only_work_for_never_protected_addresses(mailbox, version):
    auth, clock = mailbox
    legacy = _legacy_token(version)
    assert auth.resolve(legacy)["kind"] == "public"
    auth.set_password("user@example.com", "first password")
    with pytest.raises(ValueError):
        auth.resolve(legacy)
    auth.remove_password("user@example.com", "first password")
    with pytest.raises(ValueError):
        auth.resolve(legacy)
    assert auth.resolve(_legacy_token(version, "other@example.com"))


def test_v3_generation_validation_and_tuple_compatibility():
    signer = AddressToken("s" * 32)
    token = signer.issue("user@example.com", generation=7)
    assert signer.read(token) == ("user@example.com", False)
    assert signer.read_claims(token) == ("user@example.com", False, 7)
    for value in (-1, True, "0"):
        with pytest.raises(ValueError):
            signer.issue("user@example.com", generation=value)


def test_admin_reset_removal_and_parent_bound_tokens(mailbox):
    auth, clock = mailbox
    address = "user@example.com"
    auth.state.create_admin_session("parent", "csrf", clock[0] + timedelta(hours=12))
    public_admin = auth.admin_token(address, "parent")
    assert auth.resolve(public_admin)["kind"] == "admin"
    assert auth.set_password(address, "first password", admin_session_hash="parent") is None
    with pytest.raises(ValueError):
        auth.resolve(public_admin)
    visitor = auth.login(address, "first password")
    admin = auth.admin_token(address, "parent")
    initial = auth.state.mailbox_security(address)
    assert auth.resolve(admin)["elevated"]
    assert auth.state.mailbox_security(address) == initial
    auth.state.delete_admin_session("parent")
    with pytest.raises(ValueError):
        auth.resolve(admin)
    assert auth.resolve(visitor)
    auth.state.create_admin_session("parent", "csrf", clock[0] + timedelta(hours=12))
    fresh = auth.admin_token(address, "parent")
    clock[0] += timedelta(hours=12)
    with pytest.raises(ValueError):
        auth.resolve(fresh)
    auth.state.create_admin_session("parent", "csrf", clock[0] + timedelta(hours=12))
    public = auth.remove_password(address, admin_session_hash="parent")
    with pytest.raises(ValueError):
        auth.resolve(visitor)
    assert auth.resolve(public)["kind"] == "public"


@pytest.mark.parametrize("error", [InvalidHashError, VerificationError, UnicodeError])
def test_hash_and_invalid_hash_failures_are_sanitized(mailbox, monkeypatch, error):
    auth, clock = mailbox
    hasher = MagicMock()
    hasher.hash.side_effect = HashingError("private password value")
    monkeypatch.setattr("src.api_auth._PASSWORD_HASHER", hasher)
    with pytest.raises(PasswordServiceError, match="^Password service unavailable$"):
        auth.set_password("user@example.com", "first password")
    assert auth.state.mailbox_security("user@example.com")["generation"] == 0
    auth.state.mutate_mailbox(auth.state.mailbox_security("user@example.com"), "corrupt")
    hasher.verify.side_effect = error("private hash value")
    initial = auth.state.mailbox_security("user@example.com")
    with pytest.raises(PasswordServiceError, match="^Password service unavailable$"):
        auth.login("user@example.com", "first password")
    assert auth.state.mailbox_security("user@example.com") == initial
    from src.api_auth import _HASH_SLOTS
    assert _HASH_SLOTS.acquire(False)
    try:
        assert _HASH_SLOTS.acquire(False)
        _HASH_SLOTS.release()
    finally:
        _HASH_SLOTS.release()


def test_hash_capacity_is_bounded_and_released(mailbox, monkeypatch):
    auth, clock = mailbox
    from threading import BoundedSemaphore
    slots = BoundedSemaphore(2)
    monkeypatch.setattr("src.api_auth._HASH_SLOTS", slots)
    assert slots.acquire(False) and slots.acquire(False)
    with pytest.raises(PasswordBusy):
        auth.set_password("user@example.com", "first password")
    slots.release()
    slots.release()
    auth.set_password("user@example.com", "first password")
    with pytest.raises(ValueError):
        auth.login("user@example.com", "wrong password")
    assert slots.acquire(False) and slots.acquire(False)


def test_real_concurrent_password_claim_and_login(mailbox, monkeypatch):
    auth, clock = mailbox
    address = "user@example.com"
    barrier = Barrier(2)
    hash_password = auth._hash

    def synchronized_hash(password):
        result = hash_password(password)
        barrier.wait()
        return result

    monkeypatch.setattr(auth, "_hash", synchronized_hash)

    def claim(_):
        try:
            return auth.set_password(address, "first password")
        except MailboxConflict:
            return None

    with ThreadPoolExecutor(2) as pool:
        claims = list(pool.map(claim, range(2)))
    assert sum(token is not None for token in claims) == 1
    verify = auth._verify

    def synchronized_verify(encoded, password):
        verify(encoded, password)
        barrier.wait()

    monkeypatch.setattr(auth, "_verify", synchronized_verify)
    with ThreadPoolExecutor(2) as pool:
        logins = list(pool.map(lambda _: auth.login(address, "first password"), range(2)))
    assert all(auth.resolve(token) for token in logins)
    assert auth.resolve(next(token for token in claims if token))


def test_stale_password_verification_cannot_change_or_remove(mailbox, monkeypatch):
    auth, clock = mailbox
    address = "user@example.com"
    auth.set_password(address, "first password")
    verify = auth._verify

    def reset_during_verify(encoded, password):
        verify(encoded, password)
        observed = auth.state.mailbox_security(address)
        auth.state.mutate_mailbox(observed, "replacement")

    monkeypatch.setattr(auth, "_verify", reset_during_verify)
    with pytest.raises(MailboxConflict):
        auth.remove_password(address, "first password")
    assert auth.state.mailbox_security(address)["password_hash"] == "replacement"


def test_database_failures_do_not_become_public_access(mailbox, monkeypatch):
    auth, clock = mailbox
    import sqlite3
    monkeypatch.setattr(auth.state, "mailbox_security",
                        MagicMock(side_effect=sqlite3.OperationalError("unavailable")))
    with pytest.raises(sqlite3.OperationalError):
        auth.public_token("user@example.com")


def test_concurrent_logins_during_transparent_hash_upgrade(mailbox, monkeypatch):
    from argon2 import PasswordHasher
    auth, clock = mailbox
    address = "user@example.com"
    old = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1).hash("first password")
    auth.state.mutate_mailbox(auth.state.mailbox_security(address), old, "prior-device")
    barrier = Barrier(2)
    verify = auth._verify

    def synchronized_upgrade(encoded, password):
        result = verify(encoded, password)
        if encoded == old:
            barrier.wait()
        return result

    monkeypatch.setattr(auth, "_verify", synchronized_upgrade)
    with ThreadPoolExecutor(2) as pool:
        tokens = list(pool.map(lambda _: auth.login(address, "first password", elevated=True), range(2)))
    assert all(auth.resolve(token) for token in tokens)
    assert all(auth.resolve(token)["elevated"] for token in tokens)
    assert auth.state.mailbox_session("prior-device")
    security = auth.state.mailbox_security(address)
    assert security["generation"] == 1
    assert security["password_hash"] != old
    assert "$m=32768,t=2,p=1$" in security["password_hash"]
