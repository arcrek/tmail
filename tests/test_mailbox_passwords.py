from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import sqlite3
import threading
from types import SimpleNamespace

import pytest
from src import api_auth, api_server
from tests.test_public_api import config_path, fake_jmap, client, bearer, _access_credential

PASSWORD = " correct password "
NEW_PASSWORD = "new password value"
ADDRESS = "box@example.com"


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def claim(client, bearer):
    response = client.put("/me/password", headers=bearer, json={"password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["token"]


def login(client, password=PASSWORD, **kwargs):
    return client.post("/token", json={"address": ADDRESS, "password": password}, **kwargs)


def admin(client):
    response = client.post("/admin/api/login", json={"password": "admin-secret"})
    assert response.status_code == 200
    assert "Path=/admin;" in response.headers["set-cookie"]
    return {"X-CSRF-Token": response.json()["csrfToken"]}


def exchange(client, csrf):
    return client.post("/admin/api/mailboxes/token", headers=csrf, json={"address": ADDRESS})


def test_claim_login_metadata_and_current_password(client, bearer):
    token = claim(client, bearer)
    assert client.get("/me", headers=bearer).status_code == 401
    assert client.post("/token", json={"address": ADDRESS}).json()["code"] == "password_required"
    assert login(client, "wrong password value").status_code == 401
    metadata = client.get("/me", headers=headers(token)).json()
    assert metadata["protected"] and metadata["accessKind"] == "visitor"
    assert datetime.fromisoformat(metadata["protectedUntil"]) == datetime.fromisoformat(metadata["sessionExpiresAt"])
    assert "password_hash" not in str(metadata) and "admin_session_hash" not in str(metadata)
    assert client.post("/accounts", json={"address": ADDRESS}).json()["protected"]
    assert client.put("/me/password", headers=headers(token), json={"password": NEW_PASSWORD}).status_code == 401
    assert client.put("/me/password", headers=headers(token), json={"password": NEW_PASSWORD, "currentPassword": "wrong password value"}).status_code == 401
    other = login(client).json()["token"]
    assert client.get("/me", headers=headers(token)).status_code == 200
    changed = client.put("/me/password", headers=headers(token), json={"password": NEW_PASSWORD, "currentPassword": PASSWORD})
    assert changed.status_code == 200
    assert client.get("/me", headers=headers(other)).status_code == 401
    assert client.get("/me", headers=headers(token)).status_code == 401
    fresh = changed.json()["token"]
    assert client.request("DELETE", "/me/password", headers=headers(fresh), json={}).status_code == 401
    removed = client.request("DELETE", "/me/password", headers=headers(fresh), json={"currentPassword": NEW_PASSWORD})
    assert removed.status_code == 200 and not removed.json()["protected"]
    assert removed.json()["accessKind"] == "public"
    assert client.get("/me", headers=headers(fresh)).status_code == 401
    assert client.get("/me", headers=headers(removed.json()["token"])).status_code == 200
    assert login(client).json()["protected"] is False


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/me", None), ("GET", "/messages", None),
    ("GET", "/messages/m1", None), ("PATCH", "/messages/m1", {"seen": True}),
    ("DELETE", "/messages/m1", None), ("GET", "/messages/m1/attachments/attachment-1", None),
    ("GET", "/sources/m1", None), ("GET", "/messages/stream", None),
])
def test_all_mailbox_endpoints_reject_revoked_public_token(client, bearer, method, path, body):
    claim(client, bearer)
    response = client.request(method, path, headers=bearer, json=body)
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"
    assert response.headers["cache-control"] == "no-store"


def test_logout_only_current_session_and_login_keeps_other_devices(client, bearer):
    first = claim(client, bearer)
    second = login(client).json()["token"]
    assert client.post("/me/logout", headers=headers(first)).status_code == 204
    assert client.get("/me", headers=headers(first)).status_code == 401
    assert client.get("/me", headers=headers(second)).status_code == 200
    third = login(client).json()["token"]
    assert client.get("/me", headers=headers(second)).status_code == 200
    assert client.get("/me", headers=headers(third)).status_code == 200


