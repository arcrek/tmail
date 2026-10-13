from __future__ import annotations

import asyncio
import base64
import binascii
from contextvars import ContextVar
import hashlib
import hmac
import json
import re
import secrets
from threading import BoundedSemaphore

from argon2 import PasswordHasher, Type
from argon2.exceptions import HashingError, InvalidHashError, VerificationError, VerifyMismatchError

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


def _safe_domain(value: object) -> str:
    raw = str(value).strip().rstrip(".")
    if not raw:
        return ""
    try:
        return raw.encode("idna").decode("ascii").lower()
    except UnicodeError:
        return raw.lower()



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

    def issue(self, address: str, elevated: bool = False, generation: int = 0) -> str:
        if type(generation) is not int or generation < 0 or type(elevated) is not bool:
            raise ValueError("Invalid address token")
        payload = json.dumps(
            {"address": _token_address(address), "elevated": elevated,
             "generation": generation, "v": 3}, separators=(",", ":"),
        ).encode()
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        return f"{self._encode(payload)}.{self._encode(signature)}"

    def read(self, token: str) -> tuple[str, bool]:
        address, elevated, _generation = self.read_claims(token)
        return address, elevated

    def read_claims(self, token: str) -> tuple[str, bool, int]:
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
            return data["address"], False, 0
        if (
            data.get("v") == 2
            and set(data) == {"address", "elevated", "v"}
            and isinstance(data.get("elevated"), bool)
        ):
            return data["address"], data["elevated"], 0
        if (
            data.get("v") == 3
            and set(data) == {"address", "elevated", "generation", "v"}
            and type(data["elevated"]) is bool
            and type(data["generation"]) is int
            and data["generation"] >= 0
        ):
            return data["address"], data["elevated"], data["generation"]
        raise ValueError("Invalid address token")


class MailboxConflict(ValueError):
    pass


class PasswordServiceError(RuntimeError):
    pass


class PasswordBusy(PasswordServiceError):
    pass


def validate_password(password: str) -> str:
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        raise ValueError("Password must contain 12–128 characters")
    return password


_PASSWORD_HASHER = PasswordHasher(time_cost=2, memory_cost=32768, parallelism=1, type=Type.ID)
_HASH_SLOTS = BoundedSemaphore(2)
_HASH_RESERVED = ContextVar("mailbox_hash_reserved", default=False)


async def mailbox_operation(function, *args, **kwargs):
    """Reserve capacity before offload; the real worker owns it until completion."""
    if not _HASH_SLOTS.acquire(blocking=False):
        raise PasswordBusy("Password service busy")

    def work():
        marker = _HASH_RESERVED.set(True)
        try:
            return function(*args, **kwargs)
        finally:
            _HASH_RESERVED.reset(marker)
            _HASH_SLOTS.release()

    def consume_exception(task: asyncio.Task) -> None:
        if not task.cancelled():
            task.exception()

    task = asyncio.create_task(asyncio.to_thread(work))
    task.add_done_callback(consume_exception)
    return await asyncio.shield(task)


