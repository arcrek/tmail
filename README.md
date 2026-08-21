# TMail

Temporary-mail service for domains handled by Postfix and Stalwart. It provisions domains whose MX points to this server, then provides a passwordless public inbox and an administrator console.

## Scope

- Postfix calls the policy daemon for each recipient domain.
- The daemon verifies the domain's MX record and provisions accepted domains in Stalwart.
- Visitors choose an active domain and open an address-scoped inbox without creating an account or password.
- Administrators manage website settings, the public domain list, and web-only domain blocks.

This project does not manage DNS, configure TLS, or replace Postfix/Stalwart. A domain blocked in the admin console remains configured for mail delivery; it is only unavailable through the public website and API.

## Requirements

- Python 3.10+
- Node.js `^20.19.0 || >=22.12.0` and npm
- Postfix
- Stalwart with JMAP enabled and a bearer token that can manage domains and read the catch-all mailbox

## Configure

Copy `config.example.json` to `config.json`, then set the Stalwart connection values, `mx_hostname`, and `catchall_address`.

```bash
cp config.example.json config.json
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Use the generated value as `api_token_secret`; it must contain at least 32 characters. Set a strong, non-empty `admin_password`, and keep `config.json` at mode `0600`.

For local development, set `cache_file`, `state_db`, and `frontend_dist` to writable paths in the checkout; for example:

```json
{
  "cache_file": "domains.json",
  "state_db": "state.db",
  "frontend_dist": "frontend/dist"
}
```

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cd frontend && npm install && npm run build
cd ..
TMAIL_CONFIG="$PWD/config.json" .venv/bin/python -m src.api_server
```

For frontend development, run `npm run dev` in `frontend/`; Vite proxies API and admin requests to `127.0.0.1:8000`.

## Run with Docker Compose

Create and secure `config.json`, then:

```bash
cp .env.example .env
docker compose up -d --build
```

The application is available at `http://127.0.0.1:8080`. Use `TMAIL_HTTP_PORT` to change the port. The `tmail-data` volume keeps runtime configuration, cached domains, and application state across rebuilds.

Use an HTTPS reverse proxy in production. The default Compose bind exposes the service on all interfaces, so protect it with a network boundary. If the proxy sanitizes forwarded headers, enable trusted forwarding with `TMAIL_TRUST_FORWARD_HEADERS=on`. Note the bundled nginx config does not strip `CF-Connecting-IP`; since the rate limiter trusts that header unconditionally (see "Running behind Cloudflare" below), any client able to reach this Compose deployment directly can spoof it to bypass rate limiting unless your proxy strips or overwrites it.

## Production installation

On the mail server, from a checkout containing `config.json`:

```bash
sudo bash deploy/install.sh
```

For later deployments:

```bash
./deploy/deploy.sh root@example-host
```

The deployed services use `/var/lib/tmail-policy/config.json` as mutable runtime configuration. The release under `/opt/tmail-policy` remains read-only to the service.

Postfix must own port 25 and consult `inet:127.0.0.1:10030`, as shown in `deploy/postfix_main_snippet.cf`. Stalwart receives accepted relay mail on port 2525.

### Running behind Cloudflare

This site is published through Cloudflare's **DNS proxy** (the orange-clouded record) —
**not** Cloudflare Tunnel. That means the origin still has a public listening port (e.g.
`TMAIL_HTTP_PORT`, default `8080`); Cloudflare sits in front as a reverse proxy, but nothing
stops a client who learns the origin's IP address from connecting to it directly.

The rate limiter trusts the `CF-Connecting-IP` header unconditionally to key its per-visitor
buckets (`src/api_server.py`'s `_client_ip`). That is only safe if every request is guaranteed
to have passed through Cloudflare's edge first. Under a DNS-proxy setup, that guarantee holds
**only if the origin firewall drops everything except Cloudflare's own IP ranges** — otherwise
a client can bypass Cloudflare entirely, forge an arbitrary `CF-Connecting-IP` value per
request, and defeat the rate limiter on `/accounts`, `/token`, `/unlock`, `/admin/login`, and
`/admin/api/login`.

**Required: restrict the origin firewall to Cloudflare's IP ranges.**

```bash
# fetch Cloudflare's current edge ranges
curl -s https://www.cloudflare.com/ips-v4 -o /etc/cloudflare-ips-v4.txt
curl -s https://www.cloudflare.com/ips-v6 -o /etc/cloudflare-ips-v6.txt

# ufw (adjust the port to whatever the origin actually listens on, e.g. 8080)
ufw default deny incoming
while read -r cidr; do ufw allow proto tcp from "$cidr" to any port 80,443,8080; done \
    < /etc/cloudflare-ips-v4.txt
while read -r cidr; do ufw allow proto tcp from "$cidr" to any port 80,443,8080; done \
    < /etc/cloudflare-ips-v6.txt
ufw allow OpenSSH   # don't lock yourself out
ufw enable
```

Equivalent with `iptables`/`ip6tables`:

```bash
while read -r cidr; do
    iptables -A INPUT -p tcp -s "$cidr" --dport 8080 -j ACCEPT
done < /etc/cloudflare-ips-v4.txt
iptables -A INPUT -p tcp --dport 8080 -j DROP
```

Cloudflare's ranges change occasionally — re-fetch and re-apply on a schedule (weekly cron or
systemd timer) rather than allowlisting once. For defense in depth beyond the IP allowlist,
also enable Cloudflare **Authenticated Origin Pulls** (client-cert mTLS the origin can verify),
which doesn't depend on the IP list staying current, and set the Cloudflare SSL/TLS mode to
**Full (strict)** so the tunnel between edge and origin is itself encrypted and verified.

## Use

- `/` — choose or open a temporary inbox.
- `/admin` — administrator console.
- `/{address}` — open an active address directly.
- `/docs` — API documentation.

`POST /token` validates an active address and issues its stateless bearer token. The token can access only that address's messages; no mailbox password or account record is created.

## License

[MIT](LICENSE)
