#!/usr/bin/env bash
# Restrict one nginx site (server block) to Cloudflare's published IP ranges only.
# Run this directly on the origin VPS, as root, against the nginx vhost file for
# the tmail domain — it does NOT touch the OS firewall, only that nginx site.
#
# Usage: sudo bash cloudflare-nginx-allowlist.sh /etc/nginx/sites-enabled/tmail.conf
#
# Safe to re-run: refreshes the Cloudflare IP list each time and reloads nginx;
# only inserts the `include` line into the site file once (idempotent).
set -euo pipefail

SITE_CONF="${1:?Usage: $0 <path-to-nginx-site-conf>}"
SNIPPET=/etc/nginx/snippets/cloudflare-allow.conf
MARK_BEGIN="# BEGIN cloudflare-allow (managed by cloudflare-nginx-allowlist.sh)"
MARK_END="# END cloudflare-allow"

[ "$(id -u)" -eq 0 ] || { echo "ERROR: must run as root (sudo)"; exit 1; }
[ -f "$SITE_CONF" ] || { echo "ERROR: $SITE_CONF not found"; exit 1; }
command -v nginx >/dev/null || { echo "ERROR: nginx not found"; exit 1; }

echo "==> Fetching Cloudflare IP ranges"
mkdir -p /etc/nginx/snippets
{
    echo "# Managed by cloudflare-nginx-allowlist.sh — do not edit by hand"
    echo "# Regenerated: $(date -u +%FT%TZ)"
    curl -fsS https://www.cloudflare.com/ips-v4 | sed -e 's/^/    allow /' -e 's/$/;/'
    curl -fsS https://www.cloudflare.com/ips-v6 | sed -e 's/^/    allow /' -e 's/$/;/'
    echo "    deny all;"
} > "$SNIPPET.new"
mv "$SNIPPET.new" "$SNIPPET"

echo "==> Wiring $SITE_CONF to the snippet"
if grep -qF "$MARK_BEGIN" "$SITE_CONF"; then
    echo "    already wired — only the IP list was refreshed"
else
    BACKUP="$SITE_CONF.bak.$(date +%s)"
    cp --preserve=mode,ownership,timestamps "$SITE_CONF" "$BACKUP"
    echo "    backed up original to $BACKUP"
    # Insert right after the first "server_name ...;" line, so it applies to the
    # whole server block (every location in this site), not just one path.
    awk -v begin="    $MARK_BEGIN" -v mid="    include $SNIPPET;" -v end="    $MARK_END" '
        { print }
        /^\s*server_name[[:space:]]/ && !done { print begin; print mid; print end; done=1 }
    ' "$SITE_CONF" > "$SITE_CONF.new"
    if ! grep -qF "$MARK_BEGIN" "$SITE_CONF.new"; then
        echo "ERROR: no \"server_name ...;\" line found in $SITE_CONF — insert manually:"
        echo "    include $SNIPPET;"
        rm -f "$SITE_CONF.new"
        exit 1
    fi
    mv "$SITE_CONF.new" "$SITE_CONF"
fi

echo "==> Testing nginx config"
nginx -t

echo "==> Reloading nginx"
systemctl reload nginx

echo "==> Done. $SITE_CONF now returns 403 for anything outside Cloudflare's ranges."
echo "    Note: this is an application-layer (nginx) block, not an OS firewall block —"
echo "    the TCP port itself stays open and answers with 403 to non-Cloudflare IPs."
echo ""
echo "==> To keep the IP list current, schedule a periodic re-run, e.g. via cron:"
echo "    0 3 * * 0 root bash $(readlink -f "$0") $SITE_CONF >>/var/log/cloudflare-allowlist.log 2>&1"
