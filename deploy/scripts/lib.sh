#!/usr/bin/env bash
# Shared helpers for the Pi scripts. Source it, do not execute it.
# shellcheck shell=bash

VIAJECITO_ROOT="${VIAJECITO_ROOT:-/srv/viajecito}"
# pi.env holds host-only values (images, tunnel token, backups); api.env holds the api container's variables.
PI_ENV_FILE="${PI_ENV_FILE:-$VIAJECITO_ROOT/pi.env}"
API_ENV_FILE="${API_ENV_FILE:-$VIAJECITO_ROOT/api.env}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# load_env FILE: export KEY=VALUE pairs from a docker-style env file WITHOUT executing it.
# Blank lines and comments are skipped. Values are taken literally (quotes are kept, nothing is
# expanded), exactly like compose's `format: raw`, so both parsers agree.
load_env() {
  local file="$1" line key value
  [[ -r "$file" ]] || die "cannot read env file: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
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

# provider_of VALUE: normalize WHATSAPP_PROVIDER (empty means the api default, gowa).
provider_of() { printf '%s' "${1:-gowa}"; }

# webhook_path PROVIDER: public path of the provider's webhook endpoint.
webhook_path() {
  case "$1" in
    gowa) printf '/hooks/gowa/' ;;
    waha) printf '/hooks/waha/' ;;
    *) die "unknown WHATSAPP_PROVIDER: $1" ;;
  esac
}

# webhook_secret_var PROVIDER: name of the api.env variable holding the signing secret.
webhook_secret_var() {
  case "$1" in
    gowa) printf 'GOWA_WEBHOOK_SECRET' ;;
    waha) printf 'WAHA_WEBHOOK_HMAC_KEY' ;;
    *) die "unknown WHATSAPP_PROVIDER: $1" ;;
  esac
}

# webhook_payload PROVIDER TOKEN: a message event from a NON-group chat, so the api must answer "ignored".
webhook_payload() {
  local provider="$1" token="$2"
  case "$provider" in
    gowa) printf '%s' '{"event":"message","device_id":"smoke","payload":{"id":"smoke-'"$token"'","chat_id":"5491100000000@s.whatsapp.net","from":"5491100000000@s.whatsapp.net","from_name":"smoke","body":"smoke test","timestamp":"2026-01-01T00:00:00Z","is_from_me":false}}' ;;
    waha) printf '%s' '{"event":"message","session":"smoke","payload":{"id":"smoke-'"$token"'","timestamp":1767225600,"from":"5491100000000@c.us","fromMe":false,"body":"smoke test","hasMedia":false}}' ;;
    *) die "unknown WHATSAPP_PROVIDER: $provider" ;;
  esac
}

# webhook_signature PROVIDER BODY: hex HMAC of BODY. The secret comes from $WEBHOOK_SECRET in the
# environment, never from argv (argv is world-readable in /proc). waha = SHA-512, gowa = SHA-256.
webhook_signature() {
  local algo
  case "$1" in
    gowa) algo=sha256 ;;
    waha) algo=sha512 ;;
    *) die "unknown WHATSAPP_PROVIDER: $1" ;;
  esac
  printf '%s' "$2" | ALGO="$algo" python3 -c 'import hashlib, hmac, os, sys; print(hmac.new(os.environ["WEBHOOK_SECRET"].encode(), sys.stdin.buffer.read(), getattr(hashlib, os.environ["ALGO"])).hexdigest())'
}

# webhook_headers PROVIDER SIGNATURE: the signature headers, one per line.
webhook_headers() {
  case "$1" in
    gowa) printf 'X-Hub-Signature-256: sha256=%s' "$2" ;;
    waha) printf 'X-Webhook-Hmac: %s\nX-Webhook-Hmac-Algorithm: sha512' "$2" ;;
    *) die "unknown WHATSAPP_PROVIDER: $1" ;;
  esac
}
