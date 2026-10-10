"""Delete emails older than retention_days from Stalwart via JMAP."""
from __future__ import annotations
import logging
import sys
from datetime import datetime, timedelta, timezone

import httpx

from .config import load_config
from .jmap_client import JmapClient, JmapUpstreamError

logger = logging.getLogger(__name__)

_USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"]
_BATCH = 50


def _response_data(client: httpx.Client, url: str, payload: dict, method: str, account_id: str) -> dict:
    try:
        response = client.post(url, json=payload, timeout=30)
        response.raise_for_status()
        envelope = response.json()
    except Exception:
        raise JmapUpstreamError() from None
    if not isinstance(envelope, dict):
        raise JmapUpstreamError()
    responses = envelope.get("methodResponses")
    if not isinstance(responses, list) or len(responses) != 1:
        raise JmapUpstreamError()
    result = responses[0]
    if not isinstance(result, list) or len(result) != 3:
        raise JmapUpstreamError()
    response_method, data, call_id = result
    if (
        response_method != method or call_id != "0"
        or not isinstance(data, dict) or data.get("accountId") != account_id
    ):
        raise JmapUpstreamError()
    return data


def _query_old_emails(client: httpx.Client, url: str, account_id: str, before_utc: str) -> list[str]:
    """Return up to _BATCH email IDs received before before_utc."""
    payload = {
        "using": _USING,
        "methodCalls": [[
            "Email/query",
            {
                "accountId": account_id,
                "filter": {"before": before_utc},
                "limit": _BATCH,
                "position": 0,
            },
            "0",
        ]],
    }
    data = _response_data(client, url, payload, "Email/query", account_id)
    ids = data.get("ids")
    if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids):
        raise JmapUpstreamError()
    return ids


def _destroy_emails(client: httpx.Client, url: str, account_id: str, ids: list[str]) -> int:
    """Destroy the given email IDs. Returns count of successfully destroyed."""
    payload = {
        "using": _USING,
        "methodCalls": [[
            "Email/set",
            {"accountId": account_id, "destroy": ids},
            "0",
        ]],
    }
    data = _response_data(client, url, payload, "Email/set", account_id)
    destroyed = data.get("destroyed")
    not_destroyed = data.get("notDestroyed")
    if destroyed is None:
        destroyed = []
    if not_destroyed is None:
        not_destroyed = {}
    if (
        not isinstance(destroyed, list)
        or any(not isinstance(value, str) or value not in ids for value in destroyed)
        or len(set(destroyed)) != len(destroyed)
        or not isinstance(not_destroyed, dict)
        or any(
            key not in ids or not isinstance(error, dict) or not isinstance(error.get("type"), str)
            for key, error in not_destroyed.items()
        )
        or set(destroyed).intersection(not_destroyed)
    ):
        raise JmapUpstreamError()
    if not_destroyed:
        logger.warning("Failed to destroy %d emails: %s", len(not_destroyed), not_destroyed)
    return len(destroyed)


def run(config_path: str) -> None:
    cfg = load_config(config_path)
    retention_days = getattr(cfg, "retention_days", 30)

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    before_utc = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info("Deleting emails received before %s (retention: %d days)", before_utc, retention_days)

    headers = {
        "Authorization": f"Bearer {cfg.jmap_token}",
        "Content-Type": "application/json",
    }
    total_deleted = 0

    with httpx.Client(headers=headers) as client:
        account_id = cfg.mail_account_id or JmapClient(
            cfg.jmap_url, cfg.jmap_token, cfg.catchall_address, client=client
        ).discover_mail_account_id()
        while True:
            ids = _query_old_emails(client, cfg.jmap_url, account_id, before_utc)
            if not ids:
                break
            deleted = _destroy_emails(client, cfg.jmap_url, account_id, ids)
            if deleted == 0:
                raise JmapUpstreamError()
            total_deleted += deleted
            logger.info("Deleted batch of %d (total so far: %d)", deleted, total_deleted)

    logger.info("Done. Total emails deleted: %d", total_deleted)


if __name__ == "__main__":
    import os
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config_path = os.environ.get("TMAIL_CONFIG", "/var/lib/tmail-policy/config.json")
    try:
        run(config_path)
    except Exception as exc:
        logger.error("Janitor failed: %s", exc)
        sys.exit(1)
