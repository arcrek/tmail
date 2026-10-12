#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE="${TMAIL_LOCK_FILE:-/run/lock/tmail-install.lock}"
if [ "$(readlink /proc/$$/fd/9 2>/dev/null || true)" != "$LOCK_FILE" ]; then
    exec 9>"$LOCK_FILE"
fi
flock -n 9 || { echo "ERROR: another TMail setup/release is running" >&2; exit 1; }

CHECK_ONLY=0
if [ "${1:-}" = --unchanged ]; then
    CHECK_ONLY=1
    shift
fi
STAGE_DIR="${1:?staged release path required}"
REMOTE_DIR="${2:?live release path required}"
SYSTEMD_DIR="${TMAIL_SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${TMAIL_SYSTEMCTL:-systemctl}"
CONFIG_DIR="${TMAIL_CONFIG_DIR:-/var/lib/tmail-policy}"
CONFIG_FILE="$CONFIG_DIR/config.json"
WEB_OWNER="${TMAIL_WEB_OWNER:-${3:-}}"
if [ -z "$WEB_OWNER" ]; then
    WEB_OWNER=$(python3 "$STAGE_DIR/deploy/setup-mail.py" owner "$REMOTE_DIR")
fi
case "$WEB_OWNER" in systemd|compose) ;; *) echo "ERROR: ambiguous web ownership" >&2; exit 1 ;; esac
UNITS=(
    tmail-policy.service
    tmail-janitor.service
    tmail-janitor.timer
)
if [ "$WEB_OWNER" = systemd ]; then
    UNITS+=(tmail-api.service)
elif "$SYSTEMCTL" is-active tmail-api.service >/dev/null 2>&1 \
    || "$SYSTEMCTL" is-enabled tmail-api.service >/dev/null 2>&1; then
    echo "ERROR: Compose ownership conflicts with systemd API" >&2
    exit 1
fi

unchanged() {
    [ -f "$CONFIG_FILE" ] && [ ! -f "$STAGE_DIR/.legacy-config" ] && [ -x "$REMOTE_DIR/.venv/bin/python" ] || return 1
    diff -qr --exclude=config.json --exclude=.legacy-config --exclude=.venv \
        --exclude=__pycache__ "$STAGE_DIR" "$REMOTE_DIR" >/dev/null || return 1
    for unit in "${UNITS[@]}"; do
        cmp -s "$STAGE_DIR/deploy/$unit" "$SYSTEMD_DIR/$unit" || return 1
    done
    for unit in tmail-policy.service tmail-janitor.timer; do
        "$SYSTEMCTL" is-active "$unit" >/dev/null 2>&1 || return 1
        "$SYSTEMCTL" is-enabled "$unit" >/dev/null 2>&1 || return 1
    done
    if [ "$WEB_OWNER" = systemd ]; then
        "$SYSTEMCTL" is-active tmail-api.service >/dev/null 2>&1 || return 1
        "$SYSTEMCTL" is-enabled tmail-api.service >/dev/null 2>&1 || return 1
    fi
}

verify_setup() {
    if [ -n "${TMAIL_RELEASE_VERIFY:-}" ]; then
        python3 "$TMAIL_RELEASE_VERIFY" verify "$CONFIG_FILE" "$TMAIL_SETUP_PLAN"
    fi
}

if [ "$CHECK_ONLY" -eq 1 ]; then
    unchanged
    exit $?
fi
if unchanged; then
    echo "==> Release unchanged; skipping promotion and restarts"
    verify_setup
    rm -rf -- "$STAGE_DIR"
    exit 0
fi
[ -x "$STAGE_DIR/.venv/bin/python" ] || {
    echo "ERROR: staged Python environment missing; prepare dependencies before promotion" >&2
    exit 1
}
ASSET_CONFIG="$STAGE_DIR/config.json"
if [ -f "$CONFIG_FILE" ]; then
    ASSET_CONFIG="$CONFIG_FILE"
fi
python3 "$STAGE_DIR/deploy/setup-mail.py" validate-release "$ASSET_CONFIG" "$STAGE_DIR" "$REMOTE_DIR" "$WEB_OWNER"
BACKUP_DIR=$(mktemp -d "$(dirname "$REMOTE_DIR")/.tmail-policy.backup.XXXXXX")
OLD_RELEASE=0
PROMOTED=0
UNITS_BACKED_UP=0
CONFIG_CREATED=0
CONFIG_ID=""

unit_activity() {
    local state
    state=$("$SYSTEMCTL" is-active "$1" 2>/dev/null)
    case "$state" in
        active|activating|reloading|deactivating) echo active ;;
        inactive|failed|unknown) echo inactive ;;
        *) echo inconclusive ;;
    esac
}

