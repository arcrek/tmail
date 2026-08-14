---
name: run-tmail
description: Build, launch, and drive tmail (FastAPI policy daemon + public inbox + admin console) end to end in a headless container — start the fake-JMAP backend, run the Playwright driver against the real Vue app, probe the policy daemon's MX-health path, and take screenshots. Use for "run tmail", "start the app", "screenshot the inbox/admin console", "live browser check", or "does this change actually work".
---

# Running tmail (headless, no real Stalwart, no sudo)

Paths below are relative to the repo root (`<repo>/`), not this skill
directory. The skill's own files live at
`.claude/skills/run-tmail/{setup.sh,driver.mjs,fake_jmap_server.py,
policy_probe.py,make_config.py}`.

tmail is a real FastAPI app (public inbox + admin console) fronting a
Stalwart JMAP mailbox, plus a separate `policy_daemon` process that
Postfix calls per-recipient over a tiny line protocol. There's no
Stalwart in this container, so **`fake_jmap_server.py` runs the real
`create_app()` with `app.state.jmap` swapped for a `MagicMock`** — every
route, the rate limiter, the domain-policy matcher, and the SSE stream
are all real code; only the JMAP network calls are faked. The policy
daemon is driven with a real raw-socket client speaking Postfix's
protocol against real DNS.

## Prerequisites

No root needed. Verified in this container (no `sudo`, offline
`apt-get install` unavailable):

```bash
node -v   # v24.x — needed for playwright
python3 -c "import fastapi, uvicorn, dns.resolver"  # already in this repo's deps
```

## Setup (idempotent — rerun any time)

```bash
bash .claude/skills/run-tmail/setup.sh
```

This does, in order (all verified to work standalone, this container,
this session):
1. `cd frontend && npm install && npm run build` — **do not skip this**,
   see Gotchas: a stale `frontend/dist` silently ships without recent
   features and no error is raised anywhere.
2. `npm install` + `npx playwright install chromium` inside the skill
   dir (kept separate from `frontend/`'s `node_modules`).
3. Builds a private Chromium runtime-lib sysroot with **no root**:
   `apt-get download <pkgs>` (download-only needs no privilege) then
   `dpkg-deb -x *.deb .cache/sysroot` for each. Skipped if already built.
4. Writes an isolated dev config (`.cache/run/config.json` +
   `config_daemon.json`, one field apart: `listen_port`) via
   `make_config.py`.
5. Verifies Chromium actually launches with the sysroot on
   `LD_LIBRARY_PATH`.

## Run (agent path)

**Backgrounding gotcha first:** use `setsid ... &` **as the entire
command**, not `cmd & disown` and not chained after `pkill; sleep; …`.
In this container, `nohup x & disown` chained with other commands in
the same tool call was silently reaped between tool calls (port back
to closed, log stops mid-line) more than once this session; a bare
`setsid nohup … < /dev/null &` in its own tool call was not.

**1. Start the fake-JMAP web app** (public inbox + admin console):

```bash
cd <repo>
setsid nohup python3 .claude/skills/run-tmail/fake_jmap_server.py \
  .claude/skills/run-tmail/.cache/run --reset --port 8099 \
  > .claude/skills/run-tmail/.cache/run/server.log 2>&1 < /dev/null &
sleep 2 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8099/
```

`--reset` wipes `state.db`/`domains.json` first — **always pass it**
before a driver run; the admin flow below permanently saves a
blacklist rule, so a second run without `--reset` starts from "0
domains available" (see Gotchas).

**2. Drive it with Playwright** (screenshots to `.cache/run/shots/`):

```bash
cd .claude/skills/run-tmail
LD_LIBRARY_PATH="$PWD/.cache/sysroot/usr/lib/x86_64-linux-gnu" \
  node driver.mjs
```

Exercises, against the real app:
- public: create an address (`#local-part` → submit) → real
  `/accounts` + `/token` + `/messages` → 2 fake messages render →
  client-side search filter (`#message-search`) narrows the list.
- admin: login (`#admin-password`) → Dashboard tab (stats + MX
  health) → Domains & Inbox tab → save a wildcard blacklist rule
  (`*.example.com`) → toast confirms.

Prints `NO CONSOLE ERRORS` or lists any browser console errors, then
`DONE`. A stray `401` from `GET /admin/api/session` right before login
is expected (the SPA probes for an existing session first) — not a bug.

**3. Policy daemon / MX health** (separate process, real DNS, no
Stalwart needed for this path — `mx_mismatch`/`mx_lookup_error` never
call JMAP):

```bash
cd <repo>
TMAIL_CONFIG="$PWD/.claude/skills/run-tmail/.cache/run/config_daemon.json" \
  setsid nohup python3 -m src.policy_daemon \
  > .claude/skills/run-tmail/.cache/run/daemon.log 2>&1 < /dev/null &
sleep 2

python3 .claude/skills/run-tmail/policy_probe.py 127.0.0.1 10099 google.com
python3 .claude/skills/run-tmail/policy_probe.py 127.0.0.1 10099 \
  "$(python3 -c 'print("a"*300 + ".test")')"
```

`google.com` has a real MX that will never equal this project's
configured `mx_hostname` → `mx_mismatch`. The 300-octet label makes
`dnspython` raise before any network call → `mx_lookup_error`. Both
land in the same `state.db` the web app reads, so re-running
`driver.mjs` afterward shows them live under Dashboard → "Recent MX
failures" (screenshot `04-dashboard.png`).

**Must run from `<repo>` root**, not from inside the skill dir:
`python3 -m src.policy_daemon` needs `src` importable as a top-level
package (`ModuleNotFoundError: No module named 'src'` otherwise).

**Stop everything:**

```bash
pkill -9 -f fake_jmap_server.py; pkill -9 -f src.policy_daemon
sleep 1
ss -ltnp 2>/dev/null | grep -E '8099|10099'   # empty output = both stopped
```

`pkill -f` was unreliable in this container — it sometimes missed a
still-running `src.policy_daemon` even with `-9`. If the `ss` check
above still shows a listener, kill it by pid directly:
`kill -9 $(ss -ltnp | grep 10099 | grep -oP 'pid=\K[0-9]+')`.

## Run (human path)

`README.md`'s own instructions (`python -m src.api_server` against a
real `config.json` + real Stalwart) are the production path — not
reproduced here since this skill's whole point is running without
Stalwart. If a real Stalwart is reachable, point `config.json` at it
and skip `fake_jmap_server.py` entirely; `driver.mjs` still works
unmodified against a real backend on the same port.

