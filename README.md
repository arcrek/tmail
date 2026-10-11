# TMail

Temporary-mail service for domains handled by Postfix and Stalwart. It provisions domains whose MX points to this server, then provides an inbox that is public by default, optional mailbox password protection, and an administrator console.

## Scope

- Postfix calls the policy daemon for each recipient domain.
- The daemon verifies the domain's MX record and provisions accepted domains in Stalwart.
- Visitors choose an active domain and open a public address-scoped inbox without creating an account. Optional password protection is available on the mailbox page and through the API.
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

## Production deployment

The verified production route runs the API and frontend with Docker Compose from
`/home/ubuntu/tmail/compose.yaml`. The Compose services use the GHCR API and
frontend images, and the named `tmail_tmail-data` volume persists the runtime
configuration, domain cache, and SQLite state. The seed configuration is the
deployment checkout's `/home/ubuntu/tmail/config.json`; the API container is
`tmail-api-1`. On the host, Docker currently stores that volume at
`/var/lib/docker/volumes/tmail_tmail-data/_data`.

Before each upgrade, stop the existing API workers and retain a verified SQLite
backup before the new image can migrate the database. Prepare a reviewed
Compose deployment input that pins both images to an immutable revision or
digest; the base manifest defaults to `latest`, which is not a release pin.
Start the API and frontend only after the backup and pinned references are
ready, then verify container health and the running image revisions/digests.

The production API currently runs one Python worker without a cgroup CPU or RAM
cap. Calibrate Argon2id on the actual host and worker topology, including
aggregate memory for the two process-local hash slots, before release. Local
timings do not certify production.

Once mailbox protection has been used, never roll back to a passwordless image;
retain password enforcement or stop the API. A separately authorized backup
restore can revive old credentials and sessions.

Postfix must own port 25 and consult `inet:127.0.0.1:10030`, as shown in
`deploy/postfix_main_snippet.cf`. Stalwart receives accepted relay mail on port
2525.

### Compose API with systemd policy and janitor

The verified topology keeps `tmail-policy.service` active for Postfix while
`tmail-api.service` remains inactive so only the Compose API owns web traffic.
The daily janitor runs inside `tmail-api-1` through
`deploy/tmail-janitor-docker.conf` and `tmail-janitor.timer`, so it reads the
same persistent state as the API. Do not run a second API or a host janitor
against a different configuration path.

### Checkout-based systemd alternate

`deploy/install.sh`/`deploy/release.sh` remain supported for a checkout-based
deployment in which both `tmail-policy.service` and `tmail-api.service` run
under systemd. That alternate uses `/var/lib/tmail-policy/config.json` as
mutable runtime configuration and keeps the release under `/opt/tmail-policy`
read-only to the service. Keep the systemd API disabled when the Compose API
route is active.

If the Compose API is introduced after a checkout-based install, disable the
systemd copy before starting Compose — otherwise two independent API processes
use two independent configuration stores, and edits to one silently do nothing
for the other:

```bash
sudo systemctl disable --now tmail-api.service
```

For a Compose API deployment, run the daily retention janitor inside the API
container as well. Otherwise it reads the host config rather than the settings
saved by the admin console in the Docker volume:

```bash
sudo install -d /etc/systemd/system/tmail-janitor.service.d
sudo install -m 644 deploy/tmail-janitor-docker.conf \
  /etc/systemd/system/tmail-janitor.service.d/docker.conf
sudo systemctl daemon-reload
sudo systemctl enable --now tmail-janitor.timer
```

The drop-in defaults to container `tmail-api-1`. If your Compose project uses another name,
set `Environment=TMAIL_API_CONTAINER=<container-name>` in the drop-in. The API container
must be running when the daily job fires (03:00 UTC on this production host, with up to
30 minutes of randomized delay). Saving retention days takes effect at the next run;
it does not immediately delete old messages. To return to the host janitor, remove only
`/etc/systemd/system/tmail-janitor.service.d/docker.conf` and run `sudo systemctl daemon-reload`.

