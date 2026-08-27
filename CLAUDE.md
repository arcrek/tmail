# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TMail: a temporary-mail service that sits in front of Postfix and Stalwart. Three cooperating pieces:

- **`policy_daemon`** (`src/policy_daemon.py`) — a tiny TCP line-protocol server Postfix's `check_recipient_access` calls per recipient. Looks up the domain's MX, and if it points at this server, provisions the domain in Stalwart via JMAP and caches it so future lookups skip the MX check.
- **`api_server`** (`src/api_server.py`, `src/admin_api.py`) — a FastAPI app serving both a public JMAP-flavored ("Hydra") REST API for the passwordless inbox and an `/admin/api/*` console for site settings, domain blocking, and access credentials. Also serves the built Vue SPA as static files and has a catch-all SPA route.
- **`email_janitor`** (`src/email_janitor.py`) — a standalone script (run via systemd timer, see `deploy/`) that deletes messages past `retention_days` from Stalwart.

Frontend is a Vue 3 + TypeScript SPA (`frontend/`) built with Vite, covering both the public inbox (`/`, `/{address}`) and the admin console (`/admin`).

This project does not manage DNS, configure TLS, or replace Postfix/Stalwart. A domain blocked in the admin console stays configured for mail delivery — blocking only removes it from the public site/API.

## Commands

### Backend

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# run all tests
.venv/bin/pytest

# run a single test file / test
.venv/bin/pytest tests/test_policy_daemon.py
.venv/bin/pytest tests/test_policy_daemon.py::test_name -v

# run the API server locally (needs config.json — see README "Configure")
TMAIL_CONFIG="$PWD/config.json" .venv/bin/python -m src.api_server

# run the policy daemon locally
TMAIL_CONFIG="$PWD/config.json" .venv/bin/python -m src.policy_daemon

# validate/install/remove runtime config (used by deploy scripts)
python3 -m src.config validate-web CONFIG
python3 -m src.config install-runtime CONFIG   # writes stdin to CONFIG, prints DEV:INO
python3 -m src.config remove-runtime CONFIG DEV:INO
```

There's no `pytest.ini`/`pyproject.toml`/conftest — plain pytest discovery over `tests/`.

### Frontend (run from `frontend/`)

```bash
npm install
npm run dev      # Vite dev server; proxies API paths (see vite.config.ts) to 127.0.0.1:8000
npm run build     # vue-tsc --noEmit type check, then vite build to frontend/dist
npm run test      # vitest run — single-run unit tests in frontend/src/tests/
npx vitest run frontend/src/tests/InboxView.test.ts   # single test file
npm run test:sandbox-browser   # scripts/message-sandbox-smoke.mjs, real-browser sandbox iframe check
```

### Running the whole app for a live check

Use the `run-tmail` skill (`.claude/skills/run-tmail/`) rather than improvising a manual setup — it starts a fake-JMAP FastAPI backend (real `create_app()` with only the JMAP client mocked), drives the real Vue app with Playwright, probes the policy daemon's MX-health path over a raw socket, and can take screenshots. No root/Stalwart required.

### Docker Compose

```bash
cp .env.example .env
docker compose up -d --build   # serves at http://127.0.0.1:8080 (TMAIL_HTTP_PORT to change)
```

## Architecture notes

**Config is file-based and hot-reloaded, not env-based.** `ConfigStore` (`src/config.py`) reloads `config.json` whenever its mtime changes; only the keys in `ConfigStore._EDITABLE` (`jmap_url`, `jmap_token`, `catchall_address`, `mail_account_id`, `retention_days`) can be changed via `ConfigStore.update()` (used by the admin "Mail Server" settings), written back atomically (tempfile + `os.replace` + fsync). `policy_daemon._runtime()` rebuilds the `JmapClient` whenever the JMAP connection fields change. In production the *release* directory is read-only; the *runtime* config lives in a separate writable path installed/removed via `src.config install-runtime`/`remove-runtime`, which pins the file by `(dev, inode)` identity to detect tampering — see `deploy/install.sh` and `deploy/deploy.sh` for how that's wired up.

**Two separate persistence layers.** `DomainCache` (`src/domain_cache.py`) is a simple JSON set of MX-verified accepted domains, consulted by the policy daemon on every SMTP recipient check — keep it fast. `StateStore` (`src/api_state.py`) is SQLite (`state.db`) and owns everything else: site settings (`DEFAULT_SETTINGS`), frozen/blacklisted/manual domain lists, admin sessions, access credentials + access sessions (the optional site-wide unlock gate), and an `activity` event log the policy daemon and API both write to (`record_event`). Both daemon and API process open their own handle to the same `state_db`/`cache_file` paths from `config.json` — they're independent OS processes, not sharing memory.

**Address/domain validation is centralized in `src/api_auth.py`.** `normalize_address()` is the single gate for turning a user-supplied address into a canonical `local@domain`, enforcing local-part length rules, domain matching against active/blocked/manual-domain lists (`_domain_matches_rule` supports `*.` wildcard rules), and IDNA. `AddressToken` in the same file is the stateless bearer token scheme for the public inbox — no server-side session per mailbox, the token itself encodes and HMAC-signs the address so any process holding the config secret can validate it.

**The public API mimics JMAP/Hydra shapes** (`src/api_models.py`: `HydraDomains`, `HydraMessages`, `HydraSearch`, etc.) even though it's a bespoke REST API, not literal JMAP — this is deliberate API design, not a JMAP passthrough. `admin_api.py`'s `/admin/api/*` router is separate, session-cookie-authenticated (`_session`/`_csrf` dependencies), and covers site config, domain sync/blocking, access credentials, and the dashboard.

**Message content is sandboxed via `postMessage` into a nonce'd iframe**, not rendered inline — see `_message_sandbox()` / `_SANDBOX_DOCUMENT` in `api_server.py` and `frontend/src/components/SandboxFrame.vue`. Don't bypass this when touching message rendering; it's the XSS boundary for arbitrary email HTML. `assetsInlineLimit: 0` in `vite.config.ts` is load-bearing for the same reason — the production CSP has no `font-src` override, so inlined fonts as `data:` URIs would be blocked.

**SPA routing collides with API routes at the top level** (`/`, `/{address}`, `/admin`, `/sandbox`, etc. all live under `/`). `_SPA_RESERVED` and `_POST_ONLY_ROUTES` in `api_server.py` are the reserved-word list that keeps a mailbox local-part like `admin@…` from being swallowed by the SPA catch-all — check them when adding new top-level routes.

## Repo conventions

- Feature work is planned under `plans/<YYMMDD-HHMM>-<slug>/` as a `plan.md` plus numbered `phase-NN-*.md` files before implementation (see `superpowers:writing-plans`/`executing-plans` skills). `docs/brainstorms/` holds earlier open-ended exploration docs.
- Deployment lives entirely under `deploy/` (systemd units, install/deploy/release scripts, Postfix snippet) — production is a checkout-based install (`deploy/install.sh`), not just the Docker Compose path.
- A host can legitimately run `tmail-api` via Docker Compose while `tmail-policy` (no Compose equivalent) stays on systemd — see README "Hybrid" section. `deploy/install.sh`/`release.sh` always install and enable `tmail-api.service` too; if Docker is actually serving the API on that host, disable that unit (`systemctl disable --now tmail-api.service`) or you get two processes with two independently-diverging `config.json` copies, only one of which nginx actually routes to.
