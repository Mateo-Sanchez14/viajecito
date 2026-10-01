#!/usr/bin/env bash
# Post-deploy smoke test, run on the Pi. Exits non-zero if any check fails.
# Toggles: SMOKE_SKIP_SYSTEMD=1 (timers not installed yet), SMOKE_SKIP_RESTIC=1 (before the first backup).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
# The provider and its webhook secret live in api.env; they are only read here to sign the probe request.
load_env "$API_ENV_FILE"
require_cmd curl python3
provider="$(provider_of "${WHATSAPP_PROVIDER:-}")"
secret_var="$(webhook_secret_var "$provider")"
hook_path="$(webhook_path "$provider")"
require_var PUBLIC_HOST "$secret_var"
origin="https://${PUBLIC_HOST}"

failures=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# 1. public health through the tunnel
if body="$(curl -fsS -m 15 "$origin/api/health" 2>&1)" && [[ "$body" =~ \"status\"[[:space:]]*:[[:space:]]*\"ok\" ]]; then
  pass "GET $origin/api/health -> 200 status ok"
else
  fail "GET $origin/api/health (got: ${body:-nothing})"
fi

# 2. signed webhook from a non-group chat must be accepted by the signature check and ignored
payload="$(webhook_payload "$provider" "$(date -u +%s)")"
# The secret travels through the environment, never through argv (argv is world-readable in /proc).
sig="$(WEBHOOK_SECRET="${!secret_var}" webhook_signature "$provider" "$payload")"
webhook_curl_header_args "$provider" "$sig"
if resp="$(curl -sS -m 15 -X POST "$origin$hook_path" \
  -H 'Content-Type: application/json' \
  ${WEBHOOK_CURL_HEADER_ARGS[@]+"${WEBHOOK_CURL_HEADER_ARGS[@]}"} \
  --data-binary "$payload" 2>&1)" && [[ "$resp" =~ \"status\"[[:space:]]*:[[:space:]]*\"ignored\" ]]; then
  pass "signed POST $origin$hook_path ($provider) -> ignored"
else
  fail "signed POST $origin$hook_path (expected status ignored, got: ${resp:-nothing})"
fi

# 3. systemd timers
if [[ "${SMOKE_SKIP_SYSTEMD:-0}" == "1" ]]; then
  printf 'skip  systemd timers (SMOKE_SKIP_SYSTEMD=1)\n'
else
  # is-active with several units succeeds if ANY is active, so check each timer on its own.
  for timer in viajecito-tick.timer viajecito-backup.timer; do
    if systemctl is-active --quiet "$timer"; then pass "$timer is active"; else fail "$timer is not active"; fi
  done
fi

# 4. restic repository: must be initialized and hold at least one snapshot
if [[ "${SMOKE_SKIP_RESTIC:-0}" == "1" ]]; then
  printf 'skip  restic (SMOKE_SKIP_RESTIC=1)\n'
elif ! command -v restic >/dev/null 2>&1; then
  fail "restic is not installed"
else
  export_restic
  if ! restic cat config >/dev/null 2>&1; then
    fail "restic repository is not reachable or not initialized (run restic.sh init, or SMOKE_SKIP_RESTIC=1 before the first backup)"
  elif snaps="$(restic snapshots --json --latest 1 2>&1)" && [[ "$snaps" != "[]" && "$snaps" != "null" && -n "$snaps" ]]; then
    pass "restic has at least one snapshot"
  else
    fail "restic has no snapshot yet (run: sudo systemctl start viajecito-backup.service)"
  fi
fi

if [[ "$failures" -gt 0 ]]; then
  log "smoke: $failures check(s) failed"
  exit 1
fi
log "smoke: all checks passed"
