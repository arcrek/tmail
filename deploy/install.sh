#!/usr/bin/env bash
# Run from the project root on the existing Postfix/Stalwart host.
[ -n "$BASH_VERSION" ] || exec bash "$0" "$@"
set -euo pipefail

REMOTE_DIR="/opt/tmail-policy"
CONFIG_DIR="/var/lib/tmail-policy"
CONFIG_FILE="$CONFIG_DIR/config.json"
LEGACY_CONFIG="$REMOTE_DIR/config.json"
POLICY_SERVICE_FILE="deploy/tmail-policy.service"
API_SERVICE_FILE="deploy/tmail-api.service"
STAGE_DIR=""
BACKUP_DIR=""

cleanup() {
    status=$?
    trap - EXIT
    set +e
    if [ "$status" -ne 0 ] && [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/plan.json" ]; then
        python3 deploy/setup-mail.py restore "$BACKUP_DIR/runtime.json" "$BACKUP_DIR/plan.json" || \
            echo "ERROR: recovery incomplete; private recovery data retained at $BACKUP_DIR" >&2
    fi
    [[ "$STAGE_DIR" == /opt/.tmail-policy.stage.* ]] && rm -rf -- "$STAGE_DIR"
    if [ -n "$BACKUP_DIR" ]; then
        echo "==> Private setup backup retained at $BACKUP_DIR"
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[ "$(id -u)" -eq 0 ] || { echo "ERROR: must be run as root (use sudo)"; exit 1; }
exec 9>/run/lock/tmail-install.lock
flock -n 9 || { echo "ERROR: another TMail setup is running"; exit 1; }
umask 077
[ -f config.json ] || { echo "ERROR: config.json not found. Copy config.example.json to config.json and configure it first."; exit 1; }
[ -f "$POLICY_SERVICE_FILE" ] || { echo "ERROR: run from project root (deploy/tmail-policy.service not found)"; exit 1; }
[ -f "$API_SERVICE_FILE" ] || { echo "ERROR: deploy/tmail-api.service not found"; exit 1; }

echo "==> Creating secure release stage"
STAGE_DIR=$(mktemp -d /opt/.tmail-policy.stage.XXXXXX)
mkdir -p "$STAGE_DIR/src" "$STAGE_DIR/deploy"

if [ -L "$CONFIG_FILE" ] || [ -e "$CONFIG_FILE" ]; then
    echo "==> Snapshotting existing runtime config"
    runuser -u tmail-policy -- cat -- "$CONFIG_FILE" > "$STAGE_DIR/config.json"
elif [ -L "$LEGACY_CONFIG" ] || [ -e "$LEGACY_CONFIG" ]; then
    echo "==> Snapshotting legacy production config"
    runuser -u tmail-policy -- cat -- "$LEGACY_CONFIG" > "$STAGE_DIR/config.json"
    touch "$STAGE_DIR/.legacy-config"
else
    echo "==> Staging initial config"
    install -m 600 config.json "$STAGE_DIR/config.json"
fi
chmod 600 "$STAGE_DIR/config.json"

echo "==> Copying staged release"
cp requirements.txt "$STAGE_DIR/requirements.txt"
cp src/*.py "$STAGE_DIR/src/"
cp "$POLICY_SERVICE_FILE" "$API_SERVICE_FILE" deploy/tmail-janitor.service \
    deploy/tmail-janitor.timer deploy/accepted_domains deploy/release.sh \
    deploy/setup-mail.py deploy/tmail-janitor-docker.conf "$STAGE_DIR/deploy/"

echo "==> Securing staged release"
chown -R root:root "$STAGE_DIR"
find "$STAGE_DIR" -type d -exec chmod 755 {} +
find "$STAGE_DIR" -type f ! -path "$STAGE_DIR/config.json" -exec chmod 644 {} +
chmod 755 "$STAGE_DIR/deploy/release.sh"
chmod 600 "$STAGE_DIR/config.json"

echo "==> Validating staged web config"
(cd "$STAGE_DIR" && PYTHONPATH="$STAGE_DIR" python3 -m src.config validate-web "$STAGE_DIR/config.json")

echo "==> Checking compatibility and deployment ownership (no configuration changes)"
BACKUP_DIR=$(mktemp -d /var/backups/tmail-setup.XXXXXX)
chmod 700 "$BACKUP_DIR"
install -m 600 "$STAGE_DIR/config.json" "$BACKUP_DIR/runtime.json"
python3 deploy/setup-mail.py preflight "$BACKUP_DIR/runtime.json" "$BACKUP_DIR/plan.json"
WEB_OWNER=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["owner"])' "$BACKUP_DIR/plan.json")

if [ "$WEB_OWNER" = systemd ]; then
    FRONTEND_DIST=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("frontend_dist", "/opt/tmail-policy/frontend/dist"))' "$BACKUP_DIR/runtime.json")
    if [ "$FRONTEND_DIST" = "$REMOTE_DIR/frontend/dist" ]; then
        mkdir -p "$STAGE_DIR/frontend"
        if [ -f frontend/dist/index.html ]; then
            cp -a frontend/dist "$STAGE_DIR/frontend/dist"
        else
            cp -a "$FRONTEND_DIST" "$STAGE_DIR/frontend/dist"
        fi
        chown -R root:root "$STAGE_DIR/frontend"
        find "$STAGE_DIR/frontend" -type d -exec chmod 755 {} +
        find "$STAGE_DIR/frontend" -type f -exec chmod 644 {} +
    fi
fi

python3 deploy/setup-mail.py validate-release "$BACKUP_DIR/runtime.json" "$STAGE_DIR" "$REMOTE_DIR" "$WEB_OWNER"

echo "==> Preparing service runtime directory"
id tmail-policy &>/dev/null || useradd -r -s /sbin/nologin tmail-policy
if [ ! -d "$CONFIG_DIR" ]; then
    install -d -m 700 -o tmail-policy -g tmail-policy "$CONFIG_DIR"
fi

# Compare before dependency installation so unchanged runs need no package work.
if ! bash deploy/release.sh --unchanged "$STAGE_DIR" "$REMOTE_DIR" "$WEB_OWNER"; then
    echo "==> Preparing isolated Python dependencies"
    python3 -m venv --copies "$STAGE_DIR/.venv"
    "$STAGE_DIR/.venv/bin/python" -m pip install -r "$STAGE_DIR/requirements.txt"
    chown -R root:root "$STAGE_DIR/.venv"
    chmod -R a+rX "$STAGE_DIR/.venv"
fi

echo "==> Applying only required mail configuration changes"
python3 deploy/setup-mail.py apply "$BACKUP_DIR/runtime.json" "$BACKUP_DIR/plan.json"

echo "==> Promoting and verifying staged release"
export TMAIL_WEB_OWNER="$WEB_OWNER"
export TMAIL_RELEASE_VERIFY="$REMOTE_DIR/deploy/setup-mail.py"
export TMAIL_SETUP_PLAN="$BACKUP_DIR/plan.json"
bash "$STAGE_DIR/deploy/release.sh" "$STAGE_DIR" "$REMOTE_DIR"
STAGE_DIR=""
echo "==> Setup verified; existing web owner preserved ($WEB_OWNER)"