@pytest.mark.parametrize("password", ["short", "x" * 129, 123, [], ""])
def test_password_validation_before_hashing(client, bearer, monkeypatch, password):
    def forbidden(*args):
        pytest.fail("invalid input reached hashing")
    monkeypatch.setattr(api_auth.MailboxAuth, "_hash", forbidden)
    assert client.put("/me/password", headers=bearer, json={"password": password}).status_code == 422
    assert login(client, password).status_code == 422


def test_admin_cookie_exchange_csrf_reset_remove_and_parent_logout(client, bearer):
    visitor = claim(client, bearer)
    csrf = admin(client)
    assert client.get("/me").status_code == 401  # Cookie cannot authenticate mailbox route.
    assert client.post("/token", json={"address": ADDRESS}).status_code == 401
    assert exchange(client, {}).status_code == 403
    assert client.put("/admin/api/mailboxes/password", json={"address": ADDRESS, "password": NEW_PASSWORD}).status_code == 403
    assert client.request("DELETE", "/admin/api/mailboxes/password", json={"address": ADDRESS}).status_code == 403
    session = client.get("/admin/api/session")  # Request from the normal mailbox page.
    assert session.status_code == 200 and "tmail_admin=" in session.request.headers["cookie"]
    exchanged = exchange(client, csrf)
    assert exchanged.status_code == 200
    assert "tmail_admin=" in exchanged.request.headers["cookie"]
    token = exchanged.json()["token"]
    me = client.get("/me", headers=headers(token))
    assert "cookie" not in me.request.headers
    assert me.json()["accessKind"] == "admin"
    reset = client.put("/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS, "password": NEW_PASSWORD})
    assert reset.status_code == 200 and "token" not in reset.json()
    assert client.get("/me", headers=headers(visitor)).status_code == 401
    assert client.get("/me", headers=headers(token)).status_code == 401
    token = exchange(client, csrf).json()["token"]
    assert client.post("/admin/api/logout", headers=csrf).status_code == 204
    assert client.get("/me", headers=headers(token)).status_code == 401
    assert login(client, NEW_PASSWORD).status_code == 200
    csrf = admin(client)
    result = client.request("DELETE", "/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS})
    assert result.status_code == 200 and not result.json()["protected"]


@pytest.mark.parametrize("operation", ["exchange", "reset", "remove"])
@pytest.mark.parametrize("expire", [False, True])
def test_admin_parent_racing_commit_fails_without_mutation(client, bearer, monkeypatch, operation, expire):
    visitor = claim(client, bearer)
    csrf = admin(client)
    state = client.app.state.state_store
    parent = hashlib.sha256(client.cookies.get("tmail_admin").encode()).hexdigest()
    observed = state.mailbox_security(ADDRESS)
    def invalidate():
        if expire:
            state.create_admin_session(parent, csrf["X-CSRF-Token"], datetime.now(timezone.utc) - timedelta(seconds=1))
        else:
            state.delete_admin_session(parent)
    name = "admin_mailbox_session" if operation == "exchange" else "mutate_mailbox"
    original = getattr(state, name)
    def racing(*args, **kwargs):
        invalidate()
        return original(*args, **kwargs)
    monkeypatch.setattr(state, name, racing)
    if operation == "exchange":
        response = exchange(client, csrf)
    elif operation == "reset":
        response = client.put("/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS, "password": NEW_PASSWORD})
    else:
        response = client.request("DELETE", "/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS})
    assert response.status_code == 401
    assert state.mailbox_security(ADDRESS) == observed
    assert client.get("/me", headers=headers(visitor)).status_code == 200
    with sqlite3.connect(state.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM mailbox_sessions WHERE admin_session_hash IS NOT NULL").fetchone()[0] == 0


def test_admin_token_expiry_does_not_renew_protection(client, bearer):
    claim(client, bearer)
    csrf = admin(client)
    state = client.app.state.state_store
    start = state.clock()
    before = state.mailbox_security(ADDRESS)
    token = exchange(client, csrf).json()["token"]
    assert state.mailbox_security(ADDRESS) == before
    state.clock = lambda: start + timedelta(hours=12, seconds=1)
    assert client.get("/me", headers=headers(token)).status_code == 401
    assert state.mailbox_security(ADDRESS) == before


def test_exact_protection_expiry_reclaim_and_incidental_password(client, bearer):
    visitor = claim(client, bearer)
    state = client.app.state.state_store
    deadline = datetime.fromisoformat(state.mailbox_security(ADDRESS)["protected_until"])
    state.clock = lambda: deadline
    assert client.get("/me", headers=headers(visitor)).status_code == 401
    public = login(client).json()
    assert not public["protected"] and public["accessKind"] == "public"
    assert client.get("/me", headers=bearer).status_code == 401
    claim(client, headers(public["token"]))
    assert client.get("/me", headers=headers(public["token"])).status_code == 401


def test_site_unlock_does_not_bypass_and_password_login_is_ip_limited(client, bearer):
    claim(client, bearer)
    credential, _ = _access_credential(client)
    access = client.post("/unlock", json={"credential": credential["secret"]}).json()["accessToken"]
    assert client.post("/token", headers=headers(access), json={"address": ADDRESS}).status_code == 401
    # Rotating elevated sessions cannot change the password-login IP bucket.
    for _ in range(9):
        assert login(client, "wrong password value", headers=headers(access)).status_code == 401
    access = client.post("/unlock", json={"credential": credential["secret"]}).json()["accessToken"]
    assert login(client, "wrong password value", headers=headers(access)).status_code == 429


def test_db_and_hash_failure_are_sanitized_and_fail_closed(client, bearer, monkeypatch):
    def fail(*args, **kwargs):
        raise sqlite3.OperationalError("private path/password")
    with monkeypatch.context() as patch:
        patch.setattr(client.app.state.state_store, "mailbox_security", fail)
        for response in (client.get("/me", headers=bearer), client.post("/token", json={"address": ADDRESS})):
            assert response.status_code == 503
            assert "private" not in response.text
            assert response.headers["cache-control"] == "no-store"
    def hash_fail(*args):
        raise api_auth.PasswordServiceError("private password")
    monkeypatch.setattr(api_auth.MailboxAuth, "_hash", hash_fail)
    response = client.put("/me/password", headers=bearer, json={"password": PASSWORD})
    assert response.status_code == 503 and "private" not in response.text
    assert not client.app.state.state_store.mailbox_security(ADDRESS)["password_hash"]


def test_hash_slots_reject_before_offload_and_survive_cancellation(monkeypatch):
    slots = threading.BoundedSemaphore(2)
    monkeypatch.setattr(api_auth, "_HASH_SLOTS", slots)
    started = threading.Event()
    release = threading.Event()
    def block():
        started.set()
        release.wait(3)
    async def exercise():
        first = asyncio.create_task(api_auth.mailbox_operation(block))
        while not started.is_set():
            await asyncio.sleep(.001)
        assert slots.acquire(blocking=False)
        try:
            with pytest.raises(api_auth.PasswordBusy):
                await api_auth.mailbox_operation(lambda: pytest.fail("overloaded work offloaded"))
            first.cancel()
            with pytest.raises(asyncio.CancelledError):
                await first
            assert not slots.acquire(blocking=False)
        finally:
            slots.release()
            release.set()
    asyncio.run(exercise())
    assert slots.acquire(blocking=False) and slots.acquire(blocking=False)


def test_claim_race_returns_conflict(client, bearer, monkeypatch):
    auth = client.app.state.mailbox_auth
    original = auth._hash
    once = False
    def racing(password):
        nonlocal once
        if not once:
            once = True
            auth.set_password(ADDRESS, NEW_PASSWORD)
        return original(password)
    monkeypatch.setattr(auth, "_hash", racing)
    result = client.put("/me/password", headers=bearer, json={"password": PASSWORD})
    assert result.status_code == 409
    assert login(client, NEW_PASSWORD).status_code == 200


def test_secured_ownership_mismatch_is_404(client, bearer):
    claim(client, bearer)
    token = client.app.state.mailbox_auth.set_password("other@example.com", PASSWORD)
    assert client.get("/messages/m1", headers=headers(token)).status_code == 404


def test_download_rechecks_before_delivery(client, bearer, fake_jmap):
    def revoke(*args):
        client.app.state.mailbox_auth.set_password(ADDRESS, PASSWORD)
        return (chunk for chunk in (b"private bytes",)), "text/plain"
    fake_jmap.download_blob.side_effect = revoke
    response = client.get("/sources/m1", headers=bearer)
    assert response.status_code == 401 and "private bytes" not in response.text


def test_sse_revocation_closes_during_blocked_poll_and_bounds_workers(client, bearer, fake_jmap, monkeypatch):
    slots = threading.BoundedSemaphore(2)
    monkeypatch.setattr(api_server, "_STREAM_SLOTS", slots)
    monkeypatch.setattr(api_server, "_STREAM_TICK", .02)
    started = threading.Event()
    release = threading.Event()
    active = 0
    maximum = 0
    lock = threading.Lock()
    def blocked(*args):
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        started.set()
        release.wait(3)
        with lock:
            active -= 1
        return 1, [{"id": "private"}]
    fake_jmap.list_messages.side_effect = blocked
    endpoint = next(r.endpoint for r in client.app.routes if r.path == "/messages/stream")
    async def exercise():
        async def connected():
            return False
        request = SimpleNamespace(app=client.app, is_disconnected=connected)
        token = bearer["Authorization"].split(" ")[1]
        access = {"address": ADDRESS, "token": token}
        response = await endpoint(request, access)
        pending = asyncio.create_task(anext(response.body_iterator))
        while not started.is_set():
            await asyncio.sleep(.001)
        await asyncio.to_thread(client.app.state.mailbox_auth.set_password, ADDRESS, PASSWORD)
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(pending, .5)
        assert not release.is_set()  # Poll remains blocked when the stream closes.
        # Repeated disconnects keep capacity occupied until the actual threads finish.
        new = client.app.state.mailbox_auth.login(ADDRESS, PASSWORD)
        access = {"address": ADDRESS, "token": new}
        for _ in range(5):
            response = await endpoint(request, access)
            pending = asyncio.create_task(anext(response.body_iterator))
            await asyncio.sleep(.04)
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
            await response.body_iterator.aclose()
        assert maximum <= 2 and active == 2
    try:
        asyncio.run(exercise())
    finally:
        release.set()
    assert maximum == 2


def test_hash_overload_is_429_without_mutation(client, bearer):
    assert api_auth._HASH_SLOTS.acquire(blocking=False)
    assert api_auth._HASH_SLOTS.acquire(blocking=False)
    try:
        result = client.put("/me/password", headers=bearer, json={"password": PASSWORD})
        assert result.status_code == 429 and result.json()["code"] == "password_busy"
        assert client.app.state.state_store.mailbox_security(ADDRESS)["password_hash"] is None
    finally:
        api_auth._HASH_SLOTS.release()
        api_auth._HASH_SLOTS.release()


def test_password_routes_share_existing_ip_throttle(client, bearer):
    for _ in range(10):
        assert client.put("/me/password", headers=bearer, json={"password": "short"}).status_code == 422
    assert client.put("/me/password", headers=bearer, json={"password": PASSWORD}).status_code == 429
    csrf = admin(client)
    for _ in range(10):
        assert client.put("/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS, "password": "short"}).status_code == 422
    assert client.put("/admin/api/mailboxes/password", headers=csrf, json={"address": ADDRESS, "password": PASSWORD}).status_code == 429


@pytest.mark.parametrize("kind", ["visitor_logout", "parent_logout", "parent_expiry", "password_reset", "protection_expiry"])
def test_sse_discards_results_after_failed_recheck(client, bearer, fake_jmap, monkeypatch, kind):
    token = claim(client, bearer)
    csrf = admin(client)
    state = client.app.state.state_store
    parent = hashlib.sha256(client.cookies.get("tmail_admin").encode()).hexdigest()
    if kind.startswith("parent"):
        token = exchange(client, csrf).json()["token"]
    calls = 0
    def poll(*args):
        nonlocal calls
        calls += 1
        if calls == 1:
            return 1, [{"id": "old"}]
        if kind == "visitor_logout":
            state.delete_mailbox_session(api_auth.MailboxAuth.token_hash(token))
        elif kind == "parent_logout":
            state.delete_admin_session(parent)
        elif kind == "parent_expiry":
            state.clock = lambda: datetime.now(timezone.utc) + timedelta(hours=12, seconds=1)
        elif kind == "password_reset":
            client.app.state.mailbox_auth.set_password(ADDRESS, NEW_PASSWORD, PASSWORD)
        else:
            deadline = datetime.fromisoformat(state.mailbox_security(ADDRESS)["protected_until"])
            state.clock = lambda: deadline
        return 1, [{"id": "new"}]
    fake_jmap.list_messages.side_effect = poll
    monkeypatch.setattr(api_server, "_STREAM_TICK", .01)
    state.update_settings({"fetch_seconds": 0})
    endpoint = next(r.endpoint for r in client.app.routes if r.path == "/messages/stream")
    async def exercise():
        async def connected():
            return False
        request = SimpleNamespace(app=client.app, is_disconnected=connected)
        response = await endpoint(request, {"address": ADDRESS, "token": token})
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(response.body_iterator), 2)
    asyncio.run(exercise())
    assert calls == 2


def test_successful_password_login_renews_deadline_but_not_existing_session(client, bearer):
    token = claim(client, bearer)
    state = client.app.state.state_store
    before = client.get("/me", headers=headers(token)).json()
    now = state.clock() + timedelta(days=1)
    state.clock = lambda: now
    response = login(client)
    assert response.status_code == 200
    after = client.get("/me", headers=headers(token)).json()
    assert datetime.fromisoformat(after["protectedUntil"]) == now + timedelta(days=90)
    assert after["sessionExpiresAt"] == before["sessionExpiresAt"]


@pytest.mark.parametrize("path", ["/me", "/messages", "/messages/m1", "/sources/m1", "/messages/m1/attachments/attachment-1"])
def test_mailbox_responses_are_not_cacheable(client, bearer, path):
    result = client.get(path, headers=bearer)
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"


def test_oversized_password_body_rejected_before_json_parsing(client, monkeypatch):
    from starlette.requests import Request
    async def forbidden(self):
        pytest.fail("oversized request parsed before body limit")
    monkeypatch.setattr(Request, "json", forbidden)
    result = client.post("/token", content='{"password":"' + 'x' * 9000 + '"}')
    assert result.status_code == 413
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["x-content-type-options"] == "nosniff"


def test_unicode_password_is_exact_and_preserves_spaces(client, bearer):
    password = " " + "🔐" * 10 + " "
    result = client.put("/me/password", headers=bearer, json={"password": password})
    assert result.status_code == 200
    assert login(client, password).status_code == 200
    assert login(client, "x" + "🔐" * 10 + "x").status_code == 401


@pytest.mark.parametrize("operation", ["claim", "change", "login", "remove", "admin"])
def test_response_time_revocation_is_conflict(client, bearer, monkeypatch, operation):
    auth = client.app.state.mailbox_auth
    state = client.app.state.state_store
    token = claim(client, bearer) if operation != "claim" else None
    csrf = admin(client) if operation == "admin" else None
    original = api_server.mailbox_token_response

    def racing(request, address, value):
        if operation == "admin":
            parent = hashlib.sha256(client.cookies.get("tmail_admin").encode()).hexdigest()
            state.delete_admin_session(parent)
        else:
            current = NEW_PASSWORD if operation == "change" else PASSWORD
            auth.set_password(ADDRESS, NEW_PASSWORD, current if operation != "remove" else None)
        return original(request, address, value)

    monkeypatch.setattr(api_server, "mailbox_token_response", racing)
    if operation == "claim":
        result = client.put("/me/password", headers=bearer, json={"password": PASSWORD})
    elif operation == "change":
        result = client.put("/me/password", headers=headers(token), json={"password": NEW_PASSWORD, "currentPassword": PASSWORD})
    elif operation == "login":
        result = login(client)
    elif operation == "remove":
        result = client.request("DELETE", "/me/password", headers=headers(token), json={"currentPassword": PASSWORD})
    else:
        result = exchange(client, csrf)
    assert result.status_code == 409, result.text
    assert result.json()["code"] == "mailbox_conflict"
    assert result.headers["cache-control"] == "no-store"


def test_sse_revocation_closes_when_shared_threadpool_is_saturated(client, bearer, fake_jmap, monkeypatch):
    import anyio

    token = claim(client, bearer)
    monkeypatch.setattr(api_server, "_STREAM_TICK", .02)
    started = threading.Event()
    release = threading.Event()
    fake_jmap.list_messages.return_value = (0, [])
    endpoint = next(r.endpoint for r in client.app.routes if r.path == "/messages/stream")

    def block():
        started.set()
        release.wait(3)

    async def exercise():
        async def connected():
            return False
        request = SimpleNamespace(app=client.app, is_disconnected=connected)
        response = await endpoint(request, {"address": ADDRESS, "token": token})
        limiter = anyio.to_thread.current_default_thread_limiter()
        previous = limiter.total_tokens
        limiter.total_tokens = 1
        worker = asyncio.create_task(api_server.run_in_threadpool(block))
        pending = None
        try:
            while not started.is_set():
                await asyncio.sleep(.001)
            pending = asyncio.create_task(anext(response.body_iterator))
            await asyncio.sleep(.04)
            client.app.state.state_store.delete_mailbox_session(api_auth.MailboxAuth.token_hash(token))
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(asyncio.shield(pending), .5)
            assert not release.is_set()
        finally:
            release.set()
            await worker
            if pending is not None and not pending.done():
                pending.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await pending
            await response.body_iterator.aclose()
            limiter.total_tokens = previous

    asyncio.run(exercise())


@pytest.mark.parametrize("disconnect", [False, True])
def test_sse_authorization_timeout_and_disconnect_retain_worker_capacity(client, bearer, monkeypatch, disconnect):
    from concurrent.futures import ThreadPoolExecutor

    slots = threading.BoundedSemaphore(1)
    pool = ThreadPoolExecutor(max_workers=1)
    monkeypatch.setattr(api_server, "_STREAM_AUTH_SLOTS", slots)
    monkeypatch.setattr(api_server, "_STREAM_AUTH_POOL", pool)
    monkeypatch.setattr(api_server, "_STREAM_TICK", .02)
    started = threading.Event()
    release = threading.Event()
    calls = 0

    def blocked(*args):
        nonlocal calls
        calls += 1
        started.set()
        release.wait(3)
        raise ValueError("revoked")

    monkeypatch.setattr(api_server, "_resolve_mailbox_access", blocked)
    endpoint = next(r.endpoint for r in client.app.routes if r.path == "/messages/stream")

    async def exercise():
        async def connected():
            return False
        request = SimpleNamespace(app=client.app, is_disconnected=connected)
        access = {"address": ADDRESS, "token": bearer["Authorization"].split(" ")[1]}
        response = await endpoint(request, access)
        pending = asyncio.create_task(anext(response.body_iterator))
        while not started.is_set():
            await asyncio.sleep(.001)
        if disconnect:
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
        else:
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(pending, .5)
        await response.body_iterator.aclose()
        assert not release.is_set()
        assert not slots.acquire(blocking=False)
        for _ in range(3):
            response = await endpoint(request, access)
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(anext(response.body_iterator), .5)
        assert calls == 1

    try:
        asyncio.run(exercise())
    finally:
        release.set()
        pool.shutdown(wait=True)
    assert slots.acquire(blocking=False)
    slots.release()


def test_response_time_database_failure_remains_service_error(client, bearer, monkeypatch):
    def fail(*args):
        raise sqlite3.OperationalError("private database path")

    monkeypatch.setattr(client.app.state.mailbox_auth, "resolve", fail)
    result = client.post("/token", json={"address": ADDRESS})
    assert result.status_code == 503
    assert "private" not in result.text
    assert result.headers["cache-control"] == "no-store"