## Gotchas

- **Stale `frontend/dist` is invisible.** It's gitignored, so nothing
  flags it as out of date, and the server happily serves it — a
  feature can be fully committed in `frontend/src` and simply not
  exist in the running app. Caught live this session: `#message-search`
  was completely absent from the DOM (`.count() === 0`) until
  `npm run build` was rerun; the JS bundle hash changed
  (`index-BlcAcQZA.js` → `index-rDP63j-0.js`) and the element appeared.
  **Always rebuild before trusting a "does X work" check.**
- **Fake JMAP messages must address the requesting mailbox.**
  `api_server.py`'s `/messages` filters every message through
  `_message_belongs_to_address` (matches `to`/`cc`/`bcc`/`Delivered-To`
  against the bearer token's address) — a fixture with a message
  hardcoded to `box@example.com` silently returns 0 messages for any
  other address created in the test. `fake_jmap_server.py`'s
  `list_messages` mock builds the message's `to` from the actual
  `address` argument for this reason.
- **`message_counts` unset on the fake JMAP renders `NaN`** on the
  Dashboard's three message tiles — not an app bug, just an unmocked
  `MagicMock` attribute. `fake_jmap_server.py` sets a fixed
  `{"stored": 2, "today": 2, "sevenDays": 2}`.
- **The admin driver flow is not idempotent against server state.**
  It saves `blacklistedDomains: ["*.example.com"]` for real. Run it
  twice against the same `state.db` without `--reset` and the second
  run's public-inbox screenshots show "No receiving domains are
  available" instead of the address form, because `example.com` (the
  only cached domain) is now denied with no whitelist exception.
  Always `--reset` between driver runs.
- **Rate limiter is a shared in-memory window per server process.**
  Firing 10+ requests at `POST /accounts` (e.g. while poking the
  limiter by hand) consumes the same window `driver.mjs`'s address
  creation needs — a subsequent driver run against the *same still-running*
  server can 429 on step 1. Restart the server (or wait out the
  60s window) after any manual rate-limit probing.
- **`python3 -m src.policy_daemon` needs repo-root cwd** — importing
  `src.policy_daemon` as `-m` fails with `ModuleNotFoundError: No
  module named 'src'` from any other directory (unlike
  `fake_jmap_server.py`, which does its own `sys.path.insert`).
- **No sudo, no apt-get install** — but `apt-get download <pkg>` (no
  install, no root) plus `dpkg-deb -x pkg.deb sysroot/` works fine and
  is exactly what `setup.sh` does for Chromium's missing
  `libnspr4`/`libnss3`/`libasound.so.2`/etc. `chromium.launch()` fails
  with `error while loading shared libraries: libnspr4.so: cannot open
  shared object file` without `LD_LIBRARY_PATH` pointed at that sysroot.
- **Node ESM resolves `import 'playwright'` relative to the *script
  file's* path, not `cwd`.** Running `node -e "import('playwright')…"`
  from the skill directory fails (`ERR_MODULE_NOT_FOUND`) unless the
  code lives in an actual `.mjs` file inside a directory whose
  `node_modules` has playwright (i.e. `.claude/skills/run-tmail/`,
  where `setup.sh` installs it) — this is why `driver.mjs` and
  `verify_chromium.mjs` are real files, not inline `node -e`.
- **`setsid nohup … & disown` chained with other commands in the same
  tool call gets reaped between tool calls in this container** — the
  process exists for the current call but the port is closed on the
  next one, with no error printed. A bare `setsid nohup … < /dev/null &`
  as the entire command (no `disown`, nothing chained after it)
  reliably survives.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `error while loading shared libraries: libnspr4.so…` | `LD_LIBRARY_PATH` isn't set, or `setup.sh` didn't finish building `.cache/sysroot`. Re-run `setup.sh`. |
| `ERR_MODULE_NOT_FOUND: playwright` | You're running a script that isn't inside `.claude/skills/run-tmail/` (or its `.cache/run/`), or `npm install` in the skill dir wasn't run. |
| `[Errno 98] address already in use` on port 8099/10099 | A previous run's server/daemon is still alive (background processes survive across tool calls). `ss -ltnp \| grep -E '8099\|10099'`, kill the owning pid, retry. |
| `page.waitForSelector('#local-part')` times out, screenshot shows "No receiving domains are available" | Stale blacklist from a prior unreset run. Restart `fake_jmap_server.py` with `--reset`. |
| `ModuleNotFoundError: No module named 'src'` running the policy daemon | Run `python3 -m src.policy_daemon` from `<repo>` root, not from the skill directory. |
| Dashboard message tiles show `NaN` | Expected only if you swapped in your own fake JMAP without a `message_counts` mock — `fake_jmap_server.py` already sets one. |
