# TMail documentation

Start with the [project README](../README.md) to evaluate TMail, configure it,
and run the web application. Use the guides below for deployment, access policy,
and maintenance decisions.

## Guides

| Guide | Use it to |
|---|---|
| [Deployment and operations](deployment.md) | Choose Compose or systemd, schedule retention, secure the origin, and prepare upgrades or rollback |
| [Mailbox access](mailbox-access.md) | Understand public inboxes, password expiry, sessions, administrator access, and API entry points |
| [Architecture](architecture.md) | Understand service boundaries, persistence, security constraints, and design trade-offs |
| [Frontend design](design-guidelines.md) | Apply the interface's visual and interaction rules |
| [Contributor guidance](../AGENT.md) | Find development commands, browser checks, and repository conventions |

The running application's `/docs` page owns API request and response schemas.
The [configuration example](../config.example.json), [Compose manifest](../compose.yaml),
and [CI workflow](../.github/workflows/docker-publish.yml) own configuration and
release mechanics.

## Source navigation

| Area | Executable owners | Verification |
|---|---|---|
| SMTP policy and MX verification | [Policy daemon](../src/policy_daemon.py), [MX checker](../src/mx_checker.py) | [Policy tests](../tests/test_policy_daemon.py), [MX tests](../tests/test_mx_checker.py) |
| Web and admin API | [Public API](../src/api_server.py), [Admin API](../src/admin_api.py), [Models](../src/api_models.py) | [Public API tests](../tests/test_public_api.py), [Admin tests](../tests/test_admin_api.py) |
| Mailbox authentication | [Authentication](../src/api_auth.py), [State store](../src/api_state.py) | [Authentication tests](../tests/test_api_auth.py), [State tests](../tests/test_api_state.py) |
| Stalwart integration and retention | [JMAP client](../src/jmap_client.py), [Janitor](../src/email_janitor.py) | [JMAP tests](../tests/test_jmap_client.py), [Mail tests](../tests/test_jmap_mail.py), [Janitor tests](../tests/test_email_janitor.py) |
| Runtime files | [Configuration](../src/config.py), [Domain cache](../src/domain_cache.py) | [Config tests](../tests/test_config.py), [Cache tests](../tests/test_domain_cache.py) |
| Frontend | [Vue application](../frontend/src/), [Build configuration](../frontend/vite.config.ts) | [Frontend tests](../frontend/src/tests/), [Package scripts](../frontend/package.json) |
| Deployment | [Deployment scripts and units](../deploy/), [Docker assets](../docker/) | [Deployment tests](../tests/test_deploy_scripts.py), [Docker tests](../tests/test_docker_deployment.py) |

## Plans and exploration

[Implementation plans](../plans/) and [brainstorms](brainstorms/) preserve work
history and proposals. They do not replace the current guides or executable
contracts above.