class MailboxAuth:
    """Password lifecycle; callers still apply domain policy and request throttling."""

    def __init__(self, state, signer: AddressToken):
        self.state = state
        self.signer = signer

    @staticmethod
    def token_hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def _hash(password: str) -> str:
        validate_password(password)
        reserved = _HASH_RESERVED.get()
        if not reserved and not _HASH_SLOTS.acquire(blocking=False):
            raise PasswordBusy("Password service busy")
        try:
            return _PASSWORD_HASHER.hash(password)
        except (HashingError, UnicodeError):
            raise PasswordServiceError("Password service unavailable") from None
        finally:
            if not reserved:
                _HASH_SLOTS.release()

    @staticmethod
    def _verify(encoded: str, password: str) -> str | None:
        validate_password(password)
        reserved = _HASH_RESERVED.get()
        if not reserved and not _HASH_SLOTS.acquire(blocking=False):
            raise PasswordBusy("Password service busy")
        try:
            _PASSWORD_HASHER.verify(encoded, password)
            if _PASSWORD_HASHER.check_needs_rehash(encoded):
                return _PASSWORD_HASHER.hash(password)
            return None
        except VerifyMismatchError:
            raise ValueError("Invalid mailbox credentials") from None
        except (HashingError, VerificationError, InvalidHashError, UnicodeError):
            raise PasswordServiceError("Password service unavailable") from None
        finally:
            if not reserved:
                _HASH_SLOTS.release()

    def public_token(self, address: str, elevated: bool = False) -> str:
        security = self.state.mailbox_security(address)
        if security["password_hash"] is not None:
            raise ValueError("Mailbox password required")
        return self.signer.issue(address, elevated=elevated, generation=security["generation"])

    def resolve(self, token: str) -> dict:
        if "." in token:
            address, elevated, generation = self.signer.read_claims(token)
            security = self.state.mailbox_security(address)
            if security["password_hash"] is not None or security["generation"] != generation:
                raise ValueError("Invalid address token")
            return {"address": address, "elevated": elevated, "generation": generation,
                    "kind": "public", "expires_at": None}
        session = self.state.mailbox_session(self.token_hash(token))
        if session is None:
            raise ValueError("Invalid address token")
        return {**session, "elevated": bool(session["elevated"]),
                "kind": "admin" if session["admin_session_hash"] else "visitor"}

    def login(self, address: str, password: str | None = None, *, elevated: bool = False) -> str:
        observed = self.state.mailbox_security(address)
        if observed["password_hash"] is None:
            return self.signer.issue(address, elevated=elevated, generation=observed["generation"])
        if password is None:
            raise ValueError("Mailbox password required")
        upgraded = self._verify(observed["password_hash"], password)
        token = secrets.token_urlsafe(32)
        if self.state.login_mailbox(observed, self.token_hash(token), upgraded, elevated=elevated) is None:
            current = self.state.mailbox_security(address)
            # Another login may have upgraded the hash without changing the password.
            if (current["generation"] != observed["generation"] or
                    current["password_hash"] is None or
                    current["password_hash"] == observed["password_hash"]):
                raise MailboxConflict("Mailbox protection changed")
            upgraded = self._verify(current["password_hash"], password)
            if self.state.login_mailbox(current, self.token_hash(token), upgraded, elevated=elevated) is None:
                raise MailboxConflict("Mailbox protection changed")
        return token

    def set_password(self, address: str, password: str,
                     current_password: str | None = None,
                     admin_session_hash: str | None = None, *, elevated: bool = False) -> str | None:
        validate_password(password)
        observed = self.state.mailbox_security(address)
        if admin_session_hash is None and observed["password_hash"] is not None:
            self._verify(observed["password_hash"], current_password)
        encoded = self._hash(password)
        token = secrets.token_urlsafe(32) if admin_session_hash is None else None
        if self.state.mutate_mailbox(observed, encoded, self.token_hash(token) if token else None,
                                     admin_session_hash, elevated=elevated) is None:
            raise MailboxConflict("Mailbox protection changed")
        return token

    def remove_password(self, address: str, current_password: str | None = None,
                        admin_session_hash: str | None = None, *, elevated: bool = False) -> str:
        observed = self.state.mailbox_security(address)
        if admin_session_hash is None:
            if observed["password_hash"] is None:
                raise ValueError("Mailbox password required")
            self._verify(observed["password_hash"], current_password)
        security = self.state.mutate_mailbox(observed, None, admin_session_hash=admin_session_hash)
        if security is None:
            raise MailboxConflict("Mailbox protection changed")
        return self.signer.issue(address, elevated=elevated, generation=security["generation"])

    def admin_token(self, address: str, admin_session_hash: str) -> str:
        observed = self.state.mailbox_security(address)
        token = secrets.token_urlsafe(32)
        if self.state.admin_mailbox_session(observed, self.token_hash(token), admin_session_hash) is None:
            raise MailboxConflict("Mailbox protection changed")
        return token

    def logout(self, token: str) -> None:
        self.resolve(token)
        if "." not in token:
            self.state.delete_mailbox_session(self.token_hash(token))


def active_domains(cache_file: str | DomainCache, state) -> list[str]:
    settings = state.get_settings()
    manual = settings.get("manual_domains", [])
    if settings["auto_sync_domains"]:
        cache = cache_file if isinstance(cache_file, DomainCache) else DomainCache(cache_file)
        cache.load()
        source = cache.domains() or state.get_frozen_domains()
    else:
        source = state.get_frozen_domains()
    domains = []
    for value in [*source, *manual]:
        try:
            domains.append(_domain(value))
        except AddressValidationError:
            pass
    return sorted(set(domains))
