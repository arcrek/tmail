from __future__ import annotations

from contextlib import nullcontext
import gzip
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


spec = importlib.util.spec_from_file_location("setup_mail", Path(__file__).parents[1] / "deploy/setup-mail.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def test_internal_exception_preserves_existing_authentication_branches():
    old = {"match": {"0": {"if": "local_port == 587", "then": "true"}}, "else": "local_port != 25"}
    new = setup.internal_auth_rule(old)
    assert new["match"]["0"] == {"if": setup.GUARD, "then": "false"}
    assert new["match"]["1"] == old["match"]["0"]
    assert new["else"] == old["else"]
    assert len(old["match"]) == 1
    assert setup.internal_auth_rule(new) == new

    old_spam = {"match": {}, "else": "is_empty(authenticated_as)"}
    new_spam = setup.internal_spam_rule(old_spam)
    assert new_spam["match"]["0"] == {"if": setup.GUARD, "then": "false"}
    assert setup.internal_spam_rule(new_spam) == new_spam

    old_dkim = {"match": {}, "else": "relaxed"}
    new_dkim = setup.internal_dkim_rule(old_dkim)
    assert new_dkim["match"]["0"] == {"if": setup.GUARD, "then": "disable"}
    assert setup.internal_dkim_rule(new_dkim) == new_dkim


def test_recipient_policy_preserves_custom_rejections_and_allowlist_order():
    current = "permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination, reject_rbl_client zen.spamhaus.org"
    merged = setup.merge_recipient_restrictions(current)
    assert merged == f"{current}, {setup.POLICY_CHECK}, reject"
    assert setup.merge_recipient_restrictions(merged) == merged


@pytest.mark.parametrize("current", ["check_recipient_access hash:/etc/postfix/access", "permit",
    "warn_if_reject reject_rbl_client zen.spamhaus.org", "$recipient_policy",
    f"permit_mynetworks, {setup.POLICY_CHECK}, reject_rbl_client zen.spamhaus.org, reject"])
def test_unknown_or_bypassed_recipient_policy_stops_safely(current):
    with pytest.raises(setup.SetupError):
        setup.merge_recipient_restrictions(current)


@pytest.mark.parametrize("rule", [None, {}, {"else": False}, {"else": "true", "unknown": 1},
                                    {"else": "true", "match": {"2": {"if": "true", "then": "false"}}}])
def test_unknown_authentication_rules_fail_closed(rule):
    with pytest.raises(setup.SetupError):
        setup.internal_auth_rule(rule)


def container(running=True):
    return {"Name": "/tmail-api-1", "Config": {"Labels": {"com.docker.compose.service": "api"},
            "Env": ["TMAIL_CONFIG=/var/lib/tmail-policy/config.json"]},
            "State": {"Running": running, "Health": {"Status": "healthy"}}}


def test_owner_preserves_compose_and_fresh_systemd():
    disabled = {"active": False, "enabled": False}
    assert setup.web_owner(disabled, [container()], True) == ("compose", "tmail-api-1")
    assert setup.web_owner(disabled, [], False) == ("systemd", "")
    assert setup.web_owner({"active": True, "enabled": True}, [], True) == ("systemd", "")


@pytest.mark.parametrize("state,containers", [
    ({"active": True, "enabled": False}, [container()]),
    ({"active": False, "enabled": True}, [container()]),
    ({"active": False, "enabled": False}, [container(), container()]),
    ({"active": False, "enabled": False}, [container(False)]),
    ({"active": False, "enabled": False}, []),
])
def test_ambiguous_or_stopped_owner_fails_closed(state, containers):
    with pytest.raises(setup.SetupError):
        setup.web_owner(state, containers, True)


@pytest.mark.parametrize("bind,protocol", [("0.0.0.0:2525", "smtp"), ("[::]:2525", "smtp"),
                                          ("127.0.0.1:2525", "http"), ("127.0.0.1:25", "smtp")])
def test_unsafe_listener_is_rejected_without_connecting(monkeypatch, bind, protocol):
    monkeypatch.setattr(setup.socket, "create_connection", lambda *a, **k: pytest.fail("unsafe connection"))
    with pytest.raises(setup.SetupError):
        setup.check_listener([{"protocol": protocol, "bind": {bind: True}}])


def test_safe_listener_can_be_verified(monkeypatch):
    monkeypatch.setattr(setup.socket, "create_connection", lambda *a, **k: nullcontext())
    setup.check_listener([{"protocol": "smtp", "bind": {"127.0.0.1:2525": True}}])


def test_schema_response_supports_stalwart_gzip(monkeypatch):
    response = io.BytesIO(gzip.compress(json.dumps({"schema": "ReloadSettings"}).encode()))
    response.headers = {"Content-Encoding": "gzip"}
    monkeypatch.setattr(setup, "build_opener", lambda *a: SimpleNamespace(open=lambda *a, **k: response))
    client = object.__new__(setup.Management)
    client.token = "private-token"
    assert client.request("http://127.0.0.1/api/schema") == {"schema": "ReloadSettings"}


def test_jmap_error_is_rejected_even_with_http_success():
    client = object.__new__(setup.Management)
    client.api_url = "http://127.0.0.1/jmap"
    client.request = lambda *a: {"methodResponses": [["error", {"type": "unknownMethod"}, "setup"]]}
    with pytest.raises(setup.SetupError, match="unavailable or rejected"):
        client.call("x:MtaStageAuth/get", {"ids": ["singleton"]})


def test_redirect_never_sends_credentials_to_another_origin():
    request = setup.Request("https://mail.example.com/api/schema", headers={"Authorization": "Bearer private"})
    with pytest.raises(setup.SetupError, match="another origin"):
        setup.SameOriginRedirect().redirect_request(request, None, 302, "", {}, "https://other.example.com/schema")


def test_management_loopback_keeps_local_origin_when_session_advertises_public_hostname(monkeypatch):
    monkeypatch.setattr(setup.Management, "request", lambda self, url, payload=None: {
        "apiUrl": "https://mail.example.com/jmap/",
        "capabilities": {"urn:ietf:params:jmap:core": {}},
        "primaryAccounts": {"urn:stalwart:jmap": "b"},
    })
    client = setup.Management({"jmap_url": "http://127.0.0.1:8080/jmap/", "jmap_token": "secret"})
    assert client.api_url == "http://127.0.0.1:8080/jmap/"

    with pytest.raises(setup.SetupError, match="Unverified Stalwart JMAP API origin"):
        setup.Management({"jmap_url": "https://admin.example.com/jmap/", "jmap_token": "secret"})


def transaction(monkeypatch, tmp_path, fail_reload=False):
    old = {"else": "local_port != 25"}
    new = setup.internal_auth_rule(old)
    old_spam = {"else": "is_empty(authenticated_as)"}
    new_spam = setup.internal_spam_rule(old_spam)
    old_dkim = {"else": "relaxed"}
    new_dkim = setup.internal_dkim_rule(old_dkim)
    rule = [old, old_spam, old_dkim]
    calls = []

    class Client:
        def __init__(self, config):
            pass

        def auth(self):
            return rule[0], "state"

        def set_auth(self, value, state):
            assert state == "state"
            rule[0] = value
            calls.append("set-auth")

        def data_stage(self):
            return rule[1], "spam-state"

        def set_data_stage(self, value, state):
            assert state == "spam-state"
            rule[1] = value
            calls.append("set-spam")

        def sender_auth(self):
            return rule[2], "dkim-state"

        def set_sender_auth(self, value, state):
            assert state == "dkim-state"
            rule[2] = value
            calls.append("set-dkim")

        def reload(self):
            calls.append("reload")
            if fail_reload and rule[0] == new:
                raise setup.SetupError("reload failed")

    monkeypatch.setattr(setup, "Management", Client)
    monkeypatch.setattr(setup, "load_setup", lambda config: config)
    monkeypatch.setattr(setup, "run", lambda *args: calls.append(args) or "")
    config = {}
    plan = {"old_auth": old, "new_auth": new, "old_spam": old_spam, "new_spam": new_spam,
            "old_dkim": old_dkim, "new_dkim": new_dkim, "services": {}, "owner": "systemd", "container": ""}
    monkeypatch.setattr(setup, "detect_web_owner", lambda *a: ("systemd", ""))
    plan_path = tmp_path / "plan.json"
    target = tmp_path / "main.cf"
    target.write_bytes(b"previous config\n  continuation\n# comment\n")
    original = target.read_bytes()
    replacement = b"changed config\n  continuation\n# comment\n"
    (tmp_path / "backup").write_bytes(original)

    def prepare(config, plan, path):
        plan["files"] = [{"path": str(target), "old": setup.digest(original), "new": setup.digest(replacement),
                          "backup": "backup", "mode": 0o640, "uid": setup.os.getuid(), "gid": setup.os.getgid()}]
        setup.save_plan(path, plan)
        return {target: replacement}

    monkeypatch.setattr(setup, "prepare_files", prepare)
    return config, plan, plan_path, target, rule, calls, original


def test_apply_then_recover_restores_config_and_auth(monkeypatch, tmp_path):
    config, plan, path, target, rule, calls, original = transaction(monkeypatch, tmp_path)
    setup.apply(config, plan, path)
    assert target.read_bytes() != original
    assert rule == [plan["new_auth"], plan["new_spam"], plan["new_dkim"]]
    setup.restore(config, plan, path)
    assert target.read_bytes() == original
    assert rule == [plan["old_auth"], plan["old_spam"], plan["old_dkim"]]
    assert calls.count("reload") == 2


def test_failed_reload_still_restores_authentication(monkeypatch, tmp_path):
    config, plan, path, target, rule, calls, original = transaction(monkeypatch, tmp_path, fail_reload=True)
    with pytest.raises(setup.SetupError, match="reload failed"):
        setup.apply(config, plan, path)
    setup.restore(config, json.loads(path.read_text()), path)
    assert rule == [plan["old_auth"], plan["old_spam"], plan["old_dkim"]]
    assert target.read_bytes() == original


def test_recovery_preserves_concurrent_file_change(monkeypatch, tmp_path):
    config, plan, path, target, rule, calls, original = transaction(monkeypatch, tmp_path)
    setup.apply(config, plan, path)
    target.write_bytes(b"administrator edit")
    with pytest.raises(setup.SetupError, match="recovery incomplete"):
        setup.restore(config, plan, path)
    assert target.read_bytes() == b"administrator edit"
    assert (tmp_path / "backup").read_bytes() == original
    assert rule == [plan["old_auth"], plan["old_spam"], plan["old_dkim"]]


def test_recovery_preserves_concurrent_stalwart_change(monkeypatch, tmp_path):
    config, plan, path, target, rule, calls, original = transaction(monkeypatch, tmp_path)
    setup.apply(config, plan, path)
    rule[0] = {"else": "administrator expression"}
    with pytest.raises(setup.SetupError, match="Stalwart recovery incomplete"):
        setup.restore(config, plan, path)
    assert rule[0] == {"else": "administrator expression"}
    assert rule[1] == plan["old_spam"]
    assert rule[2] == plan["old_dkim"]
    assert target.read_bytes() == original


@pytest.mark.parametrize("problem", [None, "permissions", "schema", "listener"])
def test_preflight_is_read_only_and_rejects_incompatible_servers(monkeypatch, tmp_path, problem):
    (tmp_path / "index.html").write_text("built frontend")
    config = {"jmap_url": "http://127.0.0.1:8080/jmap", "jmap_token": "runtime-secret",
              "mx_hostname": "mail.example.com", "listen_addr": "127.0.0.1", "listen_port": 10030,
              "frontend_dist": str(tmp_path), "catchall_address": "catchall@example.com"}
    methods = []
    commands = []

    class Client:
        session = {"primaryAccounts": {"urn:ietf:params:jmap:mail": "account"}}
        url = config["jmap_url"]

        def __init__(self, config):
            pass

        def request(self, url):
            if url.endswith("/api/account"):
                return {"permissions": [] if problem == "permissions" else [
                    "sys-mta-stage-auth-get", "sys-mta-stage-auth-update",
                    "sys-mta-stage-data-get", "sys-mta-stage-data-update",
                    "sys-sender-auth-get", "sys-sender-auth-update",
                    "sys-network-listener-get", "sys-action-create", "action-reload-settings"]}
            return {"types": [] if problem == "schema" else [
                "MtaStageAuth", "MtaStageData", "SenderAuth", "NetworkListener", "ReloadSettings"]}

        def auth(self):
            methods.append("x:MtaStageAuth/get")
            return {"else": "local_port != 25"}, "state"

        def data_stage(self):
            methods.append("x:MtaStageData/get")
            return {"else": "is_empty(authenticated_as)"}, "spam-state"

        def sender_auth(self):
            methods.append("x:SenderAuth/get")
            return {"else": "relaxed"}, "dkim-state"

        def call(self, method, args, mail=False):
            methods.append(method)
            if method == "Email/query":
                return {"ids": []}
            return {"list": [{"protocol": "smtp", "bind": {
                "0.0.0.0:2525" if problem == "listener" else "127.0.0.1:2525": True}}]}

    def command(*args):
        commands.append(args)
        if args == ("postconf", "-m"):
            return "hash\npcre"
        if args[0] == "ss":
            return 'LISTEN 0 4096 127.0.0.1:2525 0.0.0.0:* users:(("stalwart",pid=123,fd=1))'
        return ""

    monkeypatch.setattr(setup, "Management", Client)
    monkeypatch.setattr(setup, "load_setup", lambda c: c)
    monkeypatch.setattr(setup, "run", command)
    monkeypatch.setattr(setup, "detect_web_owner", lambda *a: ("systemd", ""))
    monkeypatch.setattr(setup, "service_state", lambda *a: {"active": True, "enabled": True})
    monkeypatch.setattr(setup.socket, "create_connection", lambda *a, **k: nullcontext())
    real_path = setup.Path
    monkeypatch.setattr(setup, "Path", lambda p: tmp_path / "systemd" if str(p).startswith("/etc/systemd") else real_path(p))
    if problem:
        with pytest.raises(setup.SetupError):
            setup.preflight(config)
    else:
        plan = setup.preflight(config)
        assert plan["owner"] == "systemd"
        assert "runtime-secret" not in json.dumps(plan)
    assert all(not method.endswith("/set") for method in methods)
    assert all(args[0] != "systemctl" or args[1] == "show" for args in commands)
    assert (tmp_path / "index.html").read_text() == "built frontend"


def test_apply_rechecks_owner_before_mutations(monkeypatch, tmp_path):
    config, plan, path, target, rule, calls, original = transaction(monkeypatch, tmp_path)
    monkeypatch.setattr(setup, "detect_web_owner", lambda *a: ("compose", "tmail-api-1"))
    with pytest.raises(setup.SetupError, match="ownership changed"):
        setup.apply(config, plan, path)
    assert target.read_bytes() == original
    assert rule[0] == plan["old_auth"]
    assert calls == []


@pytest.mark.parametrize("delivered", [True, False])
def test_delivery_verification_requires_matching_message_in_jmap(monkeypatch, delivered):
    markers = []
    polls = []
    config = {"mx_hostname": "mail.example.com", "catchall_address": "catchall@example.com"}

    class SMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def sendmail(self, sender, recipients, message):
            assert sender == config["catchall_address"]
            assert recipients == [sender]
            markers.append(message.split("Message-ID: <", 1)[1].split(">", 1)[0])
            return {}

    class Client:
        def __init__(self, config):
            pass

        def call(self, method, args, mail=False):
            assert method == "Email/query" and mail
            assert args["filter"]["header"] == ["Message-ID", markers[0]]
            polls.append(args)
            return {"ids": ["delivered-message"] if delivered else []}

    monkeypatch.setattr(setup, "check_services", lambda *a: None)
    monkeypatch.setattr(setup, "Management", Client)
    monkeypatch.setattr(setup.smtplib, "SMTP", SMTP)
    monkeypatch.setattr(setup.time, "sleep", lambda *a: None)
    if delivered:
        setup.verify(config, {"mail_account": "account"})
    else:
        with pytest.raises(setup.SetupError, match="did not reach"):
            setup.verify(config, {"mail_account": "account"})
    assert len(markers) == 1
    assert len(polls) == (1 if delivered else 15)


@pytest.mark.parametrize("custom_map", [False, True])
def test_real_file_transaction_preserves_unrelated_lines_and_is_repeatable(monkeypatch, tmp_path, custom_map):
    host = tmp_path / "host"
    (host / "etc/postfix").mkdir(parents=True)
    main = host / "etc/postfix/main.cf"
    unrelated = "# repeated comment\n# repeated comment\ncustom_setting = first,\n  second,\n  third\n"
    main.write_text(unrelated)
    if custom_map:
        (host / "etc/postfix/accepted_domains").write_text("administrator domain map")
    real_path = setup.Path
    monkeypatch.setattr(setup, "Path", lambda p: host / str(p).lstrip("/") if str(p).startswith("/etc/") else real_path(p))
    monkeypatch.setattr(setup, "detect_web_owner", lambda *a: ("systemd", ""))
    rule = setup.internal_auth_rule({"else": "local_port != 25"})

    class Client:
        def __init__(self, config):
            pass

        def auth(self):
            return rule, "state"

        def set_auth(self, *a):
            pytest.fail("unchanged authentication must not be written")

        def reload(self):
            pytest.fail("unchanged authentication must not be reloaded")

    monkeypatch.setattr(setup, "Management", Client)
    monkeypatch.setattr(setup, "load_setup", lambda c: c)
    commands = []

    def command(*args):
        commands.append(args)
        if args[0] == "postconf":
            staged_main = real_path(args[2]) / "main.cf"
            text = staged_main.read_text()
            if args[3] == "-h":
                values = dict(line.split(" = ", 1) for line in text.splitlines() if " = " in line)
                return values.get(args[4], "")
            assert args[3] == "-e"
            staged_main.write_text(text + "\n".join(args[4:]) + "\n")
        return ""

    monkeypatch.setattr(setup, "run", command)
    config = {"mx_hostname": "mail.example.com"}
    for number in range(2):
        backup = tmp_path / f"backup-{number}"
        backup.mkdir(mode=0o700)
        plan = {"old_auth": rule, "new_auth": rule, "services": {},
                "owner": "systemd", "container": "", "stalwart_conflicts": []}
        values = dict(line.split(" = ", 1) for line in main.read_text().splitlines() if " = " in line)
        current = values.get("smtpd_recipient_restrictions", "")
        plan["recipient_restrictions"] = current
        plan["new_recipient_restrictions"] = setup.merge_recipient_restrictions(current)
        before = main.stat().st_mtime_ns
        if custom_map:
            with pytest.raises(setup.SetupError, match="Custom accepted_domains"):
                setup.apply(config, plan, backup / "plan.json")
            assert main.read_text() == unrelated
            assert (host / "etc/postfix/accepted_domains").read_text() == "administrator domain map"
            return
        setup.apply(config, plan, backup / "plan.json")
        assert main.read_text().startswith(unrelated)
        if number == 0:
            assert (backup / "file-0").read_text() == unrelated
        else:
            assert plan["files"] == []
            assert main.stat().st_mtime_ns == before
    assert len([args for args in commands if args[0] == "postconf" and "-e" in args]) == 1


def test_release_asset_validation_rejects_empty_fresh_systemd_stage(tmp_path):
    release = tmp_path / "live"
    stage = tmp_path / "stage"
    config = {"frontend_dist": str(release / "frontend/dist")}
    with pytest.raises(setup.SetupError, match="no frontend"):
        setup.validate_release_assets(config, "systemd", stage, release)
    setup.validate_release_assets(config, "compose", stage, release)
    (stage / "frontend/dist").mkdir(parents=True)
    (stage / "frontend/dist/index.html").write_text("built")
    setup.validate_release_assets(config, "systemd", stage, release)


def test_external_relative_frontend_is_resolved_from_runtime_config_directory(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("TMAIL_CONFIG_DIR", str(runtime))
    config = {"frontend_dist": "assets"}
    with pytest.raises(setup.SetupError, match="no frontend"):
        setup.validate_release_assets(config, "systemd", tmp_path / "stage", tmp_path / "live")
    (runtime / "assets").mkdir(parents=True)
    (runtime / "assets/index.html").write_text("built")
    setup.validate_release_assets(config, "systemd", tmp_path / "stage", tmp_path / "live")


def test_root_reads_mutable_runtime_config_as_service_user(monkeypatch, tmp_path):
    monkeypatch.setenv("TMAIL_CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(setup.os, "geteuid", lambda: 0)
    calls = []
    def read(*args):
        calls.append(args)
        return '{"frontend_dist":"assets"}'
    monkeypatch.setattr(setup, "run", read)
    assert setup.read_config(tmp_path / "config.json") == {"frontend_dist": "assets"}
    assert calls == [("runuser", "-u", "tmail-policy", "--", "cat", "--", str(tmp_path / "config.json"))]


def test_apply_resolves_accepted_domains_from_script_dir_outside_repo_cwd(monkeypatch, tmp_path):
    outside = tmp_path / "outside-cwd"
    outside.mkdir()
    monkeypatch.chdir(outside)
    test_real_file_transaction_preserves_unrelated_lines_and_is_repeatable(monkeypatch, tmp_path, False)
    assert (tmp_path / "host/etc/postfix/accepted_domains").exists()


