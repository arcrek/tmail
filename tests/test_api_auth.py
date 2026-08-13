import pytest
from unittest.mock import MagicMock

from src.api_auth import AddressToken, AddressValidationError, _domain_matches_rule, _domain_rule, active_domains, normalize_address
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
