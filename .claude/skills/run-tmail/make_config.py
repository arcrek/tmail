"""Write an isolated dev config.json (+ a policy-daemon variant on a
different listen_port) into the given directory. Idempotent.

Usage: python3 make_config.py <run_dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent
REPO_ROOT = SKILL_DIR.parent.parent.parent


def main() -> None:
    run_dir = Path(sys.argv[1]).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)

    domains_file = run_dir / "domains.json"
    if not domains_file.exists():
        domains_file.write_text('["example.com"]')

    base = {
        "jmap_url": "https://mail.example/jmap",
        "jmap_token": "private-jmap-token",
        "mx_hostname": "mail.example.com",
        "catchall_address": "admin@example.com",
        "listen_addr": "127.0.0.1",
        "listen_port": 10030,
        "cache_file": str(domains_file),
        "api_token_secret": "s" * 32,
        "admin_password": "admin-secret-pw",
        "state_db": str(run_dir / "state.db"),
        "mail_account_id": "mail-account",
        "frontend_dist": str(REPO_ROOT / "frontend" / "dist"),
    }

    (run_dir / "config.json").write_text(json.dumps(base, indent=2))

    daemon_cfg = dict(base, listen_port=10099)
    (run_dir / "config_daemon.json").write_text(json.dumps(daemon_cfg, indent=2))

    print(f"wrote {run_dir / 'config.json'}")
    print(f"wrote {run_dir / 'config_daemon.json'}")


if __name__ == "__main__":
    main()
