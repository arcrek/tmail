"""Stateful fake-JMAP FastAPI launcher for frontend E2E tests.

Runs the real `src.api_server.create_app()` against an isolated temporary
directory (config.json, state.db, domains.json) with only the external JMAP
client mocked in memory.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import uvicorn  # noqa: E402
from src.api_server import create_app  # noqa: E402


def _make_message(
    recipient: str,
    message_id: str,
    subject: str,
    preview: str,
    plain_body: str,
    html_body: str,
    *,
    seen: bool = False,
) -> dict:
    keywords = {"$seen": True} if seen else {}
    return {
        "id": message_id,
        "blobId": f"source-{message_id}",
        "threadId": f"thread-{message_id}",
        "from": [{"name": "Sender", "email": "sender@example.net"}],
        "to": [{"name": "Inbox", "email": recipient}],
        "cc": [],
        "bcc": [],
        "subject": subject,
        "preview": preview,
        "keywords": keywords,
        "hasAttachment": True,
        "size": 321,
        "receivedAt": "2026-08-14T12:00:00Z",
        "verifications": ["dkim"],
        "retention": True,
        "retentionDate": "2026-09-14T12:00:00Z",
        "bodyValues": {
            "plain": {"value": plain_body},
            "markup": {"value": html_body},
        },
        "textBody": [{"partId": "plain"}],
        "htmlBody": [{"partId": "markup"}],
        "attachments": [
            {
                "blobId": f"attachment-{message_id}",
                "name": "notes.txt",
                "type": "text/plain",
                "size": 7,
                "disposition": "attachment",
                "transferEncoding": "base64",
                "related": False,
            }
        ],
        "header:Delivered-To:asAddresses": [],
    }


def build_stateful_fake_jmap() -> MagicMock:
    fake = MagicMock()
    fake.discover_mail_account_id.return_value = "mail-account"
    lock = threading.Lock()
    deleted_ids: set[str] = set()
    seen_ids: set[str] = set()
    address_prefixes: dict[str, str] = {}
    id_lookup: dict[str, tuple[str, str]] = {}

    templates = [
        (
            "m3",
            "Verify your login",
            "Your verification code is 849201",
            "Plain verification code: 849201",
            "<p>Your verification code is <strong>849201</strong>.</p>",
        ),
        (
            "m2",
            "Invoice #4471",
            "Your invoice is attached",
            "Plain invoice body",
            "<p>HTML invoice body</p>",
        ),
        (
            "m1",
            "Welcome to TMail",
            "A short welcome preview",
            "Plain welcome body",
            "<p>HTML welcome body</p>",
        ),
    ]
    template_by_key = {row[0]: row for row in templates}

    def _prefix_for(address: str) -> str:
        if address not in address_prefixes:
            address_prefixes[address] = f"a{len(address_prefixes) + 1}"
        return address_prefixes[address]

    def _list_messages(_account, address, limit, position):
        with lock:
            prefix = _prefix_for(address)
            items = []
            for tpl_key, subject, preview, plain, html in templates:
                msg_id = f"{prefix}-{tpl_key}"
                if msg_id in deleted_ids:
                    continue
                id_lookup[msg_id] = (address, tpl_key)
                items.append(
                    _make_message(
                        address,
                        msg_id,
                        subject,
                        preview,
                        plain,
                        html,
                        seen=(msg_id in seen_ids),
                    )
                )
            total = len(items)
            start = max(0, int(position or 0))
            page = items[start : start + int(limit)] if limit else items[start:]
            return (total, page)

    def _get_message(_account, message_id):
        with lock:
            if message_id in deleted_ids or message_id not in id_lookup:
                return None
            address, tpl_key = id_lookup[message_id]
            _, subject, preview, plain, html = template_by_key[tpl_key]
            return _make_message(
                address,
                message_id,
                subject,
                preview,
                plain,
                html,
                seen=(message_id in seen_ids),
            )

    def _set_seen(_account, message_id, seen=True):
        with lock:
            if seen:
                seen_ids.add(message_id)
            else:
                seen_ids.discard(message_id)
        return True

    def _delete_message(_account, message_id):
        with lock:
            deleted_ids.add(message_id)
        return True

    fake.list_messages.side_effect = _list_messages
    fake.get_message.side_effect = _get_message
    fake.set_seen.side_effect = _set_seen
    fake.delete_message.side_effect = _delete_message
    fake.download_blob.side_effect = lambda _account, _blob, _name, content_type: (
        (chunk for chunk in (b"pay", b"load")),
        content_type,
    )

    def _message_counts(_account):
        with lock:
            count = max(0, len(templates) - len(deleted_ids))
            return {"stored": count, "today": count, "sevenDays": count}

    fake.message_counts.side_effect = _message_counts
    return fake


def write_isolated_config(run_dir: Path, admin_password: str = "admin-secret-pw") -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    domains_file = run_dir / "domains.json"
    if not domains_file.exists():
        domains_file.write_text(json.dumps(["example.com"]))

    config = {
        "jmap_url": "https://mail.example/jmap",
        "jmap_token": "private-jmap-token",
        "mx_hostname": "mail.example.com",
        "catchall_address": "admin@example.com",
        "listen_addr": "127.0.0.1",
        "listen_port": 10030,
        "cache_file": str(domains_file),
        "api_token_secret": "s" * 32,
        "admin_password": admin_password,
        "state_db": str(run_dir / "state.db"),
        "mail_account_id": "mail-account",
        "frontend_dist": str(REPO_ROOT / "frontend" / "dist"),
    }
    config_path = run_dir / "config.json"
    config_path.write_text(json.dumps(config, indent=2))
    return config_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_dir")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--admin-password", default="admin-secret-pw")
    args = parser.parse_args()

    run_dir = Path(args.run_dir).resolve()
    config_path = write_isolated_config(run_dir, admin_password=args.admin_password)

    app = create_app(str(config_path))
    app.state.jmap = build_stateful_fake_jmap()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
