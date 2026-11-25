from datetime import datetime, timezone
import importlib.util
from pathlib import Path
from subprocess import CalledProcessError, CompletedProcess

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "deploy" / "sync-stalwart-certs.py"
_SPEC = importlib.util.spec_from_file_location("sync_stalwart_certs", SCRIPT_PATH)
assert _SPEC and _SPEC.loader
mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(mod)

NOW = datetime(2026, 11, 25, 4, 0, 0, tzinfo=timezone.utc)


def _settings(tmp_path: Path) -> dict[str, str]:
    return {
        "stalwart_cli": "/usr/bin/stalwart-cli",
        "stalwart_url": "http://127.0.0.1:8080",
        "stalwart_token": "test-token",
        "target_domain": "mail.tm-mails.com",
        "cert_path": str(tmp_path / "fullchain.pem"),
        "key_path": str(tmp_path / "privkey.pem"),
    }


def test_select_latest_cert_picks_newest_valid_and_skips_expired(monkeypatch, tmp_path):
    query_out = (
        "Id            Subject Alternative Names\n"
        "expired_id    *.mail.tm-mails.com, MAIL.TM-MAILS.COM\n"
        "other_id      *.tm-mails.com, tm-mails.com\n"
        "older_valid   *.mail.tm-mails.com, mail.tm-mails.com\n"
        "newest_valid  *.mail.tm-mails.com, mail.tm-mails.com\n"
    )
    cert_pems = {
        "expired_id": "-----BEGIN CERTIFICATE-----\nEXP\n-----END CERTIFICATE-----\n",
        "older_valid": "-----BEGIN CERTIFICATE-----\nMID\n-----END CERTIFICATE-----\n",
        "newest_valid": "-----BEGIN CERTIFICATE-----\nNEW\n-----END CERTIFICATE-----\n",
    }
    dates = {
        cert_pems["expired_id"].strip(): datetime(2026, 11, 25, 2, 26, 29, tzinfo=timezone.utc),
        cert_pems["older_valid"].strip(): datetime(2026, 12, 15, 0, 0, 0, tzinfo=timezone.utc),
        cert_pems["newest_valid"].strip(): datetime(2027, 1, 24, 1, 30, 14, tzinfo=timezone.utc),
    }

    def fake_cli(_settings_arg, *args):
        if args == ("query", "Certificate"):
            return CompletedProcess([], 0, stdout=query_out, stderr="")
        if args[:2] == ("get", "Certificate"):
            return CompletedProcess([], 0, stdout=cert_pems[args[2]], stderr="")
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(mod, "_cli", fake_cli)
    monkeypatch.setattr(mod, "_cert_not_after", lambda pem: dates[pem.strip()])

    selected = mod.select_latest_cert(_settings(tmp_path), now=NOW)
    assert selected is not None
    cert_id, cert_pem = selected
    assert cert_id == "newest_valid"
    assert "NEW" in cert_pem


def test_select_latest_cert_rejects_when_all_matching_certs_expired(monkeypatch, tmp_path):
    query_out = "Id\tSubject Alternative Names\nold_id\tmail.tm-mails.com\n"
    pem = "-----BEGIN CERTIFICATE-----\nEXP\n-----END CERTIFICATE-----\n"

    def fake_cli(_s, *args):
        if args == ("query", "Certificate"):
            return CompletedProcess([], 0, stdout=query_out, stderr="")
        return CompletedProcess([], 0, stdout=pem, stderr="")

    monkeypatch.setattr(mod, "_cli", fake_cli)
    monkeypatch.setattr(mod, "_cert_not_after", lambda _p: datetime(2026, 11, 25, 2, 0, 0, tzinfo=timezone.utc))

    assert mod.select_latest_cert(_settings(tmp_path), now=NOW) is None


def test_select_latest_cert_ignores_non_matching_domains(monkeypatch, tmp_path):
    query_out = (
        "Id            Subject Alternative Names\n"
        "wrong_id      *.tm-mails.com, tm-mails.com\n"
        "sub_id        other-mail.tm-mails.com\n"
    )
    monkeypatch.setattr(
        mod,
        "_cli",
        lambda _s, *args: CompletedProcess([], 0, stdout=query_out, stderr=""),
    )
    assert mod.select_latest_cert(_settings(tmp_path), now=NOW) is None


def test_cli_passes_token_via_env_not_argv(monkeypatch, tmp_path):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["env"] = kwargs["env"]
        captured["timeout"] = kwargs["timeout"]
        return CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(mod.subprocess, "run", fake_run)
    mod._cli(_settings(tmp_path), "query", "Certificate")

    assert "--api-key" not in captured["cmd"]
    assert "test-token" not in " ".join(captured["cmd"])
    assert captured["env"]["STALWART_TOKEN"] == "test-token"
    assert captured["env"]["STALWART_URL"] == "http://127.0.0.1:8080"
    assert captured["timeout"] == mod.SUBPROCESS_TIMEOUT_S


def test_cert_not_after_parses_locale_independently(monkeypatch):
    monkeypatch.setattr(
        mod.subprocess,
        "run",
        lambda *_a, **_kw: CompletedProcess([], 0, stdout=b"notAfter=Jan 24 01:30:14 2027 GMT\n", stderr=b""),
    )
    assert mod._cert_not_after("pem") == datetime(2027, 1, 24, 1, 30, 14, tzinfo=timezone.utc)


