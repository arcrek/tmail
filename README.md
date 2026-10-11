# TMail

Temporary inboxes for domains served by Postfix and Stalwart. TMail verifies
receiving domains, provisions them in Stalwart, and provides a web inbox, a REST
API, and an administrator console.

Inboxes are **public by default**. Optional passwords restrict access temporarily;
protection expires after 90 days without renewal and the mailbox becomes public.

[Getting started](#getting-started) · [Deployment](#production-deployment) ·
[Documentation](docs/README.md) · [License](#license)

## Overview

- Open an address on an active domain without creating an account.
- Read mail in the browser or through the API, with optional mailbox passwords.
- Manage site settings, public domains, and access credentials from `/admin`.
- Provision domains whose MX points to your server and purge expired messages
  through a scheduled retention job.

TMail works alongside your mail servers. It does not manage DNS, configure TLS,
or replace Postfix and Stalwart. Blocking a domain in the admin console hides it
from the public website and API; SMTP delivery continues.

See [architecture](docs/architecture.md) for service boundaries and security
constraints.

## Requirements

For any deployment:

- Postfix and Stalwart, with Stalwart JMAP enabled.
- A Stalwart bearer token permitted to manage domains and read the catch-all mailbox.
- Receiving-domain MX records pointing to the configured `mx_hostname`.

For containers, use Docker with Compose. For a source installation, use Python
3.10+ and Node.js `^20.19.0 || >=22.12.0` with npm. Container builds supply their
own Python and Node.js runtimes.

## Getting started

Run these commands from the repository root. They start the web application;
mail delivery also requires [Postfix and the policy service](docs/deployment.md).
For an existing deployment, follow the [upgrade procedure](docs/deployment.md#upgrades-and-rollback)
before starting a new release.

### Configure

Use [config.example.json](config.example.json) as the configuration reference:

```bash
cp config.example.json config.json
chmod 600 config.json
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Set `jmap_url`, `jmap_token`, `mx_hostname`, and `catchall_address` for your mail
server. Store the generated secret as `api_token_secret` (at least 32 characters),
set a strong, non-empty `admin_password`, and keep the file private. For Compose,
`jmap_url` must be reachable from inside the API container; `127.0.0.1` there
refers to the container itself.

### Start with published images

The [Compose manifest](compose.yaml) uses GHCR images and persists runtime
configuration, cached domains, and application state in the `tmail-data` volume.

```bash
docker compose pull
docker compose up -d
```

Open `http://127.0.0.1:8081`. Set `TMAIL_HTTP_BIND` and `TMAIL_HTTP_PORT` to change
the listener. The supplied [.env.example](.env.example) uses `0.0.0.0:8080`, so
copying it exposes the listener on all interfaces. Keep production traffic behind
an HTTPS reverse proxy and the [origin access boundary](docs/deployment.md#running-behind-cloudflare).

To build images from this checkout instead:

```bash
docker compose -f compose.local.yml up -d --build
```

### Run from source

Set `cache_file`, `state_db`, and `frontend_dist` in `config.json` to writable
checkout paths: `domains.json`, `state.db`, and `frontend/dist`, respectively.
Then install dependencies, build the frontend, and start the API:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
(cd frontend && npm ci && npm run build)
TMAIL_CONFIG="$PWD/config.json" .venv/bin/python -m src.api_server
```

Open `http://127.0.0.1:8000`. In a separate terminal, start the policy daemon if
Postfix is configured to use it:

```bash
TMAIL_CONFIG="$PWD/config.json" .venv/bin/python -m src.policy_daemon
```

## Usage

| Route | Purpose |
|---|---|
| `/` | Choose or open a temporary inbox |
| `/{address}` | Open an active address directly |
| `/admin` | Manage the site |
| `/docs` | Explore the API schemas and endpoints |

Use **Set password**, **Change password**, or **Remove password** on the mailbox
page. Any visitor can claim the first password on a public address, including an
address already in use. There is no self-service password recovery. Reads do not
renew protection, and site unlock does not bypass a mailbox password.

Read [mailbox access](docs/mailbox-access.md) for expiry, sessions, administrator
access, logout behavior, and API entry points.

## Production deployment

Choose Compose for the web services or the checkout-based systemd installation.
Compose does not include the SMTP policy daemon. Keep one API configuration owner
and run the retention janitor against that same runtime configuration.

Before upgrading, stop old API workers, retain a verified SQLite backup, and pin
both container images to a reviewed revision or digest. Once password protection
has been used, rollback must preserve password enforcement or stop the API.
Calibrate password hashing on the actual deployment hardware and worker count.

The [deployment and operations guide](docs/deployment.md) covers the recorded
production route, systemd installation, janitor scheduling, reverse proxy
boundaries, backups, and rollback.

### Hybrid

When Compose serves the web application, keep the systemd policy daemon active,
disable the systemd API, and run the janitor inside the API container. See
[service ownership](docs/deployment.md#service-ownership) for the setup.
The host policy daemon uses separate runtime files; synchronize its mail-server
settings when changing them through `/admin`.

### Running behind Cloudflare

Restrict direct origin access and configure forwarded headers at the trusted
proxy. The API trusts `CF-Connecting-IP` unconditionally; follow the
[Cloudflare deployment guidance](docs/deployment.md#running-behind-cloudflare)
to preserve the rate-limiting boundary.

## Development

For frontend development, run `npm run dev` from `frontend/` alongside the local
API. Vite proxies API and admin requests to `127.0.0.1:8000`.

Run the backend and frontend checks after installing the source dependencies:

```bash
.venv/bin/pytest
(cd frontend && npm test && npm run build)
```

See [contributor guidance](AGENT.md) for browser security checks and the local
mail fixture. [CI](.github/workflows/docker-publish.yml) owns the release checks;
[frontend scripts](frontend/package.json) own the frontend commands.

## Documentation

Start with the [documentation index](docs/README.md) for operational guides,
architecture, and frontend design guidance. Implementation plans and exploration
records are kept separately from current product documentation.

## License

[MIT](LICENSE)
