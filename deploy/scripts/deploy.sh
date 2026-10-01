#!/usr/bin/env bash
# Deploy / update the stack. Run ON the Pi (never over ssh from the repo): pull images, up -d,
# wait for api and web to be healthy, then smoke.sh. Exits non-zero on any failure.
# Env: DEPLOY_TIMEOUT seconds to wait for health (default 240).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
require_cmd docker
require_var GHCR_OWNER PUBLIC_ORIGIN

timeout="${DEPLOY_TIMEOUT:-240}"

mkdir -p "$VIAJECITO_ROOT/data" "$VIAJECITO_ROOT/backups"
owner="$(stat -c '%u' "$VIAJECITO_ROOT/data" 2>/dev/null || stat -f '%u' "$VIAJECITO_ROOT/data")"
if [[ "$owner" != "1000" ]]; then
  log "WARN: $VIAJECITO_ROOT/data is owned by uid $owner; the api container runs as uid 1000 (sudo chown 1000:1000 $VIAJECITO_ROOT/data)"
fi

log "pulling images (tag: ${IMAGE_TAG:-latest})"
dc pull
log "starting the stack"
dc up -d --remove-orphans

wait_healthy() {
  local service="$1" deadline cid status
  deadline=$((SECONDS + timeout))
  while ((SECONDS < deadline)); do
    cid="$(dc ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      [[ "$status" == "healthy" ]] && { log "$service is healthy"; return 0; }
    fi
    sleep 3
  done
  log "$service did not become healthy within ${timeout}s; last logs:"
  dc logs --tail 40 "$service" >&2 || true
  return 1
}

wait_healthy api || exit 1
wait_healthy web || exit 1

log "running smoke checks"
"$here/smoke.sh"
log "deploy ok"
