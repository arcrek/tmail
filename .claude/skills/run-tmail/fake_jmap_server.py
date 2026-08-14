"""Launch the real FastAPI app (src.api_server.create_app) with a fake
JMAP backend, so the whole web app — public inbox + admin console —
runs against real HTTP/SSE/rate-limiter/domain-policy code without a
real Stalwart server.

Usage: python3 fake_jmap_server.py <run_dir> [--reset] [--port 8099]

<run_dir> must already contain config.json (see make_config.py).
--reset wipes state.db/domains.json first (clean rate-limiter window,
no leftover admin settings) — use between independent driver runs.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from unittest.mock import MagicMock

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

import uvicorn  # noqa: E402
from src.api_server import create_app  # noqa: E402


def make_message(recipient: str, message_id: str, subject: str, preview: str) -> dict:
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
        "keywords": {},
        "hasAttachment": True,
        "size": 321,
        "receivedAt": "2026-08-14T12:00:00Z",
        "verifications": ["dkim"],
        "retention": True,
        "retentionDate": "2026-09-14T12:00:00Z",
        "bodyValues": {
            "plain": {"value": "Plain body"},
            "markup": {"value": "<p>HTML body</p>"},
        },
        "textBody": [{"partId": "plain"}],
        "htmlBody": [{"partId": "markup"}],
        "attachments": [{
            "blobId": "attachment-1",
            "name": "notes.txt",
            "type": "text/plain",
            "size": 7,
            "disposition": "attachment",
            "transferEncoding": "base64",
            "related": True,
        }],
        "header:Delivered-To:asAddresses": [],
    }


def build_fake_jmap() -> MagicMock:
    fake = MagicMock()
    fake.discover_mail_account_id.return_value = "mail-account"

    def _list_messages(_account, address, _limit, _position):
        # Recipient MUST match the requesting address — api_server filters
        # messages via `to`/`cc`/`bcc` and drops anything addressed elsewhere.
        return (2, [
            make_message(address, "m2", "Invoice #4471", "Your invoice is attached"),
            make_message(address, "m1", "Hello from fake JMAP", "A short preview"),
        ])

    def _get_message(_account, message_id):
        # Detail view: caller's address isn't known here, so this only
        # round-trips correctly for the /messages list flow, not deep-link
        # opens of an arbitrary id from a different session.
        return make_message("box@example.com", message_id, "Hello from fake JMAP", "A short preview")

    fake.list_messages.side_effect = _list_messages
    fake.get_message.side_effect = _get_message
    fake.set_seen.return_value = True
    fake.delete_message.return_value = True
    fake.download_blob.side_effect = lambda _account, _blob, _name, content_type: (
        (chunk for chunk in (b"pay", b"load")), content_type
    )
    # Dashboard's "Stored messages" tiles call this — unset it renders NaN.
    fake.message_counts.return_value = {"stored": 2, "today": 2, "sevenDays": 2}
    return fake


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_dir")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--port", type=int, default=8099)
    args = parser.parse_args()

    run_dir = Path(args.run_dir).resolve()
    if args.reset:
        for name in ("state.db", "domains.json"):
            path = run_dir / name
            if path.exists():
                path.unlink()
        (run_dir / "domains.json").write_text('["example.com"]')

    app = create_app(str(run_dir / "config.json"))
    app.state.jmap = build_fake_jmap()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
