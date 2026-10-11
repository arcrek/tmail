# Deployment and operations

Use this guide to choose a deployment model, preserve runtime state, and prepare
an upgrade. For initial configuration, start with the [README](../README.md#configure).

## Choose a deployment model

| Model | Web API and frontend | SMTP policy | Retention |
|---|---|---|---|
| Compose | Published images in [compose.yaml](../compose.yaml) | Host systemd service | Janitor inside the API container, scheduled by systemd |
| Systemd | Checkout-based release | Host systemd service | Host janitor, scheduled by systemd |

Postfix and Stalwart remain external prerequisites. Compose supplies only the
web services; it is not a complete mail-server installation. Keep one API
configuration owner and run the janitor against that owner's runtime settings.

## Compose deployment

Configure `config.json` before starting. The [base manifest](../compose.yaml)
uses published GHCR images; [compose.local.yml](../compose.local.yml) builds
from the checkout. Both persist runtime files in `tmail-data`.

On a new installation, the [API entrypoint](../docker/api-entrypoint.sh) seeds
runtime configuration from the mounted checkout file. Later edits to that seed
do not replace an existing runtime configuration. Admin changes write to the
runtime file in the volume.

The manifest defaults to `127.0.0.1:8081`; copying [.env.example](../.env.example)
changes the listener to `0.0.0.0:8080`. Set the bind address and port deliberately,
keep the listener behind an HTTPS reverse proxy, and avoid conflicts with the
Stalwart JMAP listener. Update the proxy upstream to match.

### Recorded production route

The following route was recorded in the project documentation. Confirm it on
the target host before using it; this guide is not a live deployment inventory.

The recorded production route runs the API and frontend with Docker Compose from
`/home/ubuntu/tmail/compose.yaml`. The Compose services use the GHCR API and
frontend images, and the named `tmail_tmail-data` volume persists the runtime
configuration, domain cache, and SQLite state. The seed configuration is the
deployment checkout's `/home/ubuntu/tmail/config.json`; the API container is
`tmail-api-1`. Use Docker volume inspection to confirm its host mountpoint;
do not assume a Docker storage directory.

For release preparation, backups, and rollback limits, follow
[upgrades and rollback](#upgrades-and-rollback).

Postfix must own port 25 and consult `inet:127.0.0.1:10030`, as shown in
[the Postfix snippet](../deploy/postfix_main_snippet.cf). Stalwart receives
accepted relay mail on port 2525.

### Service ownership

This topology keeps `tmail-policy.service` active for Postfix while
`tmail-api.service` remains inactive so only the Compose API owns web traffic.
The daily janitor runs inside `tmail-api-1` through
[the Docker janitor drop-in](../deploy/tmail-janitor-docker.conf) and
[the janitor timer](../deploy/tmail-janitor.timer), so it reads the
same persistent state as the API. Do not run a second API or a host janitor
against a different configuration path.

The host policy daemon is a separate configuration owner. Its
[systemd unit](../deploy/tmail-policy.service) reads the host
`/var/lib/tmail-policy/config.json`; the same path inside the API container is
in the Docker volume. With the supplied manifests these are separate files,
caches, and SQLite databases. Admin mail-server changes update only the API
copy, so credential rotation can leave the policy daemon unable to provision
new receiving domains even while web access and retention continue working.

When changing the shared Stalwart connection:

1. Update the API through `/admin`, and securely update the host policy runtime
   configuration with the corresponding token and catch-all address. Both must
   target the same Stalwart server, using a JMAP URL reachable from their own
   network context. Preserve each owner's paths and unrelated settings rather
   than copying one complete configuration over the other.
2. Publish the host configuration atomically, retaining its service ownership
   and mode `0600`, and validate it with the installed configuration module.
   Never put credential values into commands, logs, or documentation.
3. Restart `tmail-policy.service` after validation and verify provisioning with
   a receiving domain whose MX you control. Restarting alone does not copy the
   API settings into the host file.

The [policy runtime](../src/policy_daemon.py) reloads connection settings from
its own file. Policy-added cache entries and activity events remain in the host
stores; they do not appear directly in the Compose API's state. Use the admin
domain-sync action to refresh its domain list from Stalwart (or leave automatic
sync enabled). Domain sync does not import host activity events. Do not copy a
live SQLite database between these owners to reconcile them.

### Switching from systemd to Compose

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

The drop-in defaults to container `tmail-api-1`. If your Compose project uses
another name, set `Environment=TMAIL_API_CONTAINER=<container-name>` in a systemd
override. The API container must be running when the daily job fires: 03:00 in
the host timezone, with up to 30 minutes of randomized delay. The recorded
production host uses UTC.

Saving retention days takes effect at the next run; it does not immediately
delete old messages. To return to the host janitor, remove only
`/etc/systemd/system/tmail-janitor.service.d/docker.conf` and run
`sudo systemctl daemon-reload`.

`tmail-policy.service` has no Docker Compose equivalent in this repo (`compose.yaml` only defines
`api` and `frontend`) — Postfix still needs it running via systemd regardless of how you serve the
web API.

## Systemd deployment

[The installer](../deploy/install.sh) and [release script](../deploy/release.sh)
support a checkout-based deployment in which both `tmail-policy.service` and
`tmail-api.service` run under systemd. Run the installer from the repository root
after configuring `config.json`:

```bash
sudo bash deploy/install.sh
```

The installer configures Postfix and installs the service units. This route uses
`/var/lib/tmail-policy/config.json` as mutable runtime configuration and keeps
the release under `/opt/tmail-policy` read-only to the service. Frontend assets
must be built and available at the configured `frontend_dist`; the installer
does not build or copy them. Keep the systemd API disabled when Compose serves
the web application.

## Running behind Cloudflare

The recorded production route uses Cloudflare's DNS proxy. Unlike a Tunnel,
this leaves an origin listener that clients may reach directly unless access is
restricted.

The API's [`_client_ip`](../src/api_server.py) trusts `CF-Connecting-IP`
unconditionally. A client that bypasses the trusted proxy can forge the header
and evade per-visitor rate limits. Protect every route into the origin; edge
rules alone do not protect a directly reachable listener.

Restrict direct origin access to trusted Cloudflare traffic. Keep the Compose
listener on loopback behind the host proxy, or enforce an equivalent network
boundary on every exposed application port.

The repository provides [an nginx allowlist script](../deploy/cloudflare-nginx-allowlist.sh)
for the origin site. Read it before use: it updates nginx access rules and reloads
nginx; it does not configure an OS firewall. Ensure all relevant server blocks
are covered and no alternate port bypasses the proxy. Refresh the published IP
ranges regularly. The [nginx example](../deploy/nginx-tmail.conf.example) is a
starting point; adapt its hostname, certificate paths, and upstream port to the
actual deployment.

Keep verified TLS between the edge and origin. The existing deployment guidance
uses Cloudflare **Full (strict)** and recommends **Authenticated Origin Pulls**
for an additional origin authentication boundary.

### Forwarded headers

Enable `TMAIL_TRUST_FORWARD_HEADERS=on` only when the upstream proxy overwrites
forwarded headers. The [bundled nginx template](../docker/nginx.conf.template)
does not strip `CF-Connecting-IP`; the API trusts that header independently of
this setting. A deployment without Cloudflare must strip or overwrite it at the
trusted proxy so direct clients cannot choose their rate-limit identity.

## Upgrades and rollback

For Compose, prepare reviewed deployment input that pins both images to an
immutable revision or digest. The base manifest defaults to `latest`, which is
not a release pin. Stop existing API workers and retain a verified SQLite backup
before the new image can migrate the database. Start the services only after the
backup and image references are ready, then verify container health and the
running image revisions or digests.

Keep the configured SQLite path (`/var/lib/tmail-policy/state.db`
in the Compose `tmail-data` volume). Stop old API workers before upgrading.
Startup takes and verifies a consistent SQLite backup beside an existing
unversioned database, then applies additive schema changes atomically. Keep
backups private and verify them; copying only a live WAL database file is unsafe.
See [migration and authorization details](architecture.md#state-database-upgrades-and-mailbox-lifecycle).

Once protection is used, rollback must retain password enforcement or stop the
service. Never run the old passwordless application against protected state or
delete security records. A separately authorized backup restore can revive old
passwords and sessions. SMTP delivery and message retention are unchanged.

Before release, calibrate Argon2id on deployment-equivalent CPU, RAM, and worker
count. The current [hashing configuration](../src/api_auth.py) uses 32 MiB, two
passes, one lane, and two concurrent hash slots per process. Size aggregate
memory across workers and verify overload rejection. Record latency and peak
memory with headroom before tuning; do not go
below 19 MiB, two passes, and one lane. Local timings do not certify production.
