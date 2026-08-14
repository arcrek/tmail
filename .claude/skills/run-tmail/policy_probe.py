"""Send a real Postfix-protocol policy request to a running
src.policy_daemon instance and print its verdict. Used to exercise
the MX-mismatch / MX-lookup-error paths (Dashboard "Recent MX
failures") end to end with a real DNS lookup.

Usage: python3 policy_probe.py <host> <port> <recipient-domain>

Two domains reliably produce each event without needing a domain you
control:
  - a real domain whose MX will never equal this project's configured
    mx_hostname, e.g. google.com -> mx_mismatch
  - a domain with a label > 63 octets, e.g. ("a"*300 + ".test") ->
    dnspython raises before any network call -> mx_lookup_error
"""
from __future__ import annotations

import socket
import sys


def send_policy(host: str, port: int, domain: str) -> str:
    with socket.create_connection((host, port), timeout=10) as sock:
        sock.sendall(f"request=smtpd_access_policy\nrecipient=user@{domain}\n\n".encode())
        return sock.recv(4096).decode(errors="replace")


if __name__ == "__main__":
    _, host, port, domain = sys.argv
    print(send_policy(host, int(port), domain))
