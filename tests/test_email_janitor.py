import json
import logging
from datetime import datetime, timezone

import httpx
import pytest

from src import email_janitor
from src.jmap_client import JmapUpstreamError


def envelope(method, **data):
    return {"methodResponses": [[method, {"accountId": "mail-account", **data}, "0"]]}


@pytest.fixture
def upstream(monkeypatch, tmp_path):
    requests, responses = [], []
    real_client = httpx.Client

    def handle(request):
        requests.append(request)
        assert len(requests) <= 12, "Retention loop exceeded deterministic request cap"
        assert request.headers["authorization"] == "Bearer synthetic-token"
        assert responses, "Unexpected upstream request (possible stalled loop)"
        result = responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result if isinstance(result, httpx.Response) else httpx.Response(200, json=result)

    monkeypatch.setattr(email_janitor.httpx, "Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handle), **kwargs
    ))

    class FrozenTime(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz == timezone.utc
            return cls(2026, 10, 9, 16, 0, tzinfo=tz)

    monkeypatch.setattr(email_janitor, "datetime", FrozenTime)
    config = tmp_path / "config.json"
    config.write_text(json.dumps({
        "jmap_url": "https://mail.example/jmap", "jmap_token": "synthetic-token",
        "catchall_address": "admin@example.com", "mx_hostname": "mail.example",
        "mail_account_id": "mail-account", "retention_days": 30,
        "listen_addr": "127.0.0.1", "listen_port": 10030,
        "cache_file": str(tmp_path / "domains.json"), "state_db": str(tmp_path / "state.db"),
    }))
    return requests, responses, config


@pytest.mark.parametrize("discovery", [False, True])
def test_requests_and_successive_batches(upstream, caplog, discovery):
    requests, responses, config = upstream
    if discovery:
        data = json.loads(config.read_text())
        data["mail_account_id"] = ""
        config.write_text(json.dumps(data))
        responses.append({"primaryAccounts": {"urn:ietf:params:jmap:mail": "mail-account"}})
    responses.extend([
        envelope("Email/query", ids=["a", "b"]),
        envelope("Email/set", destroyed=["a"], notDestroyed={"b": {"type": "serverFail"}}),
        envelope("Email/query", ids=["b"]),
        envelope("Email/set", destroyed=["b"], notDestroyed=None),
        envelope("Email/query", ids=["c"]),
        envelope("Email/set", destroyed=["c"]),
        envelope("Email/query", ids=[]),
    ])
    with caplog.at_level(logging.INFO):
        email_janitor.run(str(config))
    calls = [json.loads(request.content) for request in requests if request.method == "POST"]
    for index, call in enumerate(calls):
        assert call["using"] == email_janitor._USING
        name, args, call_id = call["methodCalls"][0]
        assert args["accountId"] == "mail-account"
        assert call_id == "0"
        if index % 2 == 0:
            assert name == "Email/query"
            assert args == {"accountId": "mail-account", "filter": {"before": "2026-09-09T16:00:00Z"}, "limit": 50, "position": 0}
        else:
            assert name == "Email/set"
            assert args["destroy"] == [["a", "b"], ["b"], ["c"]][index // 2]
    assert "Total emails deleted: 3" in caplog.text
    assert "Failed to destroy 1 emails" in caplog.text
    assert not responses
    assert (requests[0].method == "GET") == discovery


def test_empty_query_is_success(upstream, caplog):
    requests, responses, config = upstream
    responses.append(envelope("Email/query", ids=[]))
    with caplog.at_level(logging.INFO):
        email_janitor.run(str(config))
    assert len(requests) == 1
    assert "Total emails deleted: 0" in caplog.text


@pytest.mark.parametrize("destroy", [{}, {"destroyed": []}, {"destroyed": None},
    {"notDestroyed": {"b": {"type": "forbidden"}}},
    {"destroyed": None, "notDestroyed": {"b": {"type": "forbidden"}}}])
@pytest.mark.parametrize("partial_first", [False, True])
def test_stalled_batch_raises_immediately(upstream, destroy, partial_first):
    requests, responses, config = upstream
    if partial_first:
        responses.extend([envelope("Email/query", ids=["a", "b"]), envelope("Email/set", destroyed=["a"])])
    responses.extend([envelope("Email/query", ids=["b"]), envelope("Email/set", **destroy)])
    with pytest.raises(JmapUpstreamError):
        email_janitor.run(str(config))
    assert len(requests) == (4 if partial_first else 2)
    assert not responses


@pytest.mark.parametrize("method", ["Email/query", "Email/set"])
@pytest.mark.parametrize("kind", ["http", "json", "transport", "error", "method", "call", "account", "envelope", "responses", "empty", "extra", "tuple", "data"])
def test_invalid_upstream_response_raises(upstream, method, kind):
    requests, responses, config = upstream
    result = envelope(method, ids=[], destroyed=["a"])
    item = result["methodResponses"][0]
    if kind == "http": result = httpx.Response(503)
    elif kind == "json": result = httpx.Response(200, content=b"not json")
    elif kind == "transport": result = httpx.ConnectError("synthetic failure")
    elif kind == "error": item[0] = "error"
    elif kind == "method": item[0] = "Email/get"
    elif kind == "call": item[2] = "wrong"
    elif kind == "account": item[1]["accountId"] = "other-account"
    elif kind == "envelope": result = []
    elif kind == "responses": result["methodResponses"] = {}
    elif kind == "empty": result["methodResponses"] = []
    elif kind == "extra": result["methodResponses"].append(item)
    elif kind == "tuple": item.pop()
    elif kind == "data": item[1] = []
    if method == "Email/set": responses.append(envelope("Email/query", ids=["a"]))
    responses.append(result)
    with pytest.raises(JmapUpstreamError):
        email_janitor.run(str(config))
    assert len(requests) == (2 if method == "Email/set" else 1)


@pytest.mark.parametrize("ids", [None, {}, "a", [1]])
def test_invalid_query_ids(upstream, ids):
    _, responses, config = upstream
    responses.append(envelope("Email/query", ids=ids))
    with pytest.raises(JmapUpstreamError): email_janitor.run(str(config))


@pytest.mark.parametrize("data", [
    {"destroyed": "a"}, {"destroyed": {}}, {"destroyed": [1]},
    {"destroyed": ["unrequested"]}, {"destroyed": ["a", "a"]},
    {"destroyed": ["a"], "notDestroyed": []},
    {"notDestroyed": {"a": "error"}}, {"notDestroyed": {"a": {}}},
    {"notDestroyed": {"other": {"type": "forbidden"}}},
    {"destroyed": ["a"], "notDestroyed": {"a": {"type": "forbidden"}}},
])
def test_invalid_destroy_result(upstream, data):
    _, responses, config = upstream
    responses.extend([envelope("Email/query", ids=["a"]), envelope("Email/set", **data)])
    with pytest.raises(JmapUpstreamError): email_janitor.run(str(config))