`tmail-policy.service` has no Docker Compose equivalent in this repo (`compose.yaml` only defines
`api` and `frontend`) — Postfix still needs it running via systemd regardless of how you serve the
web API.

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

`POST /token` validates an active address and issues a signed bearer for a public
mailbox. A protected mailbox requires `password` in that JSON body
and returns a revocable visitor token valid for 90 days. `POST /accounts` only
validates the address and reports protection metadata; it does not authenticate.

The API supports `PUT /me/password` to claim or change protection and
`DELETE /me/password` to remove it. Protected visitor changes/removal require
`currentPassword`; claim/change supplies the new `password`. Passwords contain 12–128 Unicode characters, preserving spaces.
Successful mutations return a replacement token. `POST /me/logout` revokes only
that secured session. `GET /me` and token responses report `protected`,
`protectedUntil`, `accessKind`, and `sessionExpiresAt`.

Any visitor can claim the first password on a public address, including an
existing address; the first successful claim wins and can lock out earlier
visitors. There is no self-service password recovery.

Visitor sessions expire exactly 90 days after issuance. A successful password
login renews protection and creates another session without extending older
sessions or signing out other devices.

Protection expires 90 days after creation, change, reset, or successful password
login. At expiry the mailbox becomes public; reading mail does not renew it.
Protection changes and expiry invalidate earlier mailbox tokens without deleting
mail. Site unlock never bypasses a mailbox password.

Administrators explicitly exchange their existing `/admin` cookie and CSRF token
through `POST /admin/api/mailboxes/token` with an `address`. Admin password
reset/removal use `PUT`/`DELETE /admin/api/mailboxes/password`; reset adds
`password`. These operations require `X-CSRF-Token`. Admin mailbox tokens expire
no later than their 12-hour parent session and never renew protection. These routes are available
in `/docs`. Missing/wrong credentials return 401, invalid inputs 422, lost
claims or mutation races 409, and throttling/hash-capacity exhaustion 429.
Hydra errors can include a stable `code` such as `password_required`,
`invalid_credentials`, `invalid_token`, or `password_busy`. Storage/hash failures
return sanitized service errors and deny access.

On the normal mailbox page, use **Set password**, **Change password**, or
**Remove password**. The form shows the protection deadline and explains the
90-day expiry. Protected visitors supply their current password to change or
remove protection. Signed-in administrators can reset or remove it there without
the current mailbox password. Administrator mailbox logout signs out the parent
administrator session too.

Saved visitor tokens are validated before displaying mail. Passwords, CSRF
values, and administrator mailbox tokens are never persisted in browser storage.
Visitor logout clears this browser's saved token and requests server revocation;
an offline logout reports when server revocation cannot be confirmed. Revocation
in other browsers is detected on the next server authorization check. Bulk code
reading uses valid saved visitor access or an administrator exchange; locked
rows link to the normal mailbox login page.

## Password-protection upgrades and rollback

Keep the configured SQLite path (production `/var/lib/tmail-policy/state.db`
in the persistent `tmail-data` volume). Stop old API workers before upgrading.
Startup takes and verifies a consistent SQLite backup beside an existing
unversioned database, then applies additive schema changes atomically. Keep
backups private and verify them; copying only a live WAL database file is unsafe.
See [migration and authorization details](docs/architecture.md#state-database-upgrades-and-mailbox-lifecycle).

Once protection is used, rollback must retain password enforcement or stop the
service. Never run the old passwordless application against protected state or
delete security records. A separately authorized backup restore can revive old
passwords and sessions. SMTP delivery and message retention are unchanged.

Before release, calibrate Argon2id on deployment-equivalent CPU, RAM, and worker
count. Current settings are 32 MiB, two passes, one lane, and two concurrent
hash slots per process; size aggregate memory across workers and verify overload
rejection. Record latency and peak memory with headroom before tuning; do not go
below 19 MiB, two passes, and one lane. Local timings do not certify production.

## License

[MIT](LICENSE)
