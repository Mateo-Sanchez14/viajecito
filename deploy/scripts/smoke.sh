#!/usr/bin/env bash
# Post-deploy smoke test, run on the Pi. Exits non-zero if any check fails.
# Toggles: SMOKE_SKIP_SYSTEMD=1 (timers not installed yet), SMOKE_SKIP_RESTIC=1 (before the first backup).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
# The webhook secret lives in api.env; it is only read here to sign the probe request.
load_env "$API_ENV_FILE"
require_cmd curl python3
require_var PUBLIC_HOST GOWA_WEBHOOK_SECRET
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
payload='{"event":"message","device_id":"smoke","payload":{"id":"smoke-'"$(date -u +%s)"'","chat_id":"5491100000000@s.whatsapp.net","from":"5491100000000@s.whatsapp.net","from_name":"smoke","body":"smoke test","timestamp":"2026-01-01T00:00:00Z","is_from_me":false}}'
# The secret travels through the environment, never through argv (argv is world-readable in /proc).
sig="$(printf '%s' "$payload" | SECRET="$GOWA_WEBHOOK_SECRET" python3 -c 'import hashlib, hmac, os, sys; print(hmac.new(os.environ["SECRET"].encode(), sys.stdin.buffer.read(), hashlib.sha256).hexdigest())')"
if resp="$(curl -sS -m 15 -X POST "$origin/hooks/gowa/" \
  -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: sha256=$sig" \
  --data-binary "$payload" 2>&1)" && [[ "$resp" =~ \"status\"[[:space:]]*:[[:space:]]*\"ignored\" ]]; then
  pass "signed POST $origin/hooks/gowa/ -> ignored"
else
  fail "signed POST $origin/hooks/gowa/ (expected status ignored, got: ${resp:-nothing})"
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