unit_enablement() {
    local state
    state=$("$SYSTEMCTL" is-enabled "$1" 2>/dev/null)
    case "$state" in
        enabled|enabled-runtime) echo enabled ;;
        disabled|not-found|static|indirect|masked|masked-runtime|generated|transient|alias|linked|linked-runtime)
            echo disabled
            ;;
        *) echo inconclusive ;;
    esac
}

stop_if_active() {
    case "$(unit_activity "$1")" in
        active) "$SYSTEMCTL" stop "$1" ;;
        inactive) return 0 ;;
        *) return 1 ;;
    esac
}

disable_if_enabled() {
    case "$(unit_enablement "$1")" in
        enabled) "$SYSTEMCTL" disable "$1" ;;
        disabled) return 0 ;;
        *) return 1 ;;
    esac
}

unit_matches_snapshot() {
    local unit=$1 snapshot
    if [ -e "$BACKUP_DIR/state/$unit.installing" ]; then
        snapshot="$BACKUP_DIR/installed/$unit"
        if [ ! -e "$BACKUP_DIR/state/$unit.installed" ] \
            && [ ! -e "$SYSTEMD_DIR/$unit" ] && [ ! -L "$SYSTEMD_DIR/$unit" ]; then
            return 0
        fi
        [ ! -L "$SYSTEMD_DIR/$unit" ] && cmp -s "$snapshot" "$SYSTEMD_DIR/$unit"
    elif [ -L "$BACKUP_DIR/units/$unit" ]; then
        [ -L "$SYSTEMD_DIR/$unit" ] \
            && [ "$(readlink "$BACKUP_DIR/units/$unit")" = "$(readlink "$SYSTEMD_DIR/$unit")" ]
    elif [ -e "$BACKUP_DIR/units/$unit" ]; then
        [ ! -L "$SYSTEMD_DIR/$unit" ] && cmp -s "$BACKUP_DIR/units/$unit" "$SYSTEMD_DIR/$unit"
    else
        [ ! -e "$SYSTEMD_DIR/$unit" ] && [ ! -L "$SYSTEMD_DIR/$unit" ]
    fi
}

preserve_concurrent_unit() {
    echo "ERROR: concurrent unit change preserved: $1" >&2
    : > "$BACKUP_DIR/state/$1.concurrent"
    rollback_failed=1
}

