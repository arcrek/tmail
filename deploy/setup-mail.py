#!/usr/bin/env python3
"""Fail-closed mail setup and verification; credentials never enter the journal."""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import shutil
import smtplib
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class SetupError(RuntimeError):
    pass


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise SetupError(f"Command failed: {args[0]} {args[1] if len(args) > 1 else ''}")
    return result.stdout.strip()


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if origin(req.full_url) != origin(newurl):
            raise SetupError("Stalwart redirected to another origin")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def origin(url):
    parts = urlsplit(url)
    return parts.scheme, parts.hostname, parts.port


class Management:
    def __init__(self, config):
        self.url = config["jmap_url"]
        parts = urlsplit(self.url)
        if parts.username or parts.password or parts.scheme not in {"http", "https"}:
            raise SetupError("Invalid Stalwart URL")
        if parts.scheme == "http" and parts.hostname not in {"127.0.0.1", "::1", "localhost"}:
            raise SetupError("Remote Stalwart credentials require HTTPS")
        self.token = config["jmap_token"]
        self.session = self.request(urljoin(self.url, "/.well-known/jmap"))
        self.api_url = self.session.get("apiUrl")
        if not isinstance(self.api_url, str) or origin(self.api_url) != origin(self.url):
            raise SetupError("Unverified Stalwart JMAP API origin")
        if "urn:stalwart:jmap" not in self.session.get("capabilities", {}):
            raise SetupError("Stalwart management JMAP is unsupported")

    def request(self, url, payload=None):
        try:
            req = Request(url, data=None if payload is None else json.dumps(payload).encode(),
                          headers={"Authorization": f"Bearer {self.token}",
                                   "Content-Type": "application/json"})
            with build_opener(SameOriginRedirect()).open(req, timeout=15) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except SetupError:
            raise
        except Exception:
            raise SetupError("Stalwart request failed or returned an unsupported response") from None

    def call(self, method, args, mail=False):
        using = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail" if mail else "urn:stalwart:jmap"]
        data = self.request(self.api_url, {"using": using, "methodCalls": [[method, args, "setup"]]})
        responses = data.get("methodResponses")
        if (not isinstance(responses, list) or len(responses) != 1
                or not isinstance(responses[0], list) or len(responses[0]) != 3
                or responses[0][0] != method or responses[0][2] != "setup"
                or not isinstance(responses[0][1], dict)):
            raise SetupError(f"Stalwart method unavailable or rejected: {method}")
        return responses[0][1]

    def auth(self):
        data = self.call("x:MtaStageAuth/get", {"ids": ["singleton"]})
        values = data.get("list")
        if not isinstance(values, list) or len(values) != 1 or values[0].get("id") != "singleton":
            raise SetupError("Unsupported Stalwart authentication response")
        return values[0]["require"], data["state"]

    def set_auth(self, rule, state):
        data = self.call("x:MtaStageAuth/set", {
            "ifInState": state, "update": {"singleton": {"require": rule}}})
        if "singleton" not in data.get("updated", {}):
            raise SetupError("Stalwart authentication update was rejected")

    def reload(self):
        data = self.call("x:Action/set", {"create": {"reload": {"@type": "ReloadSettings"}}})
        if not data.get("created", {}).get("reload", {}).get("id"):
            raise SetupError("Stalwart settings reload was rejected")


GUARD = "local_port == 2525 && remote_ip == '127.0.0.1'"
POLICY_CHECK = "check_policy_service inet:127.0.0.1:10030"


