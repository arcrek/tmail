#!/usr/bin/env python3
"""Sync the newest valid TLS certificate for TARGET_DOMAIN from Stalwart to Nginx & Postfix.

Configuration via environment variables (or EnvironmentFile=/etc/default/sync-stalwart-certs):
  STALWART_CLI   Path to stalwart-cli binary (default: /root/.cargo/bin/stalwart-cli)
  STALWART_URL   Stalwart HTTP base URL (default: http://127.0.0.1:8080)
  STALWART_TOKEN Stalwart admin API key (falls back to jmap_token in TMAIL_CONFIG)
  TARGET_DOMAIN  SAN domain to match (falls back to mx_hostname in TMAIL_CONFIG)
  CERT_PATH      Output fullchain PEM path (default: /etc/ssl/certs/<TARGET_DOMAIN>.fullchain.pem)
  KEY_PATH       Output private key PEM path (default: /etc/ssl/private/<TARGET_DOMAIN>.privkey.pem)
  TMAIL_CONFIG   Optional fallback config.json path (default: /var/lib/tmail-policy/config.json)
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

DEFAULT_STALWART_CLI = "/root/.cargo/bin/stalwart-cli"
DEFAULT_STALWART_URL = "http://127.0.0.1:8080"
DEFAULT_TMAIL_CONFIG = "/var/lib/tmail-policy/config.json"
SUBPROCESS_TIMEOUT_S = 30
MEM_CHUNK_SIZE = 4 * 1024 * 1024
MEM_CHUNK_OVERLAP = 16 * 1024

_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$"
)
_OPENSSL_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}
_OPENSSL_DATE_RE = re.compile(
    r"notAfter=([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s+GMT"
)
_PEM_KEY_RE = re.compile(
    rb"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END [A-Z0-9 ]*PRIVATE KEY-----"
)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


def validate_hostname(domain: str) -> str:
    cleaned = domain.strip().lower()
    if not _HOSTNAME_RE.match(cleaned):
        raise ValueError(f"Invalid TARGET_DOMAIN hostname: {domain!r}")
    return cleaned


def load_settings() -> dict[str, str]:
    file_cfg: dict = {}
    cfg_path = Path(_env("TMAIL_CONFIG", DEFAULT_TMAIL_CONFIG))
    if cfg_path.is_file():
        try:
            file_cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"Warning: failed to read {cfg_path}: {exc}", file=sys.stderr)
            file_cfg = {}

    raw_domain = _env("TARGET_DOMAIN") or str(file_cfg.get("mx_hostname", "")).strip()
    target_domain = validate_hostname(raw_domain) if raw_domain else ""
    token = _env("STALWART_TOKEN") or str(file_cfg.get("jmap_token", "")).strip()

    default_cert = f"/etc/ssl/certs/{target_domain}.fullchain.pem" if target_domain else ""
    default_key = f"/etc/ssl/private/{target_domain}.privkey.pem" if target_domain else ""

    return {
        "stalwart_cli": _env("STALWART_CLI", DEFAULT_STALWART_CLI),
        "stalwart_url": _env("STALWART_URL", DEFAULT_STALWART_URL),
        "stalwart_token": token,
        "target_domain": target_domain,
        "cert_path": _env("CERT_PATH", default_cert),
        "key_path": _env("KEY_PATH", default_key),
    }


def _cli(settings: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "STALWART_URL": settings["stalwart_url"],
        "STALWART_TOKEN": settings["stalwart_token"],
    }
    return subprocess.run(
        [settings["stalwart_cli"], *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=SUBPROCESS_TIMEOUT_S,
    )


def _cert_not_after(cert_pem: str) -> datetime | None:
    try:
        p = subprocess.run(
            ["openssl", "x509", "-noout", "-enddate"],
            input=cert_pem.encode("ascii"),
            capture_output=True,
            timeout=SUBPROCESS_TIMEOUT_S,
        )
    except (subprocess.SubprocessError, UnicodeEncodeError):
        return None
    if p.returncode != 0:
        return None
    m = _OPENSSL_DATE_RE.search(p.stdout.decode("ascii", errors="ignore").strip())
    if not m:
        return None
    month = _OPENSSL_MONTHS.get(m.group(1))
    if month is None:
        return None
    try:
        return datetime(
            int(m.group(6)),
            month,
            int(m.group(2)),
            int(m.group(3)),
            int(m.group(4)),
            int(m.group(5)),
            tzinfo=timezone.utc,
        )
    except ValueError:
        return None


def _pubkey_sha256_from_cert(cert_pem: str) -> str | None:
    try:
        p = subprocess.run(
            ["openssl", "x509", "-noout", "-pubkey"],
            input=cert_pem.encode("ascii"),
            capture_output=True,
            timeout=SUBPROCESS_TIMEOUT_S,
        )
    except (subprocess.SubprocessError, UnicodeEncodeError):
        return None
    if p.returncode != 0 or not p.stdout.strip():
        return None
    return hashlib.sha256(p.stdout).hexdigest()


def _pubkey_sha256_from_key(key_bytes: bytes) -> str | None:
    try:
        p = subprocess.run(
            ["openssl", "pkey", "-pubout"],
            input=key_bytes,
            capture_output=True,
            timeout=SUBPROCESS_TIMEOUT_S,
        )
    except subprocess.SubprocessError:
        return None
    if p.returncode != 0 or not p.stdout.strip():
        return None
    return hashlib.sha256(p.stdout).hexdigest()


def select_latest_cert(
    settings: dict[str, str],
    *,
    now: datetime | None = None,
) -> tuple[str, str] | None:
    target_domain = settings["target_domain"].lower()
    now = now or datetime.now(timezone.utc)
    try:
        res = _cli(settings, "query", "Certificate")
    except subprocess.SubprocessError as exc:
        print(f"Failed to query certificates from Stalwart: {exc}", file=sys.stderr)
        return None
    if res.returncode != 0:
        print(f"Failed to query certificates from Stalwart: {res.stderr}", file=sys.stderr)
        return None

    candidate_ids: list[str] = []
    for line in res.stdout.splitlines():
        parts = line.split(None, 1)
        if len(parts) < 2 or parts[0] == "Id":
            continue
        cert_id, sans = parts[0], parts[1]
        san_tokens = [s.strip().lower() for s in sans.split(",")]
        if target_domain in san_tokens:
            candidate_ids.append(cert_id)

    if not candidate_ids:
        print(f"No Stalwart certificates found for {target_domain}", file=sys.stderr)
        return None

    best: tuple[datetime, str, str] | None = None
    for cert_id in candidate_ids:
        try:
            r = _cli(settings, "get", "Certificate", cert_id)
        except subprocess.SubprocessError:
            continue
        if r.returncode != 0:
            continue
        certs = re.findall(
            r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
            r.stdout,
            re.DOTALL,
        )
        if not certs:
            continue
        not_after = _cert_not_after(certs[0])
        if not_after is None or not_after <= now:
            continue
        cert_pem = "\n".join(certs) + "\n"
        if best is None or not_after > best[0]:
            best = (not_after, cert_id, cert_pem)

    if best is None:
        print(f"No valid (non-expired) certificate found for {target_domain}", file=sys.stderr)
        return None

    print(f"Selected Stalwart certificate {best[1]} (notAfter={best[0].isoformat()})")
    return best[1], best[2]


def _find_matching_key_in_bytes(buf: bytes, cert_hash: str) -> str | None:
    if b"PRIVATE KEY-----" not in buf:
        return None
    for m in _PEM_KEY_RE.finditer(buf):
        raw_key = m.group(0)
        if _pubkey_sha256_from_key(raw_key) == cert_hash:
            return raw_key.decode("ascii")
    return None


def _extract_matching_key_from_stalwart_mem(cert_hash: str) -> str | None:
    try:
        p = subprocess.run(
            ["pidof", "stalwart"],
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_S,
        )
    except subprocess.SubprocessError as exc:
        print(f"Failed to locate stalwart PID: {exc}", file=sys.stderr)
        return None
    if p.returncode != 0 or not p.stdout.strip():
        print("Stalwart process not found", file=sys.stderr)
        return None

    for pid_str in p.stdout.split():
        try:
            pid = int(pid_str)
            with open(f"/proc/{pid}/maps", encoding="utf-8") as maps_file:
                maps = maps_file.readlines()
            with open(f"/proc/{pid}/mem", "rb", 0) as mem_file:
                for line in maps:
                    parts = line.split()
                    if len(parts) < 2 or "r" not in parts[1]:
                        continue
                    start, end = [int(x, 16) for x in parts[0].split("-")]
                    offset = start
                    tail = b""
                    while offset < end:
                        to_read = min(MEM_CHUNK_SIZE, end - offset)
                        try:
                            mem_file.seek(offset)
                            chunk = mem_file.read(to_read)
                        except OSError:
                            break
                        if not chunk:
                            break
                        window = tail + chunk
                        found = _find_matching_key_in_bytes(window, cert_hash)
                        if found:
                            return found
                        tail = window[-MEM_CHUNK_OVERLAP:]
                        offset += len(chunk)
        except OSError as exc:
            print(f"Warning: failed reading /proc/{pid_str}: {exc}", file=sys.stderr)
            continue
    return None


def _write_temp_file(
    target_path: str,
    content: str,
    *,
    mode: int,
    chown_group: str | None = None,
) -> str:
    parent = os.path.dirname(os.path.abspath(target_path))
    fd, tmp_path = tempfile.mkstemp(prefix=".sync-cert-", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        if chown_group is not None:
            shutil.chown(tmp_path, user="root", group=chown_group)
        os.chmod(tmp_path, mode)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    return tmp_path


def _restore_file(path: str, previous: bytes | None, *, mode: int, chown_group: str | None = None) -> None:
    if previous is None:
        try:
            os.unlink(path)
        except OSError:
            pass
        return
    tmp = _write_temp_file(path, previous.decode("utf-8"), mode=mode, chown_group=chown_group)
    os.replace(tmp, path)


def _disk_matches(cert_path: str, key_path: str, cert_pem: str, cert_hash: str) -> bool:
    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        return False
    try:
        with open(cert_path, "r", encoding="utf-8") as f:
            if f.read().strip() != cert_pem.strip():
                return False
        with open(key_path, "rb") as f:
            key_bytes = f.read()
    except OSError:
        return False
    return _pubkey_sha256_from_key(key_bytes) == cert_hash


def sync_cert_and_key(settings: dict[str, str] | None = None) -> bool:
    if settings is None:
        try:
            settings = load_settings()
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return False

    if not settings["target_domain"]:
        print("TARGET_DOMAIN is not set and no mx_hostname found in TMAIL_CONFIG", file=sys.stderr)
        return False
    if not settings["stalwart_token"]:
        print("STALWART_TOKEN is not set and no jmap_token found in TMAIL_CONFIG", file=sys.stderr)
        return False

    selected = select_latest_cert(settings)
    if not selected:
        return False
    _, cert_pem = selected

    cert_hash = _pubkey_sha256_from_cert(cert_pem)
    if not cert_hash:
        print("Failed to compute public key hash for selected certificate", file=sys.stderr)
        return False

    cert_path = settings["cert_path"]
    key_path = settings["key_path"]

    if _disk_matches(cert_path, key_path, cert_pem, cert_hash):
        return True

    found_key = _extract_matching_key_from_stalwart_mem(cert_hash)
    if not found_key:
        print("Matching private key not found in Stalwart memory", file=sys.stderr)
        return False

    prev_cert = Path(cert_path).read_bytes() if os.path.exists(cert_path) else None
    prev_key = Path(key_path).read_bytes() if os.path.exists(key_path) else None

    cert_tmp: str | None = None
    key_tmp: str | None = None
    replaced = False
    try:
        cert_tmp = _write_temp_file(cert_path, cert_pem, mode=0o644)
        key_tmp = _write_temp_file(key_path, found_key.strip() + "\n", mode=0o640, chown_group="ssl-cert")
        replaced = True
        os.replace(cert_tmp, cert_path)
        cert_tmp = None
        os.replace(key_tmp, key_path)
        key_tmp = None

        subprocess.run(["nginx", "-t"], check=True, timeout=SUBPROCESS_TIMEOUT_S)
        subprocess.run(["systemctl", "reload", "nginx"], check=True, timeout=SUBPROCESS_TIMEOUT_S)
        subprocess.run(["systemctl", "reload", "postfix"], check=True, timeout=SUBPROCESS_TIMEOUT_S)
    except Exception as exc:
        print(f"Certificate update failed ({exc}); rolling back", file=sys.stderr)
        for leftover in (cert_tmp, key_tmp):
            if leftover:
                try:
                    os.unlink(leftover)
                except OSError:
                    pass
        if replaced:
            try:
                _restore_file(cert_path, prev_cert, mode=0o644)
                _restore_file(key_path, prev_key, mode=0o640, chown_group="ssl-cert")
            except Exception as rb_exc:
                print(f"Rollback failed: {rb_exc}", file=sys.stderr)
        return False

    print("Updated certificates and reloaded nginx and postfix successfully")
    return True


if __name__ == "__main__":
    sys.exit(0 if sync_cert_and_key() else 1)
