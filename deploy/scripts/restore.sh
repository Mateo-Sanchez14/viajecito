#!/usr/bin/env bash
# Restore a restic snapshot (database + media) into the stack. Run on the Pi, as root.
# Usage: restore.sh <snapshot-id|latest>
# The snapshot is extracted into /srv/viajecito/restore/ first (stack still running), then after an
# explicit confirmation the stack is stopped, the current DB and media are moved aside (never deleted),
# the restored copies are swapped in, and the stack is started again.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$here/lib.sh"

[[ $# -eq 1 ]] || die "usage: $0 <snapshot-id|latest>"
snapshot_id="$1"

load_env "$PI_ENV_FILE"
require_cmd docker restic
export_restic

data="$VIAJECITO_ROOT/data"
restore_dir="$VIAJECITO_ROOT/restore"
backups="$VIAJECITO_ROOT/backups"
mkdir -p "$backups"

exec 9>"$backups/.lock"
flock -n 9 || die "another backup or restore is running"

stopped=0
on_exit() {
  # If we stopped the stack and did not finish, bring it back so an abort never leaves it down.
  if [[ "$stopped" -eq 1 ]]; then
    log "restoring service state: starting the stack"
    dc up -d || true
  fi
}
trap on_exit EXIT

log "extracting snapshot '$snapshot_id' into $restore_dir"
rm -rf -- "$restore_dir"
mkdir -p "$restore_dir"
restic restore "$snapshot_id" --tag viajecito --target "$restore_dir"

restored_db=""
for f in "$restore_dir$VIAJECITO_ROOT"/backups/db-*.sqlite3; do
  [[ -e "$f" ]] && restored_db="$f"
done
[[ -n "$restored_db" ]] || die "no db-*.sqlite3 found in the snapshot"
restored_media="$restore_dir$VIAJECITO_ROOT/data/media"

log "restored database: $restored_db"
if [[ -d "$restored_media" ]]; then log "restored media:    $restored_media"; else log "snapshot has no media directory"; fi
printf 'This REPLACES %s and %s/media (the current copies are kept as *.pre-restore-*).\nType "restore" to continue: ' "$data/db.sqlite3" "$data" >&2
read -r answer
[[ "$answer" == "restore" ]] || die "aborted, nothing was changed (extracted files remain in $restore_dir)"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
log "stopping the stack"
stopped=1
dc stop

mkdir -p "$data"
if [[ -e "$data/db.sqlite3" ]]; then mv -- "$data/db.sqlite3" "$data/db.sqlite3.pre-restore-$ts"; fi
rm -f -- "$data/db.sqlite3-wal" "$data/db.sqlite3-shm"
cp -- "$restored_db" "$data/db.sqlite3"

if [[ -d "$restored_media" ]]; then
  if [[ -d "$data/media" ]]; then mv -- "$data/media" "$data/media.pre-restore-$ts"; fi
  cp -a -- "$restored_media" "$data/media"
fi

# The api container runs as uid 1000.
if [[ "$EUID" -eq 0 ]]; then
  chown -R 1000:1000 "$data/db.sqlite3" "$data/media" 2>/dev/null || chown 1000:1000 "$data/db.sqlite3"
else
  log "WARN: not root, make sure $data/db.sqlite3 and $data/media are owned by uid 1000"
fi

log "starting the stack"
dc up -d
stopped=0
log "restore complete; run $here/smoke.sh to verify. Old copies: *.pre-restore-$ts under $data"