cleanup() {
    status=$?
    trap - EXIT
    set +e
    rollback_failed=0

    if [ "$status" -ne 0 ] && [ "$UNITS_BACKED_UP" -eq 1 ]; then
        for unit in "${UNITS[@]}"; do
            if ! unit_matches_snapshot "$unit"; then
                preserve_concurrent_unit "$unit"
                continue
            fi
            stop_if_active "$unit" || rollback_failed=1
            disable_if_enabled "$unit" || rollback_failed=1
        done

        if [ "$CONFIG_CREATED" -eq 1 ]; then
            # Config removal is safe only after systemd conclusively reports no API writer.
            if [ "$rollback_failed" -eq 0 ] && [ "$(unit_activity tmail-api.service)" = inactive ]; then
                runuser -u tmail-policy -- /usr/bin/python3 "$REMOTE_DIR/src/config.py" \
                    remove-runtime "$CONFIG_FILE" "$CONFIG_ID" || rollback_failed=1
            else
                rollback_failed=1
            fi
        fi
        if [ "$PROMOTED" -eq 1 ] && [ -e "$REMOTE_DIR" ]; then
            mv "$REMOTE_DIR" "$BACKUP_DIR/failed" || rollback_failed=1
        fi
        if [ "$OLD_RELEASE" -eq 1 ] && [ -e "$BACKUP_DIR/release" ]; then
            mv "$BACKUP_DIR/release" "$REMOTE_DIR" || rollback_failed=1
        fi

        for unit in "${UNITS[@]}"; do
            [ ! -e "$BACKUP_DIR/state/$unit.concurrent" ] || continue
            if ! unit_matches_snapshot "$unit"; then
                preserve_concurrent_unit "$unit"
                continue
            fi
            [ -e "$BACKUP_DIR/state/$unit.installing" ] || continue
            rm -f -- "$SYSTEMD_DIR/$unit" || rollback_failed=1
            if [ -e "$BACKUP_DIR/units/$unit" ] || [ -L "$BACKUP_DIR/units/$unit" ]; then
                cp -a -- "$BACKUP_DIR/units/$unit" "$SYSTEMD_DIR/$unit" || rollback_failed=1
            fi
        done
        "$SYSTEMCTL" daemon-reload || rollback_failed=1

        for unit in "${UNITS[@]}"; do
            [ ! -e "$BACKUP_DIR/state/$unit.concurrent" ] || continue
            if [ -e "$BACKUP_DIR/state/$unit.enabled" ]; then
                "$SYSTEMCTL" enable "$unit" || rollback_failed=1
            else
                disable_if_enabled "$unit" || rollback_failed=1
            fi
            if [ -e "$BACKUP_DIR/state/$unit.active" ]; then
                "$SYSTEMCTL" start "$unit" || rollback_failed=1
            else
                stop_if_active "$unit" || rollback_failed=1
            fi
        done
    fi

    if [ "$rollback_failed" -eq 0 ]; then
        rm -rf -- "$BACKUP_DIR"
    else
        echo "ERROR: rollback incomplete; recovery data retained at $BACKUP_DIR" >&2
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BACKUP_DIR/units" "$BACKUP_DIR/state" "$BACKUP_DIR/installed"
for unit in "${UNITS[@]}"; do
    [ -f "$STAGE_DIR/deploy/$unit" ]
    cp -- "$STAGE_DIR/deploy/$unit" "$BACKUP_DIR/installed/$unit"
    if [ -e "$SYSTEMD_DIR/$unit" ] || [ -L "$SYSTEMD_DIR/$unit" ]; then
        cp -a -- "$SYSTEMD_DIR/$unit" "$BACKUP_DIR/units/$unit"
    fi
    if "$SYSTEMCTL" is-enabled "$unit" >/dev/null 2>&1; then
        : > "$BACKUP_DIR/state/$unit.enabled"
    fi
    if "$SYSTEMCTL" is-active "$unit" >/dev/null 2>&1; then
        : > "$BACKUP_DIR/state/$unit.active"
    fi
done
UNITS_BACKED_UP=1

if [ -f "$STAGE_DIR/.legacy-config" ]; then
    if [ -e "$BACKUP_DIR/state/tmail-api.service.active" ]; then
        "$SYSTEMCTL" stop tmail-api.service
    fi
    CUTOVER_CONFIG=$(mktemp "$STAGE_DIR/.config.cutover.XXXXXX")
    runuser -u tmail-policy -- cat -- "$REMOTE_DIR/config.json" > "$CUTOVER_CONFIG"
    chmod 600 "$CUTOVER_CONFIG"
    (cd "$STAGE_DIR" && PYTHONPATH="$STAGE_DIR" /usr/bin/python3 -m src.config validate-web "$CUTOVER_CONFIG")
    mv "$CUTOVER_CONFIG" "$STAGE_DIR/config.json"
    rm -f -- "$STAGE_DIR/.legacy-config"
fi

for unit in "${UNITS[@]}"; do
    unit_matches_snapshot "$unit" || { echo "ERROR: unit changed during release: $unit" >&2; exit 1; }
    : > "$BACKUP_DIR/state/$unit.installing"
    rm -f -- "$SYSTEMD_DIR/$unit"
    install -m 644 "$STAGE_DIR/deploy/$unit" "$SYSTEMD_DIR/$unit"
    : > "$BACKUP_DIR/state/$unit.installed"
done

stop_if_active tmail-policy.service
if [ "$WEB_OWNER" = systemd ]; then
    stop_if_active tmail-api.service
fi
if [ -e "$REMOTE_DIR" ]; then
    mv "$REMOTE_DIR" "$BACKUP_DIR/release"
    OLD_RELEASE=1
fi
mv "$STAGE_DIR" "$REMOTE_DIR"
PROMOTED=1
if [ -L "$CONFIG_FILE" ] || [ -e "$CONFIG_FILE" ]; then
    :
else
    CONFIG_ID=$(runuser -u tmail-policy -- /usr/bin/python3 \
        "$REMOTE_DIR/src/config.py" install-runtime "$CONFIG_FILE" \
        < "$REMOTE_DIR/config.json")
    CONFIG_CREATED=1
fi
rm -f -- "$REMOTE_DIR/config.json"

"$SYSTEMCTL" daemon-reload
"$SYSTEMCTL" enable tmail-policy.service tmail-janitor.timer
"$SYSTEMCTL" restart tmail-policy.service
if [ "$WEB_OWNER" = systemd ]; then
    "$SYSTEMCTL" enable tmail-api.service
    "$SYSTEMCTL" restart tmail-api.service
fi
"$SYSTEMCTL" start tmail-janitor.timer
"$SYSTEMCTL" status tmail-policy.service --no-pager -l
verify_setup