def merge_recipient_restrictions(current):
    """Keep supported checks in order; policy OK must not bypass later checks."""
    single = {
        "permit_mynetworks", "permit_sasl_authenticated", "reject_unauth_destination",
        "defer_unauth_destination", "reject_non_fqdn_recipient", "reject_unknown_recipient_domain",
        "reject_non_fqdn_sender", "reject_unknown_sender_domain", "reject_invalid_helo_hostname",
        "reject_non_fqdn_helo_hostname", "reject_unknown_helo_hostname", "reject_unknown_client_hostname",
        "reject_unknown_reverse_client_hostname", "reject_unauth_pipelining", "reject_unlisted_recipient",
        "reject_unlisted_sender", "reject_authenticated_sender_login_mismatch", "reject_plaintext_session",
    }
    with_domain = {"reject_rbl_client", "reject_rhsbl_client", "reject_rhsbl_reverse_client",
                   "reject_rhsbl_helo", "reject_rhsbl_sender", "reject_rhsbl_recipient"}
    tokens = re.split(r"[\s,]+", current.strip()) if current.strip() else []
    restrictions = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in single or token == "reject":
            restrictions.append(token)
        elif token in with_domain and index + 1 < len(tokens) and re.fullmatch(r"[A-Za-z0-9._=:-]+", tokens[index + 1]):
            index += 1
            restrictions.append(f"{token} {tokens[index]}")
        elif token == "check_policy_service" and index + 1 < len(tokens) and tokens[index + 1] == "inet:127.0.0.1:10030":
            index += 1
            restrictions.append(POLICY_CHECK)
        else:
            raise SetupError("Custom Postfix recipient restrictions cannot be merged safely")
        index += 1
    if "reject" in restrictions[:-1] or restrictions.count(POLICY_CHECK) > 1:
        raise SetupError("Custom Postfix recipient restriction order requires inspection")
    if restrictions and restrictions[-1] == "reject":
        restrictions.pop()
    if POLICY_CHECK in restrictions and restrictions[-1] != POLICY_CHECK:
        raise SetupError("Postfix policy check would bypass later restrictions; inspect its order")
    if not restrictions:
        restrictions.append("permit_mynetworks")
    if POLICY_CHECK not in restrictions:
        restrictions.append(POLICY_CHECK)
    return ", ".join([*restrictions, "reject"])


def internal_auth_rule(rule):
    if not isinstance(rule, dict) or set(rule) - {"match", "else"} or not isinstance(rule.get("else"), str):
        raise SetupError("Unsupported custom authentication expression")
    matches = rule.get("match", {})
    if not isinstance(matches, dict) or list(matches) != [str(i) for i in range(len(matches))]:
        raise SetupError("Unsupported custom authentication expression order")
    if any(not isinstance(value, dict) or set(value) != {"if", "then"}
           or not all(isinstance(v, str) for v in value.values()) for value in matches.values()):
        raise SetupError("Unsupported custom authentication expression branches")
    if matches.get("0") == {"if": GUARD, "then": "false"}:
        return rule
    return {"match": {"0": {"if": GUARD, "then": "false"},
                      **{str(int(key) + 1): value for key, value in matches.items()}}, "else": rule["else"]}


def check_listener(listeners):
    found = False
    for listener in listeners:
        binds = listener.get("bind")
        if not isinstance(binds, dict):
            raise SetupError("Unsupported Stalwart listener encoding")
        for address, enabled in binds.items():
            if enabled is not True:
                raise SetupError("Unsupported Stalwart listener encoding")
            host, port = address.rsplit(":", 1)
            host = host.strip("[]")
            if port == "25":
                raise SetupError("Stalwart still owns SMTP port 25")
            if port == "2525":
                if listener.get("protocol") != "smtp" or host != "127.0.0.1":
                    raise SetupError("Stalwart port 2525 must be SMTP bound only to 127.0.0.1")
                found = True
    if not found:
        raise SetupError("No verified internal Stalwart SMTP listener on 127.0.0.1:2525")
    with socket.create_connection(("127.0.0.1", 2525), timeout=5):
        pass