def test_find_matching_key_immune_to_stale_begin_header(monkeypatch):
    valid_key = (
        b"-----BEGIN PRIVATE KEY-----\n"
        b"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n"
        b"-----END PRIVATE KEY-----"
    )
    buf = b"garbage -----BEGIN PRIVATE KEY----- stale\x00\xff" + valid_key + b"trailing"

    monkeypatch.setattr(
        mod,
        "_pubkey_sha256_from_key",
        lambda raw: "expected-hash" if raw == valid_key else None,
    )
    assert mod._find_matching_key_in_bytes(buf, "expected-hash") == valid_key.decode("ascii")


def test_sync_skips_when_disk_cert_and_key_match(monkeypatch, tmp_path):
    settings = _settings(tmp_path)
    pem = "-----BEGIN CERTIFICATE-----\nCURRENT\n-----END CERTIFICATE-----\n"
    Path(settings["cert_path"]).write_text(pem, encoding="utf-8")
    Path(settings["key_path"]).write_text("matching-key\n", encoding="utf-8")

    monkeypatch.setattr(mod, "select_latest_cert", lambda _s: ("new_id", pem))
    monkeypatch.setattr(mod, "_pubkey_sha256_from_cert", lambda _p: "hash-abc")
    monkeypatch.setattr(mod, "_pubkey_sha256_from_key", lambda _k: "hash-abc")
    monkeypatch.setattr(
        mod,
        "_extract_matching_key_from_stalwart_mem",
        lambda _h: (_ for _ in ()).throw(AssertionError("should not scan memory")),
    )
    monkeypatch.setattr(
        mod.subprocess,
        "run",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("should not reload services")),
    )

    assert mod.sync_cert_and_key(settings) is True


def test_sync_writes_atomically_and_reloads_services(monkeypatch, tmp_path):
    settings = _settings(tmp_path)
    pem = "-----BEGIN CERTIFICATE-----\nNEW\n-----END CERTIFICATE-----\n"
    key = "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n"
    commands: list[list[str]] = []

    monkeypatch.setattr(mod, "select_latest_cert", lambda _s: ("new_id", pem))
    monkeypatch.setattr(mod, "_pubkey_sha256_from_cert", lambda _p: "hash-new")
    monkeypatch.setattr(mod, "_extract_matching_key_from_stalwart_mem", lambda _h: key)
    monkeypatch.setattr(mod.shutil, "chown", lambda *_a, **_kw: None)

    def fake_run(cmd, **_kw):
        commands.append(cmd)
        return CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(mod.subprocess, "run", fake_run)

    assert mod.sync_cert_and_key(settings) is True
    assert Path(settings["cert_path"]).read_text(encoding="utf-8") == pem
    assert Path(settings["key_path"]).read_text(encoding="utf-8") == key
    assert commands == [
        ["nginx", "-t"],
        ["systemctl", "reload", "nginx"],
        ["systemctl", "reload", "postfix"],
    ]


def test_sync_rolls_back_on_nginx_test_failure(monkeypatch, tmp_path):
    settings = _settings(tmp_path)
    old_pem = "-----BEGIN CERTIFICATE-----\nOLD\n-----END CERTIFICATE-----\n"
    old_key = "-----BEGIN PRIVATE KEY-----\nOLDKEY\n-----END PRIVATE KEY-----\n"
    new_pem = "-----BEGIN CERTIFICATE-----\nNEW\n-----END CERTIFICATE-----\n"
    new_key = "-----BEGIN PRIVATE KEY-----\nNEWKEY\n-----END PRIVATE KEY-----\n"
    Path(settings["cert_path"]).write_text(old_pem, encoding="utf-8")
    Path(settings["key_path"]).write_text(old_key, encoding="utf-8")

    monkeypatch.setattr(mod, "select_latest_cert", lambda _s: ("new_id", new_pem))
    monkeypatch.setattr(mod, "_pubkey_sha256_from_cert", lambda _p: "hash-new")
    monkeypatch.setattr(mod, "_pubkey_sha256_from_key", lambda _k: "hash-old")
    monkeypatch.setattr(mod, "_extract_matching_key_from_stalwart_mem", lambda _h: new_key)
    monkeypatch.setattr(mod.shutil, "chown", lambda *_a, **_kw: None)

    def fail_nginx(cmd, **_kw):
        if cmd == ["nginx", "-t"]:
            raise CalledProcessError(1, cmd)
        return CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(mod.subprocess, "run", fail_nginx)

    assert mod.sync_cert_and_key(settings) is False
    assert Path(settings["cert_path"]).read_text(encoding="utf-8") == old_pem
    assert Path(settings["key_path"]).read_text(encoding="utf-8") == old_key


def test_load_settings_falls_back_to_tmail_config_and_rejects_traversal(monkeypatch, tmp_path):
    cfg = tmp_path / "config.json"
    cfg.write_text('{"mx_hostname": "mx.example.com", "jmap_token": "tok-123"}', encoding="utf-8")
    monkeypatch.setenv("TMAIL_CONFIG", str(cfg))
    for key in ("STALWART_TOKEN", "TARGET_DOMAIN", "CERT_PATH", "KEY_PATH"):
        monkeypatch.setenv(key, "")

    s = mod.load_settings()
    assert s["target_domain"] == "mx.example.com"
    assert s["stalwart_token"] == "tok-123"
    assert s["cert_path"] == "/etc/ssl/certs/mx.example.com.fullchain.pem"
    assert s["key_path"] == "/etc/ssl/private/mx.example.com.privkey.pem"

    cfg.write_text('{"mx_hostname": "../../etc/cron.d/evil", "jmap_token": "tok-123"}', encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid TARGET_DOMAIN"):
        mod.load_settings()
