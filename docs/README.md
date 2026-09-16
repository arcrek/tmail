# TMail Documentation

Welcome to the TMail documentation directory. TMail provides temporary-mail orchestration in front of Postfix and Stalwart.

TMail does not handle SMTP transport, TLS negotiation, or DNS resolution; it automates MX verification, JMAP domain provisioning, address normalization, and stateless temporary inbox access.

## Documentation Index

- **[System Architecture & Invariants](architecture.md)**: System topology, service boundaries, dual-store persistence model, security invariants, and the architectural decision ledger.
- **[Frontend Design Guidelines](design-guidelines.md)**: Visual design system (*Ember on Bone*), OKLCH/CSS token contracts, and typographic rules for the Vue 3 SPA.
- **[Operator Quickstart & Deployment](../README.md)**: Installation commands, Docker Compose setups, systemd deployment, and reverse proxy configuration.
- **[Agent Contributor Guidelines](../AGENT.md)**: Repository conventions, testing commands, runtime flags, and developer workflows.

## System Boundaries & Executable Owners

TMail separates responsibilities across dedicated subsystems. Detailed implementation behavior resides in code; the table below points to the authoritative owners for each subsystem:

| Subsystem | Responsibility | Executable Source | Test Suite | Deployment / Manifest |
|---|---|---|---|---|
| **Postfix Policy Daemon** | Synchronous SMTP recipient validation & auto-provisioning | [`src/policy_daemon.py`](../src/policy_daemon.py) | [`tests/test_policy_daemon.py`](../tests/test_policy_daemon.py) | [`deploy/postfix_main_snippet.cf`](../deploy/postfix_main_snippet.cf), [`deploy/tmail-policy.service`](../deploy/tmail-policy.service) |
| **Web & Admin API** | Public Hydra REST API, `/admin/api/*`, static asset hosting & SPA routing | [`src/api_server.py`](../src/api_server.py), [`src/admin_api.py`](../src/admin_api.py) | [`tests/test_public_api.py`](../tests/test_public_api.py), [`tests/test_admin_api.py`](../tests/test_admin_api.py) | [`deploy/tmail-api.service`](../deploy/tmail-api.service), [`compose.yaml`](../compose.yaml) |
| **Retention Janitor** | Scheduled purge of expired messages via JMAP batch queries | [`src/email_janitor.py`](../src/email_janitor.py) | [`tests/test_email_janitor.py`](../tests/test_email_janitor.py) | [`deploy/tmail-janitor.timer`](../deploy/tmail-janitor.timer), [`deploy/tmail-janitor.service`](../deploy/tmail-janitor.service) |
| **Public API Contracts** | Hydra/JMAP schema definitions and resource models | [`src/api_models.py`](../src/api_models.py) | [`tests/test_public_api.py`](../tests/test_public_api.py) | — |
| **Authentication & Tokens** | Address normalization and stateless HMAC bearer tokens | [`src/api_auth.py`](../src/api_auth.py) | [`tests/test_api_auth.py`](../tests/test_api_auth.py) | — |
| **Domain MX Verification** | DNS MX lookup and hostname matching | [`src/mx_checker.py`](../src/mx_checker.py) | [`tests/test_mx_checker.py`](../tests/test_mx_checker.py) | — |
| **Stalwart Integration** | Upstream JMAP protocol client for account and domain management | [`src/jmap_client.py`](../src/jmap_client.py) | [`tests/test_jmap_client.py`](../tests/test_jmap_client.py), [`tests/test_jmap_mail.py`](../tests/test_jmap_mail.py) | — |
| **Domain Cache** | Atomic JSON set of verified accepted domains for SMTP checks | [`src/domain_cache.py`](../src/domain_cache.py) | [`tests/test_domain_cache.py`](../tests/test_domain_cache.py) | `domains.json` |
| **State Storage** | SQLite store for site settings, sessions, unlock keys, and activity events | [`src/api_state.py`](../src/api_state.py) | [`tests/test_api_state.py`](../tests/test_api_state.py) | `state.db` |
| **Configuration** | File-based hot-reloading and device/inode identity verification | [`src/config.py`](../src/config.py) | [`tests/test_config.py`](../tests/test_config.py) | [`config.example.json`](../config.example.json) |
| **Frontend SPA** | Vue 3 + TypeScript single-page application | [`frontend/src/`](../frontend/src/) | [`frontend/src/tests/`](../frontend/src/tests/) | [`frontend/vite.config.ts`](../frontend/vite.config.ts) |
| **Deployment Automation** | Checkout installation, release promotion, and rollback automation | [`deploy/`](../deploy/) | [`tests/test_deploy_scripts.py`](../tests/test_deploy_scripts.py) | [`deploy/install.sh`](../deploy/install.sh), [`deploy/release.sh`](../deploy/release.sh) |

## Historical & Stateful Records

- **[`docs/brainstorms/`](brainstorms/)**: Exploration logs, feature discussions, and early architectural options.
- **[`plans/`](../plans/)**: Time-bounded implementation plans and historical execution phases.