def service_state(unit):
    states = []
    for verb, allowed in [("is-active", {"active", "inactive", "failed", "unknown"}),
                          ("is-enabled", {"enabled", "enabled-runtime", "disabled", "not-found", "static"})]:
        result = subprocess.run([os.environ.get("TMAIL_SYSTEMCTL", "systemctl"), verb, unit], capture_output=True, text=True)
        value = result.stdout.strip()
        if value not in allowed:
            raise SetupError(f"Cannot establish service state: {unit}")
        states.append(value)
    return {"active": states[0] == "active", "enabled": states[1] in {"enabled", "enabled-runtime"}}


def web_owner(api_state, containers, existing_release):
    candidates = [c for c in containers
                  if c.get("Config", {}).get("Labels", {}).get("com.docker.compose.service") == "api"
                  and "TMAIL_CONFIG=/var/lib/tmail-policy/config.json" in c.get("Config", {}).get("Env", [])]
    if len(candidates) > 1 or (candidates and (api_state["active"] or api_state["enabled"])):
        raise SetupError("Ambiguous Compose/systemd web ownership")
    if candidates:
        container = candidates[0]
        if not container.get("State", {}).get("Running"):
            raise SetupError("Existing Compose API is stopped")
        if container.get("State", {}).get("Health", {}).get("Status") != "healthy":
            raise SetupError("Existing Compose API health cannot be verified")
        return "compose", container["Name"].lstrip("/")
    if api_state["active"] or api_state["enabled"] or not existing_release:
        return "systemd", ""
    raise SetupError("Cannot identify the existing web owner")


def detect_web_owner(release):
    containers = []
    if subprocess.run(["which", "docker"], capture_output=True).returncode == 0:
        ids = run("docker", "ps", "-aq", "--filter", "label=com.docker.compose.service=api").split()
        if ids:
            containers = json.loads(run("docker", "inspect", *ids))
    elif Path("/var/run/docker.sock").exists():
        raise SetupError("Docker socket exists but its API cannot be inspected")
    return web_owner(service_state("tmail-api.service"), containers, Path(release).exists())


def frontend_path(config):
    assets = Path(config.get("frontend_dist", "/opt/tmail-policy/frontend/dist"))
    if not assets.is_absolute():
        assets = Path(os.environ.get("TMAIL_CONFIG_DIR", "/var/lib/tmail-policy")) / assets
    return Path(os.path.abspath(assets))


def validate_release_assets(config, owner, stage, release):
    if owner not in {"systemd", "compose"}:
        raise SetupError("Unknown release web owner")
    if owner == "compose":
        return
    release = Path(release)
    assets = frontend_path(config)
    if assets == release / "frontend/dist":
        assets = Path(stage) / "frontend/dist"
    if not (assets / "index.html").is_file():
        raise SetupError("Systemd release has no frontend index.html; build assets before deploying")


def mail_account(client, config):
    account = config.get("mail_account_id") or client.session.get("primaryAccounts", {}).get("urn:ietf:params:jmap:mail")
    if not isinstance(account, str) or not account:
        raise SetupError("No JMAP mail account available for delivery verification")
    data = client.call("Email/query", {"accountId": account, "limit": 1}, mail=True)
    if not isinstance(data.get("ids"), list):
        raise SetupError("JMAP mail read permission is required for delivery verification")
    return account


def load_setup(config):
    path = os.environ.get("TMAIL_STALWART_SETUP_CONFIG")
    if not path:
        return config
    credential_path = Path(path)
    info = credential_path.stat()
    if info.st_uid != 0 or info.st_mode & 0o077 or credential_path.is_symlink():
        raise SetupError("Setup credential file must be root-owned, private and not a symlink")
    setup = json.loads(credential_path.read_text())
    if origin(setup["jmap_url"]) != origin(config["jmap_url"]):
        raise SetupError("Setup credentials must target the runtime Stalwart origin")
    return setup


