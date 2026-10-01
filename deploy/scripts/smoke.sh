#!/usr/bin/env bash
# Post-deploy smoke test, run on the Pi. Exits non-zero if any check fails.
# Toggles: SMOKE_SKIP_SYSTEMD=1 (timers not installed yet), SMOKE_SKIP_RESTIC=1.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
require_cmd curl openssl
require_var PUBLIC_ORIGIN GOWA_WEBHOOK_SECRET
origin="${PUBLIC_ORIGIN%/}"

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
sig="$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$GOWA_WEBHOOK_SECRET" | awk '{print $NF}')"
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
elif systemctl is-active --quiet viajecito-tick.timer viajecito-backup.timer; then
  pass "viajecito-tick.timer and viajecito-backup.timer are active"
else
  fail "systemd timers not active (systemctl is-active viajecito-tick.timer viajecito-backup.timer)"
fi

# 4. restic repository
if [[ "${SMOKE_SKIP_RESTIC:-0}" == "1" ]]; then
  printf 'skip  restic (SMOKE_SKIP_RESTIC=1)\n'
elif ! command -v restic >/dev/null 2>&1; then
  fail "restic is not installed"
else
  export_restic
  if ! restic cat config >/dev/null 2>&1; then
    printf 'skip  restic repository is not initialized yet (run: restic init)\n'
  elif restic snapshots --latest 1 >/dev/null 2>&1; then
    pass "restic snapshots --latest 1"
  else
    fail "restic snapshots --latest 1"
  fi
fi

if [[ "$failures" -gt 0 ]]; then
  log "smoke: $failures check(s) failed"
  exit 1
fi
log "smoke: all checks passed"
