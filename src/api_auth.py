from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re

from src.domain_cache import DomainCache


_LOCAL_PART = re.compile(r"^[a-z0-9][a-z0-9._+-]*[a-z0-9]$|^[a-z0-9]$")
_DOMAIN_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


class AddressValidationError(ValueError):
    pass


def _domain(value: str) -> str:
    try:
        domain = value.encode("idna").decode("ascii").lower()
    except (AttributeError, UnicodeError):
        raise AddressValidationError("Invalid domain") from None
    if len(domain) > 253 or not domain or any(not _DOMAIN_LABEL.fullmatch(label) for label in domain.split(".")):
        raise AddressValidationError("Invalid domain")
    return domain


def _domain_rule(value: str) -> str:
    if isinstance(value, str) and value.startswith("*."):
        return f"*.{_domain(value[2:])}"
    return _domain(value)


def _domain_matches_rule(domain: str, rule: str) -> bool:
    domain = _domain(domain)
    rule = _domain_rule(rule)
    return domain == rule or rule.startswith("*.") and (
        domain == rule[2:] or domain.endswith(f".{rule[2:]}")
    )


def _token_address(address: str) -> str:
    try:
        local, domain = address.split("@")
    except (AttributeError, ValueError):
        raise ValueError("Invalid address") from None
    return f"{local.lower()}@{_domain(domain)}"


def normalize_address(address: str, domains: list[str], settings: dict[str, object]) -> str:
    try:
        local, domain = address.split("@")
    except (AttributeError, ValueError):
        raise AddressValidationError("Invalid address") from None
    local = local.lower()
    domain = _domain(domain)
    try:
        allowed_domains = {_domain(value) for value in domains}
        minimum = int(settings["local_part_min"])
        maximum = int(settings["local_part_max"])
        forbidden = {str(value).lower() for value in settings["forbidden_ids"]}
    except (KeyError, TypeError, ValueError):
        raise AddressValidationError("Invalid address settings") from None
    if not _LOCAL_PART.fullmatch(local) or not minimum <= len(local) <= maximum or local in forbidden or domain not in allowed_domains:
        raise AddressValidationError("Invalid address")
    return f"{local}@{domain}"


class AddressToken:
    def __init__(self, secret: str):
        self._secret = secret.encode()

    @staticmethod
    def _encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

    @staticmethod
    def _decode(value: str) -> bytes:
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            raise ValueError("Invalid address token")
        try:
            return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Invalid address token") from None

    def issue(self, address: str, elevated: bool = False) -> str:
        payload = json.dumps(
            {"address": _token_address(address), "elevated": elevated, "v": 2}, separators=(",", ":"),
        ).encode()
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        return f"{self._encode(payload)}.{self._encode(signature)}"

    def read(self, token: str) -> tuple[str, bool]:
        try:
            payload_part, signature_part = token.split(".")
        except (AttributeError, ValueError):
            raise ValueError("Invalid address token") from None
        payload = self._decode(payload_part)
        if not hmac.compare_digest(hmac.new(self._secret, payload, hashlib.sha256).digest(), self._decode(signature_part)):
            raise ValueError("Invalid address token")
        try:
            data = json.loads(payload)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Invalid address token") from None
        if not isinstance(data, dict) or not isinstance(data.get("address"), str):
            raise ValueError("Invalid address token")
        # v1 tokens predate the elevated-access feature and carry no elevation.
        if data.get("v") == 1 and set(data) == {"address", "v"}:
            return data["address"], False
        if data.get("v") == 2 and set(data) == {"address", "elevated", "v"} and isinstance(data.get("elevated"), bool):
            return data["address"], data["elevated"]
        raise ValueError("Invalid address token")


def active_domains(cache_file: str | DomainCache, state) -> list[str]:
    settings = state.get_settings()
    manual = settings.get("manual_domains", [])
    source = state.get_frozen_domains()
    if settings["auto_sync_domains"]:
        source = []
        cache = cache_file if isinstance(cache_file, DomainCache) else DomainCache(cache_file)
        cache.load()
        source = cache.domains()
    domains = []
    for value in [*source, *manual]:
        try:
            domains.append(_domain(value))
        except AddressValidationError:
            pass
    return sorted(set(domains))
