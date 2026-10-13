from __future__ import annotations
import logging
import os
import socketserver
import sys
import threading

from src.api_auth import AddressValidationError, _domain
from src.api_state import StateStore
from src.config import ConfigStore
from src.domain_cache import DomainCache
from src.jmap_client import JmapClient, JmapUpstreamError
from src.mx_checker import MxLookupError, mx_matches

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

_config = None
_config_store: ConfigStore = None
_cache: DomainCache = None
_state: StateStore = None
_jmap: JmapClient = None
_jmap_fingerprint = None
_jmap_lock = threading.Lock()


def _runtime():
    global _config, _jmap, _jmap_fingerprint
    with _jmap_lock:
        config = _config_store.get()
        fingerprint = (config.jmap_url, config.jmap_token, config.catchall_address)
        if _jmap is None or fingerprint != _jmap_fingerprint:
            _jmap = JmapClient(*fingerprint)
            _jmap_fingerprint = fingerprint
        _config = config
        return config, _jmap


def _normalize_policy_domain(value: str) -> str:
    raw = value.strip().rstrip(".")
    if not raw:
        return ""
    try:
        return _domain(raw)
    except AddressValidationError:
        return ""


class PolicyHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        sock = getattr(self, "request", None)
        if sock is not None and hasattr(sock, "settimeout"):
            sock.settimeout(30.0)

        while True:
            attrs = {}
            saw_line = False
            try:
                for raw in self.rfile:
                    saw_line = True
                    line = raw.decode(errors="replace").strip()
                    if not line:
                        break
                    if "=" in line:
                        k, v = line.split("=", 1)
                        attrs[k.strip()] = v.strip()
            except OSError:
                return

            if not saw_line:
                return

            config, jmap = _runtime()
            recipient = attrs.get("recipient", "")
            domain = (
                _normalize_policy_domain(recipient.rpartition("@")[2])
                if "@" in recipient
                else ""
            )

            if not domain:
                self.wfile.write(b"action=REJECT Invalid recipient\n\n")
                continue

            if _cache.contains(domain):
                self.wfile.write(b"action=OK\n\n")
                continue

            try:
                if mx_matches(domain, config.mx_hostname):
                    ok = jmap.provision_domain(domain)
                    if ok:
                        try:
                            _cache.add(domain)
                        except OSError as exc:
                            logger.warning("Cache write failed for %s: %s", domain, exc)
                        try:
                            _state.record_event("domain_provisioned", domain)
                        except Exception as exc:
                            logger.warning("Metric write failed for %s: %s", domain, exc)
                        logger.info("Provisioned: %s", domain)
                        self.wfile.write(b"action=OK\n\n")
                    else:
                        logger.error("JMAP provision failed: %s", domain)
                        self.wfile.write(b"action=DEFER_IF_PERMIT Service temporarily unavailable\n\n")
                else:
                    logger.debug("MX mismatch, rejecting: %s", domain)
                    try:
                        _state.record_event("mx_mismatch", domain)
                    except Exception as exc:
                        logger.warning("Metric write failed for %s: %s", domain, exc)
                    self.wfile.write(b"action=REJECT\n\n")
            except MxLookupError as exc:
                logger.warning("DNS transient error for %s: %s", domain, exc)
                try:
                    _state.record_event("mx_lookup_error", domain, detail=str(exc))
                except Exception as inner:
                    logger.warning("Metric write failed for %s: %s", domain, inner)
                self.wfile.write(b"action=DEFER_IF_PERMIT DNS lookup failed, try again later\n\n")


def main() -> None:
    global _config, _config_store, _cache, _state, _jmap, _jmap_fingerprint
    config_path = os.environ.get("TMAIL_CONFIG", "/var/lib/tmail-policy/config.json")
    _config_store = ConfigStore(config_path)
    _config = _config_store.get()

    _cache = DomainCache(_config.cache_file)
    _cache.load()
    _state = StateStore(_config.state_db)

    _jmap = JmapClient(_config.jmap_url, _config.jmap_token, _config.catchall_address)
    _jmap_fingerprint = (_config.jmap_url, _config.jmap_token, _config.catchall_address)

    try:
        existing = _jmap.list_domains()
    except JmapUpstreamError:
        existing = []
        logger.warning("Could not pre-load domains from Stalwart; retaining cache")
    if existing:
        valid_existing = [
            normalized
            for item in existing
            if isinstance(item, str) and (normalized := _normalize_policy_domain(item))
        ]
        if valid_existing:
            _cache.add_many(valid_existing)
            logger.info("Pre-loaded %d domains from Stalwart", len(valid_existing))

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    server = socketserver.ThreadingTCPServer(
        (_config.listen_addr, _config.listen_port),
        PolicyHandler,
    )
    logger.info("Listening on %s:%d", _config.listen_addr, _config.listen_port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
