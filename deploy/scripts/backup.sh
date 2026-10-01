#!/usr/bin/env bash
# Daily backup, run on the Pi by viajecito-backup.service (also safe to run by hand).
# 1. SQLite online backup taken inside the api container (consistent while the app is writing)
# 2. restic backup of that snapshot + the media directory
# 3. restic retention, keep the last 7 local snapshots, optional healthchecks ping
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
require_cmd docker restic
export_restic

backups="$VIAJECITO_ROOT/backups"
media="$VIAJECITO_ROOT/data/media"
mkdir -p "$backups"

exec 9>"$backups/.lock"
flock -n 9 || die "another backup or restore is running"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
snapshot="$backups/db-$stamp.sqlite3"
partial="$snapshot.partial"
in_container="/tmp/viajecito-backup.sqlite3"

cleanup() {
  rm -f -- "$partial"
  dc exec -T api rm -f "$in_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "sqlite online backup -> $snapshot"
dc exec -T api python - "$in_container" <<'PY'
import os
import sqlite3
import sys

dest = sys.argv[1]
src = sqlite3.connect(os.environ["DATABASE_PATH"])
dst = sqlite3.connect(dest)
with dst:
    src.backup(dst)
result = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close()
src.close()
if result != "ok":
    sys.exit("integrity_check failed: " + result)
PY
dc exec -T api cat "$in_container" >"$partial"
[[ -s "$partial" ]] || die "backup file is empty"
mv -- "$partial" "$snapshot"

paths=("$snapshot")
if [[ -d "$media" ]]; then
  paths+=("$media")
else
  log "no media directory yet, backing up the database only"
fi

log "restic backup"
restic backup --tag viajecito "${paths[@]}"

log "restic forget (keep 7 daily, 4 weekly) and prune"
restic forget --tag viajecito --keep-daily 7 --keep-weekly 4 --prune

prune_local_snapshots "$backups" 7

if [[ -n "${HEALTHCHECKS_URL:-}" ]]; then
  curl -fsS -m 10 --retry 2 "$HEALTHCHECKS_URL" >/dev/null || log "WARN: healthchecks ping failed"
fi
log "backup done"
