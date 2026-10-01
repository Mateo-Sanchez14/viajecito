#!/usr/bin/env bash
# Shared helpers for the Pi scripts. Source it, do not execute it.
# shellcheck shell=bash

VIAJECITO_ROOT="${VIAJECITO_ROOT:-/srv/viajecito}"
PI_ENV_FILE="${PI_ENV_FILE:-$VIAJECITO_ROOT/pi.env}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# load_env FILE: export KEY=VALUE pairs from a docker-style env file WITHOUT executing it.
# Blank lines and comments are skipped; one pair of matching surrounding quotes is stripped;
# no expansion of any kind happens (values are taken literally).
load_env() {
  local file="$1" line key value
  [[ -r "$file" ]] || die "cannot read env file: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "$key=$value"
    fi
  done <"$file"
}

# dc ARGS...: docker compose bound to the Pi project file and env file.
dc() {
  docker compose --env-file "$PI_ENV_FILE" -f "$VIAJECITO_ROOT/compose.pi.yml" "$@"
}

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"
  done
}

# require_var NAME...: fail unless every named variable is set and non-empty.
require_var() {
  local v
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || die "$v is empty or missing in $PI_ENV_FILE"
  done
}

# export_restic: map the BACKUP_RESTIC_* variables onto the names restic reads.
export_restic() {
  require_var BACKUP_RESTIC_REPOSITORY BACKUP_RESTIC_PASSWORD
  export RESTIC_REPOSITORY="$BACKUP_RESTIC_REPOSITORY"
  export RESTIC_PASSWORD="$BACKUP_RESTIC_PASSWORD"
}

# prune_local_snapshots DIR KEEP: delete all but the KEEP newest db-*.sqlite3 files in DIR.
# Names embed a sortable UTC timestamp, so lexical order is chronological order.
prune_local_snapshots() {
  local dir="$1" keep="$2" files=() f i
  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(printf '%s\n' "$dir"/db-*.sqlite3 | sort)
  [[ -e "${files[0]:-}" ]] || return 0
  for ((i = 0; i < ${#files[@]} - keep; i++)); do
    rm -f -- "${files[i]}"
  done
}
