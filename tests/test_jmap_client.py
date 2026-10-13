from __future__ import annotations
import pytest
from unittest.mock import patch, MagicMock
from src.jmap_client import JmapClient, JmapUpstreamError

CLIENT = JmapClient(
    "https://mail.tm-mails.com/jmap/",
    "token123",
    "admin@mail.tm-mails.com",
)

def _mock_response(json_body: dict) -> MagicMock:
    m = MagicMock()
    m.json.return_value = json_body
    m.raise_for_status = MagicMock()
    return m

def test_provision_domain_success():
    resp = {"methodResponses": [["x:Domain/set", {"created": {"new-0": {"id": "abc"}}}, "0"]]}
    with patch("src.jmap_client.httpx.post", return_value=_mock_response(resp)):
        assert CLIENT.provision_domain("newdomain.com") is True

def test_provision_domain_jmap_not_created():
    resp = {"methodResponses": [["x:Domain/set", {"notCreated": {"new-0": {"type": "serverFail"}}}, "0"]]}
    with patch("src.jmap_client.httpx.post", return_value=_mock_response(resp)):
        assert CLIENT.provision_domain("newdomain.com") is False

def test_provision_domain_already_exists_returns_true():
    resp = {"methodResponses": [["x:Domain/set", {"notCreated": {"new-0": {"type": "alreadyExists"}}}, "0"]]}
    with patch("src.jmap_client.httpx.post", return_value=_mock_response(resp)):
        assert CLIENT.provision_domain("newdomain.com") is True

def test_provision_domain_network_error():
    with patch("src.jmap_client.httpx.post", side_effect=Exception("connection refused")):
        assert CLIENT.provision_domain("newdomain.com") is False

def test_list_domains_success():
    resp = {"methodResponses": [["x:Domain/get", {"list": [{"name": "example.com"}, {"name": "test.org"}]}, "0"]]}
    with patch("src.jmap_client.httpx.post", return_value=_mock_response(resp)):
        result = CLIENT.list_domains()
    assert result == ["example.com", "test.org"]

def test_list_domains_network_error_raises_sanitized_error():
    with patch("src.jmap_client.httpx.post", side_effect=Exception("timeout")):
        with pytest.raises(JmapUpstreamError, match="JMAP upstream request failed"):
            CLIENT.list_domains()

def test_list_domains_method_error_raises_sanitized_error():
    resp = {"methodResponses": [["error", {
        "type": "unknownMethod", "description": "private upstream detail",
    }, "0"]]}
    with patch("src.jmap_client.httpx.post", return_value=_mock_response(resp)):
        with pytest.raises(JmapUpstreamError) as caught:
            CLIENT.list_domains()
    assert "private upstream detail" not in str(caught.value)

def test_provision_sends_correct_domain_name():
    captured = {}
    def fake_post(url, json, headers, timeout):
        captured["payload"] = json
        resp = MagicMock()
        resp.json.return_value = {"methodResponses": [["x:Domain/set", {"created": {"new-0": {"id": "x"}}}, "0"]]}
        resp.raise_for_status = MagicMock()
        return resp
    with patch("src.jmap_client.httpx.post", side_effect=fake_post):
        CLIENT.provision_domain("example.com")
    create_obj = captured["payload"]["methodCalls"][0][1]["create"]["new-0"]
    assert create_obj["name"] == "example.com"
    assert create_obj["catchAllAddress"] == "admin@mail.tm-mails.com"


def test_get_session_concurrent_threads_fetch_once():
    import threading

    barrier = threading.Barrier(4)
    calls = 0

    class FakeHttp:
        def get(self, url, headers, timeout, follow_redirects):
            nonlocal calls
            calls += 1
            return _mock_response({
                "apiUrl": "https://api.mail.tm-mails.com/jmap/",
                "primaryAccounts": {"urn:ietf:params:jmap:mail": "acc-1"},
            })

    client = JmapClient(
        "https://mail.tm-mails.com/jmap/",
        "token123",
        "admin@mail.tm-mails.com",
        client=FakeHttp(),
    )
    results = []

    def worker():
        barrier.wait(1)
        results.append(client.discover_mail_account_id())

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(2)

    assert results == ["acc-1"] * 4
    assert calls == 1
    assert client._api_url == "https://api.mail.tm-mails.com/jmap/"