def preflight(config):
    for command in ["postconf", "postfix", "systemctl", "ss"]:
        run("which", command)
    if run("postconf", "-m").split().count("pcre") != 1:
        raise SetupError("Postfix PCRE support must already be installed")
    restrictions = run("postconf", "-h", "smtpd_recipient_restrictions")
    merged_restrictions = merge_recipient_restrictions(restrictions)
    hostname = config.get("mx_hostname", "")
    labels = hostname.split(".")
    if (len(labels) < 2 or len(hostname) > 253
            or any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in labels)):
        raise SetupError("mx_hostname must be a valid fully qualified hostname")
    if config.get("listen_addr") != "127.0.0.1" or config.get("listen_port") != 10030:
        raise SetupError("Policy daemon must use 127.0.0.1:10030 for this installer")
    admin = Management(load_setup(config))
    permissions = admin.request(urljoin(admin.url, "/api/account")).get("permissions", [])
    normalized = {p.replace("-", "").lower() for p in permissions if isinstance(p, str)}
    required = {"sysmtastageauthget", "sysmtastageauthupdate", "sysnetworklistenerget", "sysactioncreate", "actionreloadsettings"}
    if not required <= normalized:
        raise SetupError("Setup credential lacks authentication/listener/reload management permissions")
    schema = json.dumps(admin.request(urljoin(admin.url, "/api/schema")))
    if any(name not in schema for name in ["MtaStageAuth", "NetworkListener", "ReloadSettings"]):
        raise SetupError("Unsupported Stalwart configuration schema")
    old, _ = admin.auth()
    new = internal_auth_rule(old)
    listeners = admin.call("x:NetworkListener/get", {"ids": None}).get("list")
    if not isinstance(listeners, list):
        raise SetupError("Unsupported Stalwart listener response")
    check_listener(listeners)
    owner, container = detect_web_owner("/opt/tmail-policy")
    assets = frontend_path(config)
    if (owner == "systemd" and not assets.joinpath("index.html").is_file()
            and not (str(assets) == "/opt/tmail-policy/frontend/dist" and Path("frontend/dist/index.html").is_file())):
        raise SetupError("Build the frontend at configured frontend_dist before installing systemd web services")
    dropins = Path("/etc/systemd/system/tmail-janitor.service.d")
    if any(p.name != "docker.conf" for p in dropins.glob("*.conf")):
        raise SetupError("Custom janitor overrides require inspection before setup")
    docker_dropin = dropins / "docker.conf"
    if owner == "systemd" and docker_dropin.exists():
        raise SetupError("Host web owner conflicts with Docker janitor ownership")
    if owner == "compose" and docker_dropin.exists():
        text = docker_dropin.read_text()
        if ("ExecStart=/usr/bin/docker exec ${TMAIL_API_CONTAINER} python -m src.email_janitor" not in text
                or f"Environment=TMAIL_API_CONTAINER={container}" not in text.splitlines()
                or len([line for line in text.splitlines() if line.startswith("ExecStart=") and line != "ExecStart="]) != 1):
            raise SetupError("Custom Docker janitor override requires inspection")
    mail = Management(config)
    account = mail_account(mail, config)
    if "@" not in config.get("catchall_address", "") or any(c in config["catchall_address"] for c in "\r\n"):
        raise SetupError("Invalid verification recipient")
    services = {unit: service_state(unit) for unit in ["postfix.service", "stalwart.service"]}
    if not all(state["active"] for state in services.values()):
        raise SetupError("Existing Postfix and Stalwart must be active before setup")
    if urlsplit(config["jmap_url"]).hostname not in {"127.0.0.1", "::1", "localhost"}:
        raise SetupError("Host installer requires a loopback Stalwart management URL")
    sockets = run("ss", "-H", "-ltnp", "sport = :2525")
    lines = sockets.splitlines()
    if len(lines) != 1 or "127.0.0.1:2525" not in lines[0] or '"stalwart"' not in lines[0]:
        raise SetupError("Cannot verify Stalwart exclusively owns loopback port 2525")
    return {"owner": owner, "container": container, "old_auth": old, "new_auth": new,
            "mail_account": account,
            "services": services, "recipient_restrictions": restrictions,
            "new_recipient_restrictions": merged_restrictions,
            "stalwart_conflicts": run("systemctl", "show", "stalwart.service", "--property=Conflicts", "--value").split()}


def save_plan(path, plan):
    temporary = path.with_suffix(".tmp")
    with open(temporary, "w", encoding="utf-8") as output:
        os.chmod(temporary, 0o600)
        json.dump(plan, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def publish(path, data, mode=0o644, uid=None, gid=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmail-{uuid.uuid4().hex}")
    try:
        with open(temporary, "xb") as output:
            os.chmod(temporary, mode)
            if uid is not None:
                os.chown(temporary, uid, gid)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_files(config, plan, plan_path):
    directory = plan_path.parent / "postfix"
    directory.mkdir(mode=0o700)
    main = Path("/etc/postfix/main.cf")
    if main.is_symlink() or not main.is_file():
        raise SetupError("Postfix main.cf must be a regular file")
    shutil.copy2(main, directory / "main.cf")
    original_main = (directory / "main.cf").read_bytes()
    restrictions = run("postconf", "-c", str(directory), "-h", "smtpd_recipient_restrictions")
    if restrictions != plan["recipient_restrictions"]:
        raise SetupError("Postfix recipient restrictions changed since preflight")
    hostname = config["mx_hostname"]
    settings = {
        "myhostname": hostname, "mydomain": hostname.split(".", 1)[1], "myorigin": "$myhostname",
        "inet_interfaces": "all", "inet_protocols": "ipv4", "mydestination": "",
        "local_recipient_maps": "", "local_transport": "error:local delivery disabled",
        "virtual_transport": "smtp:127.0.0.1:2525", "virtual_mailbox_domains": "pcre:/etc/postfix/accepted_domains",
        "relay_domains": "",
        "smtpd_recipient_restrictions": plan["new_recipient_restrictions"],
    }
    changes = [f"{key} = {value}" for key, value in settings.items()
               if run("postconf", "-c", str(directory), "-h", key) != value]
    if changes:
        run("postconf", "-c", str(directory), "-e", *changes)
    desired = {main: (directory / "main.cf").read_bytes(),
               Path("/etc/postfix/accepted_domains"): Path("deploy/accepted_domains").read_bytes()}
    domain_map = Path("/etc/postfix/accepted_domains")
    if domain_map.exists() and domain_map.read_bytes() != desired[domain_map]:
        raise SetupError("Custom accepted_domains map requires inspection before setup")
    if "postfix.service" in plan["stalwart_conflicts"]:
        remaining = " ".join(c for c in plan["stalwart_conflicts"] if c != "postfix.service")
        dropin = Path("/etc/systemd/system/stalwart.service.d/tmail-postfix.conf")
        data = f"[Unit]\nConflicts=\nConflicts={remaining}\n".encode()
        if dropin.exists() and dropin.read_bytes() != data:
            raise SetupError("Custom Stalwart coexistence override requires inspection")
        desired[dropin] = data
    if plan["owner"] == "compose":
        container = plan["container"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", container):
            raise SetupError("Invalid Compose container name")
        override = Path("/etc/systemd/system/tmail-janitor.service.d/docker.conf")
        if not override.exists():
            desired[override] = (
                "[Service]\nUser=root\nWorkingDirectory=/\n"
                f"Environment=TMAIL_API_CONTAINER={container}\nExecStart=\n"
                "ExecStart=/usr/bin/docker exec ${TMAIL_API_CONTAINER} python -m src.email_janitor\n").encode()
    files = []
    for path, data in desired.items():
        if path.is_symlink() or any(p.is_symlink() for p in path.parents):
            raise SetupError("Configuration symlink requires inspection before setup")
        previous = original_main if path == main else (path.read_bytes() if path.exists() else None)
        if previous == data:
            continue
        name = f"file-{len(files)}"
        if previous is not None:
            backup = plan_path.parent / name
            publish(backup, previous, 0o600)
        info = path.stat() if previous is not None else None
        files.append({"path": str(path), "backup": name if previous is not None else None,
                      "old": digest(previous) if previous is not None else None,
                      "new": digest(data), "mode": (info.st_mode & 0o777) if info else 0o644,
                      "uid": info.st_uid if info else os.getuid(), "gid": info.st_gid if info else os.getgid()})
    plan["files"] = files
    save_plan(plan_path, plan)
    return desired


def apply(config, plan, plan_path):
    if detect_web_owner("/opt/tmail-policy") != (plan["owner"], plan["container"]):
        raise SetupError("Web ownership changed since preflight")
    client = Management(load_setup(config))
    old, state = client.auth()
    if old != plan["old_auth"]:
        raise SetupError("Stalwart authentication changed since preflight")
    desired = prepare_files(config, plan, plan_path)
    plan["mail_started"] = True
    save_plan(plan_path, plan)
    if old != plan["new_auth"]:
        client.set_auth(plan["new_auth"], state)
        client.reload()
    for entry in plan["files"]:
        path = Path(entry["path"])
        current = digest(path.read_bytes()) if path.exists() else None
        if current != entry["old"]:
            raise SetupError("Configuration changed during setup; refusing to overwrite it")
        publish(path, desired[path], entry["mode"], entry["uid"], entry["gid"])
    if any("/systemd/" in entry["path"] for entry in plan["files"]):
        run("systemctl", "daemon-reload")
    run("postfix", "check")
    if any(entry["path"].startswith("/etc/postfix/") for entry in plan["files"]):
        run("systemctl", "restart", "postfix.service")


def restore(config, plan, plan_path):
    if not plan.get("mail_started"):
        return
    errors = []
    files = plan.get("files", [])
    for entry in reversed(files):
        try:
            path = Path(entry["path"])
            if path.is_symlink() or any(p.is_symlink() for p in path.parents):
                raise SetupError("Concurrent configuration symlink detected")
            current = digest(path.read_bytes()) if path.exists() else None
            if current == entry["old"]:
                continue
            if current != entry["new"]:
                raise SetupError("Concurrent configuration change; recovery data retained")
            if entry["backup"]:
                publish(path, (plan_path.parent / entry["backup"]).read_bytes(), entry["mode"], entry["uid"], entry["gid"])
            else:
                path.unlink()
        except Exception:
            errors.append("Configuration recovery incomplete")
    try:
        if plan["old_auth"] != plan["new_auth"]:
            client = Management(load_setup(config))
            old, state = client.auth()
            if old not in (plan["old_auth"], plan["new_auth"]):
                raise SetupError("Concurrent Stalwart change; refusing to overwrite it during recovery")
            if old != plan["old_auth"]:
                client.set_auth(plan["old_auth"], state)
            client.reload()
    except Exception:
        errors.append("Stalwart recovery incomplete")
    try:
        if any("/systemd/" in entry["path"] for entry in files):
            run("systemctl", "daemon-reload")
        for unit, state in plan["services"].items():
            # Do not restart unchanged mail services during recovery.
            if unit == "postfix.service" and any(e["path"].startswith("/etc/postfix/") for e in files):
                run("postfix", "check")
                run("systemctl", "restart" if state["active"] else "stop", unit)
    except Exception:
        errors.append("Mail service recovery incomplete")
    if errors:
        raise SetupError("; ".join(errors))


def check_services(config, plan):
    owner, container = plan["owner"], plan["container"]
    if detect_web_owner("/opt/tmail-policy") != (owner, container):
        raise SetupError("Web ownership changed during setup")
    run("systemctl", "is-active", "tmail-policy.service")
    if owner == "compose":
        details = json.loads(run("docker", "inspect", container))[0]
        if not details["State"]["Running"] or details["State"].get("Health", {}).get("Status") != "healthy":
            raise SetupError("Compose API is unhealthy")
        if service_state("tmail-api.service")["active"]:
            raise SetupError("A second systemd API is active")
    else:
        run("systemctl", "is-active", "tmail-api.service")
        host = config.get("api_listen_addr", "127.0.0.1")
        if host in {"0.0.0.0", "::"}:
            host = "127.0.0.1"
        from urllib.request import urlopen
        with urlopen(f"http://{host}:{config.get('api_listen_port', 8000)}/docs", timeout=5) as response:
            if response.status != 200:
                raise SetupError("Web API verification failed")
    with socket.create_connection(("127.0.0.1", 10030), timeout=5) as connection:
        connection.settimeout(5)
        connection.sendall(b"request=smtpd_access_policy\nrecipient=invalid\n\n")
        if not connection.recv(4096).startswith(b"action="):
            raise SetupError("Policy daemon did not return a policy response")


def verify(config, plan):
    for attempt in range(15):
        try:
            check_services(config, plan)
            break
        except (SetupError, OSError):
            if attempt == 14:
                raise SetupError("Web API or policy service did not become ready") from None
            time.sleep(2)
    client = Management(config)
    marker = f"tmail-setup-{uuid.uuid4().hex}@{config['mx_hostname']}"
    address = config["catchall_address"]
    message = f"From: {address}\r\nTo: {address}\r\nMessage-ID: <{marker}>\r\nSubject: TMail setup verification\r\n\r\nInstaller delivery check.\r\n"
    with smtplib.SMTP("127.0.0.1", 25, timeout=10) as smtp:
        if smtp.sendmail(address, [address], message):
            raise SetupError("Postfix rejected delivery verification")
    for _ in range(15):
        result = client.call("Email/query", {"accountId": plan["mail_account"],
                             "filter": {"header": ["Message-ID", marker]}, "limit": 1}, mail=True)
        if result.get("ids"):
            print("==> Verified Postfix delivery into the JMAP mailbox")
            return
        time.sleep(2)
    raise SetupError("SMTP message did not reach the JMAP mailbox during verification")


def write_private(path, data):
    with open(path, "x", encoding="utf-8") as target:
        os.chmod(path, 0o600)
        json.dump(data, target)


def read_config(path):
    runtime = Path(os.environ.get("TMAIL_CONFIG_DIR", "/var/lib/tmail-policy")) / "config.json"
    if os.geteuid() == 0 and Path(path) == runtime:
        # A service-owned path must never let root follow an unreadable symlink.
        return json.loads(run("runuser", "-u", "tmail-policy", "--", "cat", "--", str(path)))
    return json.loads(Path(path).read_text())


def main():
    if sys.argv[1] == "owner":
        print(detect_web_owner(sys.argv[2])[0])
        return
    if sys.argv[1] == "validate-release":
        config_path, stage, release, owner = sys.argv[2:]
        validate_release_assets(read_config(config_path), owner, stage, release)
        return
    command, config_path, plan_path = sys.argv[1:]
    config = read_config(config_path)
    if command == "preflight":
        write_private(plan_path, preflight(config))
        return
    plan = json.loads(Path(plan_path).read_text())
    if command == "verify":
        verify(config, plan)
        return
    if command == "apply":
        apply(config, plan, Path(plan_path))
    elif command == "restore":
        restore(config, plan, Path(plan_path))
    else:
        raise SetupError("Unknown setup command")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt):
        # Upstream errors may contain credentials, addresses, or message contents.
        error = sys.exc_info()[1]
        print(f"ERROR: {error if isinstance(error, SetupError) else 'Setup failed; inspect local service health and private recovery data'}", file=sys.stderr)
        sys.exit(1)
